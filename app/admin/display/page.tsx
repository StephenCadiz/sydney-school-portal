"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import { GLOBAL_LEVEL_ORDER, getGlobalLevelRank } from "../../../lib/classOrdering";
import { supabase } from "../../../lib/supabase";

type DisplayLevel = {
  name: string;
};

type CalendarItem = {
  id: string;
  label: string;
  start_time?: string | null;
  end_time?: string | null;
};

type CalendarGroup = {
  kind?: string;
  title?: string;
  event_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  items?: CalendarItem[];
};

type DisplayData = {
  levels: DisplayLevel[];
  friday: CalendarGroup | null;
};

const PORTAL_URL = "www.sydneyschoolsanfernando.com";
const PORTAL_LINK = "https://www.sydneyschoolsanfernando.com";
const CAMBRIDGE_LEVELS = new Set(["b1", "b2", "c1", "c2"]);

const fallbackLevels = GLOBAL_LEVEL_ORDER.filter(
  (level) => level !== "Support Classes"
).map((name) => ({ name }));

function formatDate(value?: string | null) {
  if (!value) return "Date to be confirmed";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(value?: string | null) {
  return String(value || "").slice(0, 5) || "Time to be confirmed";
}

function formatTimeRange(start?: string | null, end?: string | null) {
  const first = formatTime(start);
  const last = formatTime(end);
  if (first === "Time to be confirmed" && last === "Time to be confirmed") {
    return first;
  }
  return `${first}–${last}`;
}

function normalizeLevel(value: string) {
  return value.trim().toLocaleLowerCase();
}

function sortLevels(levels: DisplayLevel[]) {
  return [...levels].sort((first, second) => {
    const rankDifference = getGlobalLevelRank(first.name) - getGlobalLevelRank(second.name);
    if (rankDifference) return rankDifference;
    return first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
  });
}

function displayLevelList(levels: DisplayLevel[], predicate: (name: string) => boolean) {
  const selected = levels.filter((level) => predicate(normalizeLevel(level.name)));
  return selected.length ? selected : fallbackLevels.filter((level) => predicate(normalizeLevel(level.name)));
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`display-brand${compact ? " display-brand--compact" : ""}`}>
      <Image
        src="/LOGO and NAME.png"
        alt="Sydney School"
        width={compact ? 174 : 320}
        height={compact ? 60 : 110}
        style={{
          width: compact ? 174 : 320,
          height: compact ? 60 : 110,
        }}
        priority
      />
      {!compact && <span>Centro de Inglés · Sydney School</span>}
    </div>
  );
}

function SlideKicker({ children }: { children: React.ReactNode }) {
  return <p className="display-slide-kicker">{children}</p>;
}

function PhoneOutline({ variant }: { variant: "portal" | "app" }) {
  return (
    <div className={`display-phone-outline display-phone-outline--${variant}`} aria-hidden="true">
      <div className="display-phone-screen">
        <div className="display-phone-status"><span>9:41</span><span>•••</span></div>
        <div className="display-phone-app-header"><span className="display-phone-app-mark">S</span><strong>Sydney School</strong></div>
        {variant === "portal" ? (
          <>
            <div className="display-phone-welcome">Welcome back</div>
            <div className="display-phone-card"><strong>Current homework</strong><span>Open task</span></div>
            <div className="display-phone-card"><strong>Progress</strong><span>View results</span></div>
            <div className="display-phone-card"><strong>Messages</strong><span>Stay connected</span></div>
          </>
        ) : (
          <>
            <div className="display-phone-welcome">Your learning</div>
            <div className="display-phone-progress"><span /><span /><span /><span /><span /></div>
            <div className="display-phone-card"><strong>Homework</strong><span>1 item to review</span></div>
            <div className="display-phone-card"><strong>Resources</strong><span>Books and materials</span></div>
            <div className="display-phone-card"><strong>Messages</strong><span>Teacher updates</span></div>
          </>
        )}
        <div className="display-phone-tabbar"><span>⌂</span><span>▣</span><span>✉</span><span>☻</span></div>
      </div>
    </div>
  );
}

function DisplayPage() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [data, setData] = useState<DisplayData>({ levels: fallbackLevels, friday: null });
  const [dataState, setDataState] = useState<"loading" | "ready" | "unavailable">("loading");

  const loadDisplayData = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setDataState("unavailable");
        return;
      }

      const [levelsResult, fridayResult] = await Promise.all([
        supabase.from("levels").select("name").order("id", { ascending: true }),
        fetch("/api/calendar/upcoming-groups", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);

      const levels = levelsResult.error
        ? fallbackLevels
        : sortLevels(
            (levelsResult.data || [])
              .map((row) => ({ name: String(row.name || "").trim() }))
              .filter((row) => row.name)
          );
      const fridayPayload = await fridayResult.json().catch(() => ({}));
      const groups = Array.isArray(fridayPayload.groups)
        ? (fridayPayload.groups as CalendarGroup[])
        : [];
      const friday =
        groups.find((group) => group.kind === "friday_tutorial") ||
        groups.find((group) => group.kind === "friday_at_6") ||
        null;

      setData({ levels: levels.length ? levels : fallbackLevels, friday });
      setDataState("ready");
    } catch (error) {
      console.error("Unable to load Display presentation data:", error);
      setDataState("unavailable");
    }
  }, []);

  useEffect(() => {
    void loadDisplayData();
    const refreshId = window.setInterval(() => void loadDisplayData(), 5 * 60 * 1000);
    return () => window.clearInterval(refreshId);
  }, [loadDisplayData]);

  const goToSlide = useCallback((next: number) => {
    setSlideIndex((current) => {
      const resolved = typeof next === "number" ? next : current;
      return (resolved + 10) % 10;
    });
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const intervalId = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % 10);
    }, 8000);
    return () => window.clearInterval(intervalId);
  }, [isPaused]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        setSlideIndex((current) => (current + 1) % 10);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSlideIndex((current) => (current + 9) % 10);
      }
      if (event.key.toLowerCase() === "p") setIsPaused((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const cambridgeLevels = useMemo(
    () => displayLevelList(data.levels, (name) => CAMBRIDGE_LEVELS.has(name)),
    [data.levels]
  );
  const youngLearnerLevels = useMemo(
    () => displayLevelList(data.levels, (name) => !CAMBRIDGE_LEVELS.has(name) && name !== "support classes"),
    [data.levels]
  );
  const currentFridayItems = data.friday?.items || [];

  return (
    <main className="display-presentation">
      <div className="display-presentation-frame">
        <header className="display-presentation-topbar">
          <BrandMark compact />
          <div className="display-topbar-status">
            <span className="display-live-dot" aria-hidden="true" />
            <span>{isPaused ? "Paused" : "Live presentation"}</span>
          </div>
        </header>

        <section className="display-slide-stage" aria-live="polite">
          <div key={slideIndex} className={`display-slide display-slide--${slideIndex}`}>
            {slideIndex === 0 && (
              <div className="display-cover-slide">
                <div className="display-cover-orbit display-cover-orbit--one" />
                <div className="display-cover-orbit display-cover-orbit--two" />
                <BrandMark />
                <SlideKicker>Learning for life</SlideKicker>
                <h1>English that opens doors.</h1>
                <p className="display-lead">A welcoming school where every learner can build confidence, communicate clearly and keep moving forward.</p>
              </div>
            )}

            {slideIndex === 1 && (
              <div className="display-content-slide">
                <SlideKicker>Our school</SlideKicker>
                <h2>Personal teaching. Practical progress.</h2>
                <div className="display-two-column">
                  <div>
                    <p className="display-lead">Sydney School is a Centro de Inglés for children, teenagers and adults who want English to become part of everyday life.</p>
                    <p>Our teachers combine clear goals, regular feedback and a friendly classroom culture so learners know what they are working towards and why it matters.</p>
                  </div>
                  <div className="display-feature-stack">
                    <div><strong>Small steps</strong><span>Clear weekly targets and useful practice.</span></div>
                    <div><strong>Real support</strong><span>Teachers, tutorials and resources working together.</span></div>
                    <div><strong>Confident learners</strong><span>Progress that can be seen, discussed and celebrated.</span></div>
                  </div>
                </div>
              </div>
            )}

            {slideIndex === 2 && (
              <div className="display-content-slide">
                <SlideKicker>Our learning pathways</SlideKicker>
                <h2>One school, every stage of the journey.</h2>
                <p className="display-lead">The current levels in the portal are organised into Cambridge and Young Learner pathways.</p>
                <div className="display-pathway-grid">
                  <div className="display-pathway-card display-pathway-card--cambridge">
                    <span className="display-card-label">Cambridge</span>
                    <strong>{cambridgeLevels.map((level) => level.name).join("  ·  ")}</strong>
                    <p>Structured exam preparation with skills-based practice, homework and progress tracking.</p>
                  </div>
                  <div className="display-pathway-card display-pathway-card--young">
                    <span className="display-card-label">Young Learners</span>
                    <strong>{youngLearnerLevels.map((level) => level.name).join("  ·  ")}</strong>
                    <p>Age-appropriate lessons that build communication, curiosity and confidence.</p>
                  </div>
                </div>
              </div>
            )}

            {slideIndex === 3 && (
              <div className="display-content-slide display-content-slide--cambridge">
                <div className="display-cambridge-layout">
                  <div className="display-cambridge-copy">
                    <SlideKicker>Cambridge pathway</SlideKicker>
                    <h2>From B1 to C2, with a plan.</h2>
                    <div className="display-level-roadmap">
                      {cambridgeLevels.map((level, index) => (
                        <div className="display-level-step" key={level.name}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <strong>{level.name}</strong>
                          <small>{index === 0 ? "Build" : index === cambridgeLevels.length - 1 ? "Master" : "Develop"}</small>
                        </div>
                      ))}
                    </div>
                    <p className="display-callout">Exam skills, Friday practice and teacher feedback come together in one connected learning experience.</p>
                  </div>
                  <div className="display-cambridge-logo-panel">
                    <Image src="/AEC_cambridge.png" alt="Cambridge English Authorised Exam Centre" width={520} height={230} />
                    <span>Authorised Exam Centre</span>
                  </div>
                </div>
              </div>
            )}

            {slideIndex === 4 && (
              <div className="display-content-slide">
                <SlideKicker>Young Learners</SlideKicker>
                <h2>Strong foundations, happy classrooms.</h2>
                <p className="display-lead">Young Learners move through the current school levels with engaging lessons, regular class exams and resources that match their stage.</p>
                <div className="display-young-levels">
                  {youngLearnerLevels.map((level) => <span key={level.name}>{level.name}</span>)}
                </div>
                <div className="display-quote">“The best progress starts when learners feel comfortable enough to try.”</div>
              </div>
            )}

            {slideIndex === 5 && (
              <div className="display-content-slide">
                <SlideKicker>Live from the school calendar</SlideKicker>
                <h2>Friday Tutorial</h2>
                {data.friday ? (
                  <div className="display-friday-live-card">
                    <div className="display-friday-date"><span>{formatDate(data.friday.event_date)}</span><strong>{data.friday.title || "Friday Tutorial"}</strong></div>
                    <div className="display-friday-items">
                      {currentFridayItems.length ? currentFridayItems.map((item) => (
                        <div key={item.id} className="display-friday-item"><strong>{item.label}</strong><span>{formatTimeRange(item.start_time, item.end_time)}</span></div>
                      )) : <div className="display-friday-item"><strong>{data.friday.description || "Tutorial details"}</strong><span>{formatTimeRange(data.friday.start_time, data.friday.end_time)}</span></div>}
                    </div>
                    <small>Updated from the live Sydney School calendar · {dataState === "ready" ? "current" : "checking"}</small>
                  </div>
                ) : (
                  <div className="display-empty-state">The next Friday Tutorial schedule will appear here as soon as it is published.</div>
                )}
              </div>
            )}

            {slideIndex === 6 && (
              <div className="display-content-slide display-content-slide--split">
                <div>
                  <SlideKicker>Friday Tutorial</SlideKicker>
                  <h2>Extra practice when it matters most.</h2>
                  <p className="display-lead">Every week, the Cambridge Friday Tutorial changes with the school plan so learners can focus on the skills and exam work they need next.</p>
                </div>
                <div className="display-icon-panel">
                  <div className="display-icon-ring">✓</div>
                  <strong>Teacher-led support</strong>
                  <span>Practice · feedback · next steps</span>
                </div>
              </div>
            )}

            {slideIndex === 7 && (
              <div className="display-content-slide display-content-slide--split display-content-slide--portal">
                <div>
                  <SlideKicker>Student access</SlideKicker>
                  <h2>Everything learners need, in one place.</h2>
                  <p className="display-lead">Students can sign in from any browser, or install the portal as an app on their phone or computer.</p>
                  <div className="display-url-card"><span>Enter this address</span><strong>{PORTAL_URL}</strong><small>{PORTAL_LINK}</small></div>
                  <p className="display-hint">On a phone: open the address in Safari or Chrome, sign in, then choose <strong>Add to Home Screen</strong>.</p>
                </div>
                <div className="display-phone-panel"><PhoneOutline variant="portal" /></div>
              </div>
            )}

            {slideIndex === 8 && (
              <div className="display-content-slide display-content-slide--split display-content-slide--app">
                <div>
                  <SlideKicker>Student app and website</SlideKicker>
                  <h2>Simple tools for everyday learning.</h2>
                  <div className="display-feature-grid">
                    <div><span>01</span><strong>Dashboard</strong><small>Course, timetable and current homework at a glance.</small></div>
                    <div><span>02</span><strong>Homework</strong><small>Open tasks, submit work and see what comes next.</small></div>
                    <div><span>03</span><strong>Resources</strong><small>Books, worksheets and school materials in one place.</small></div>
                    <div><span>04</span><strong>Progress</strong><small>Results, Friday Tutorials and attendance together.</small></div>
                    <div><span>05</span><strong>Messages</strong><small>Stay connected with teachers and school updates.</small></div>
                    <div><span>06</span><strong>Notifications</strong><small>Optional push alerts and secure app settings.</small></div>
                  </div>
                </div>
                <div className="display-phone-panel"><PhoneOutline variant="app" /></div>
              </div>
            )}

            {slideIndex === 9 && (
              <div className="display-cover-slide display-cover-slide--closing">
                <div className="display-closing-line" />
                <BrandMark />
                <SlideKicker>Welcome to the Sydney School community</SlideKicker>
                <h2>Let’s keep learning.</h2>
                <p>{PORTAL_URL}</p>
              </div>
            )}
          </div>
        </section>

        <footer className="display-presentation-controls">
          <button type="button" onClick={() => setIsPaused((current) => !current)} aria-label={isPaused ? "Resume presentation" : "Pause presentation"}>{isPaused ? "▶" : "Ⅱ"}</button>
          <div className="display-progress-dots" aria-label="Presentation slides">
            {Array.from({ length: 10 }, (_, index) => (
              <button key={index} type="button" className={index === slideIndex ? "is-active" : ""} aria-label={`Show slide ${index + 1}`} aria-current={index === slideIndex ? "step" : undefined} onClick={() => goToSlide(index)} />
            ))}
          </div>
          <span>{String(slideIndex + 1).padStart(2, "0")} / 10</span>
        </footer>
      </div>
    </main>
  );
}

export default function AdminDisplayPage() {
  return <DisplayPage />;
}
