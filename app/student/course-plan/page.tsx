"use client";

import { useCallback, useEffect, useState } from "react";

import StudentMenu from "../StudentMenu";
import { supabase } from "../../../lib/supabase";

type PlanResource = { type: string; label: string; url: string };
type PlanPart = { id: string; type: string; resources: PlanResource[] };
type PlanItem = {
  id: string;
  purpose: "class_practice" | "homework";
  selection_scope: "full_exam" | "part";
  exam: { exam_number: number; title: string | null } | null;
  part: { type: string } | null;
  available_parts: PlanPart[];
};
type PlanDay = {
  id: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  pages_to_cover: string | null;
  other_activities: string | null;
  homework_instructions: string | null;
  homework_due_date: string | null;
  exam_items: PlanItem[];
  resources: Array<{ id: string; label: string; url: string | null; resource_type: string }>;
};
type StudentPlan = {
  id: string;
  class: { name: string; level: string; teacher: string; book_name: string; start_date: string | null; end_date: string | null };
  days: PlanDay[];
};

function displayDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value + "T12:00:00Z"));
}

function getMadridToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return String(values.get("year")) + "-" + String(values.get("month")) + "-" + String(values.get("day"));
}

export default function StudentCoursePlanPage() {
  const [plans, setPlans] = useState<StudentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const today = getMadridToday();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch("/api/student/course-plan", {
        headers: { Authorization: "Bearer " + session.access_token },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to load your Course Plan.");
      setPlans(payload?.plans || []);
    } catch (loadError: any) {
      setPlans([]);
      setError(loadError?.message || "Unable to load your Course Plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="student-layout-shell">
      <div className="student-mobile-topbar"><div className="student-mobile-topbar-title">Sydney School / Student</div><button type="button" className="mobile-menu-button" aria-label="Open student menu" onClick={() => setMenuOpen(true)}>Menu</button></div>
      {menuOpen && <button type="button" aria-label="Close student menu" className="student-mobile-drawer-overlay" onClick={() => setMenuOpen(false)} />}
      <div className={"student-mobile-drawer " + (menuOpen ? "open" : "")}><button type="button" className="student-mobile-drawer-close" onClick={() => setMenuOpen(false)}>Close</button><StudentMenu mobileMode onClose={() => setMenuOpen(false)} /></div>
      <aside className="student-desktop-sidebar"><StudentMenu /></aside>
      <main className="student-main-content student-course-plan-page">
        <header className="student-course-plan-header"><p>Learning journey</p><h1>Course Plan</h1><span>Follow the published plan for your class. Homework and exam materials appear only when released.</span></header>
        {loading && <div className="student-course-plan-state">Loading your Course Plan...</div>}
        {!loading && error && <div className="student-course-plan-state is-error"><p>{error}</p><button type="button" onClick={() => void load()}>Retry</button></div>}
        {!loading && !error && !plans.length && <div className="student-course-plan-state">No Course Plan is currently published for your class.</div>}
        {!loading && !error && plans.map((plan) => (
          <section className="student-course-plan-card" key={plan.id}>
            <header><div><p>{plan.class.level}</p><h2>{plan.class.name}</h2><span>{plan.class.book_name} · {plan.class.teacher} · {displayDate(plan.class.start_date)} – {displayDate(plan.class.end_date)}</span></div><strong>{plan.days.length} lessons</strong></header>
            <ol className="student-course-plan-days">
              {plan.days.map((day, index) => (
                <li key={day.id} className={day.lesson_date === today ? "is-today" : day.lesson_date < today ? "is-past" : ""}>
                  <div className="student-course-plan-day-date"><span>Lesson {index + 1}</span><strong>{displayDate(day.lesson_date)}</strong><small>{day.scheduled_start_time.slice(0, 5)} – {day.scheduled_end_time.slice(0, 5)}</small></div>
                  <div className="student-course-plan-day-content">
                    {day.pages_to_cover && <p><strong>Pages to be covered:</strong> {day.pages_to_cover}</p>}
                    {day.other_activities && <p><strong>Activities:</strong> {day.other_activities}</p>}
                    {day.exam_items.filter((item) => item.purpose === "class_practice").map((item) => <div className="student-course-plan-exam" key={item.id}><strong>Class practice · Exam {item.exam?.exam_number}{item.exam?.title ? " · " + item.exam.title : ""}{item.selection_scope === "part" && item.part ? " — " + item.part.type : " — Full exam"}</strong>{item.available_parts.flatMap((part) => part.resources).map((resource, resourceIndex) => <a key={item.id + "-" + resource.type + "-" + resourceIndex} href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a>)}</div>)}
                    {(day.homework_instructions || day.exam_items.some((item) => item.purpose === "homework")) && <div className="student-course-plan-homework"><strong>Homework{day.homework_due_date ? " · Due " + displayDate(day.homework_due_date) : ""}</strong>{day.homework_instructions && <p>{day.homework_instructions}</p>}{day.exam_items.filter((item) => item.purpose === "homework").map((item) => <div key={item.id}><span>Exam {item.exam?.exam_number}{item.selection_scope === "part" && item.part ? " — " + item.part.type : " — Full exam"}</span>{item.available_parts.flatMap((part) => part.resources).map((resource, resourceIndex) => <a key={item.id + "-" + resource.type + "-" + resourceIndex} href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a>)}</div>)}</div>}
                    {day.resources.length > 0 && <div className="student-course-plan-resources"><strong>Lesson resources</strong>{day.resources.map((resource) => resource.url && <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a>)}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </main>
    </div>
  );
}
