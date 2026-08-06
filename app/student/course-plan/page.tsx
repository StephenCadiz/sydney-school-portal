"use client";

import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  Headphones,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  resources: Array<{
    id: string;
    label: string;
    url: string | null;
    resource_type: string;
  }>;
};
type StudentPlan = {
  id: string;
  class: {
    name: string;
    level: string;
    course_type: string;
    teacher: string;
    book_name: string;
    start_date: string | null;
    end_date: string | null;
    days: string;
    scheduled_start_time: string | null;
    scheduled_end_time: string | null;
  };
  days: PlanDay[];
};
type MonthGroup = {
  key: string;
  label: string;
  days: PlanDay[];
  firstLessonNumber: number;
  lastLessonNumber: number;
};
type LessonState = "past" | "today" | "upcoming";

function displayDate(value: string | null, withWeekday = true) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: withWeekday ? "long" : undefined,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value + "T12:00:00Z"));
}

function displayShortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value + "T12:00:00Z"));
}

function displayMobileDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
  }).format(new Date(value + "T12:00:00Z"));
}

function displayTime(value: string | null) {
  return value ? value.slice(0, 5) : "-";
}

function readableCourseType(value: string) {
  const type = value.trim().toLowerCase();
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : "Course";
}

function getMadridToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return (
    String(values.get("year")) +
    "-" +
    String(values.get("month")) +
    "-" +
    String(values.get("day"))
  );
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthName(key: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    month: "long",
    year: "numeric",
  }).format(new Date(key + "-01T12:00:00Z"));
}

function itemTitle(item: PlanItem) {
  const exam = item.exam;
  const name = "Exam " + String(exam?.exam_number || "");
  const title = exam?.title ? " - " + exam.title : "";
  const scope =
    item.selection_scope === "part" && item.part
      ? " - " + item.part.type.charAt(0).toUpperCase() + item.part.type.slice(1)
      : " - Full exam";

  return name + title + scope;
}

function lessonState(day: PlanDay, today: string): LessonState {
  if (day.lesson_date === today) return "today";
  return day.lesson_date < today ? "past" : "upcoming";
}

function lessonStateLabel(state: LessonState) {
  if (state === "today") return "Today";
  if (state === "past") return "Past";
  return "Upcoming";
}

function classPracticeItems(day: PlanDay) {
  return day.exam_items.filter((item) => item.purpose === "class_practice");
}

function homeworkItems(day: PlanDay) {
  return day.exam_items.filter((item) => item.purpose === "homework");
}

function safeActivityResources(day: PlanDay) {
  return day.resources.filter((resource) => Boolean(resource.url));
}

function hasLessonContent(day: PlanDay) {
  return Boolean(
    day.pages_to_cover ||
      day.other_activities ||
      classPracticeItems(day).length ||
      safeActivityResources(day).length
  );
}

function hasHomework(day: PlanDay) {
  return Boolean(day.homework_instructions || homeworkItems(day).length);
}

function lessonHasContent(day: PlanDay) {
  return hasLessonContent(day) || hasHomework(day);
}

function lessonSummary(day: PlanDay) {
  const details = [
    day.pages_to_cover ? "Pages " + day.pages_to_cover : "",
    classPracticeItems(day).length ? "Class practice" : "",
    day.other_activities ? "Activities" : "",
    safeActivityResources(day).length ? "Resources" : "",
    hasHomework(day) ? "Homework" : "",
  ].filter(Boolean);

  return details.join(" · ");
}

function resourceAction(resource: PlanResource) {
  if (resource.type === "audio") {
    return { label: "Play audio", Icon: Headphones };
  }

  return { label: "Open question paper", Icon: FileText };
}

function activityResourceAction(resource: PlanDay["resources"][number]) {
  if (resource.resource_type === "audio") {
    return { label: "Listen to audio", Icon: Headphones };
  }

  if (resource.resource_type === "pdf") {
    return { label: "Open worksheet", Icon: FileText };
  }

  return { label: "Open resource", Icon: ExternalLink };
}

function groupByMonth(days: PlanDay[]): MonthGroup[] {
  const grouped = new Map<string, PlanDay[]>();

  for (const day of days) {
    const key = monthKey(day.lesson_date);
    grouped.set(key, [...(grouped.get(key) || []), day]);
  }

  let lessonNumber = 1;

  return Array.from(grouped.entries()).map(([key, groupDays]) => {
    const firstLessonNumber = lessonNumber;
    lessonNumber += groupDays.length;

    return {
      key,
      label: monthName(key),
      days: groupDays,
      firstLessonNumber,
      lastLessonNumber: lessonNumber - 1,
    };
  });
}

function getDefaultLessonIndex(days: PlanDay[], today: string) {
  const todayLessonIndex = days.findIndex((day) => day.lesson_date === today);
  if (todayLessonIndex >= 0) return todayLessonIndex;

  const nextLessonIndex = days.findIndex((day) => day.lesson_date > today);
  if (nextLessonIndex >= 0) return nextLessonIndex;

  return Math.max(0, days.length - 1);
}

function MaterialActions({ items }: { items: PlanItem[] }) {
  return (
    <div className="student-course-plan-exam-list">
      {items.map((item) => {
        const resources = item.available_parts.flatMap((part) =>
          part.resources
            .filter((resource) => resource.type === "paper" || resource.type === "audio")
            .map((resource, index) => ({ part, resource, index }))
        );

        return (
          <div className="student-course-plan-exam-item" key={item.id}>
            <strong>{itemTitle(item)}</strong>
            {resources.length > 0 && (
              <div className="student-course-plan-material-actions">
                {resources.map(({ part, resource, index }) => {
                  const action = resourceAction(resource);
                  const Icon = action.Icon;

                  return (
                    <a
                      key={item.id + "-" + part.id + "-" + resource.type + "-" + index}
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon aria-hidden="true" size={15} />
                      <span>{action.label}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActivityResourceActions({ day }: { day: PlanDay }) {
  const resources = safeActivityResources(day);

  if (resources.length === 0) return null;

  return (
    <div className="student-course-plan-material-actions">
      {resources.map((resource) => {
        const action = activityResourceAction(resource);
        const Icon = action.Icon;

        return (
          <a
            key={resource.id}
            href={resource.url || "#"}
            target="_blank"
            rel="noreferrer"
          >
            <Icon aria-hidden="true" size={15} />
            <span>{action.label}</span>
            <em>{resource.label}</em>
          </a>
        );
      })}
    </div>
  );
}

function NavigatorIndicators({ day }: { day: PlanDay }) {
  const hasContent = hasLessonContent(day);
  const homeworkAssigned = hasHomework(day);

  if (!hasContent && !homeworkAssigned) {
    return <div className="student-course-plan-navigator-pending">Planning pending</div>;
  }

  return (
    <div className="student-course-plan-navigator-indicators">
      {hasContent && (
        <span>
          <FileText size={12} aria-hidden="true" />
          Content
        </span>
      )}
      {homeworkAssigned && (
        <span>
          <BookOpen size={12} aria-hidden="true" />
          Homework
        </span>
      )}
    </div>
  );
}

function SelectedLessonPanel({
  day,
  lessonNumber,
  totalLessons,
  today,
}: {
  day: PlanDay;
  lessonNumber: number;
  totalLessons: number;
  today: string;
}) {
  const state = lessonState(day, today);
  const practice = classPracticeItems(day);
  const homework = homeworkItems(day);
  const summary = lessonSummary(day);
  const hasDetails = lessonHasContent(day);

  return (
    <article className="student-course-plan-selected" aria-live="polite">
      <header className="student-course-plan-selected-header">
        <div>
          <h3>{displayDate(day.lesson_date)}</h3>
          <span>
            {displayTime(day.scheduled_start_time)}-{displayTime(day.scheduled_end_time)}
          </span>
          <p>Lesson {lessonNumber} of {totalLessons}</p>
        </div>
        <span className={"student-course-plan-status is-" + state}>
          {lessonStateLabel(state)}
        </span>
        <strong>{summary || "Planning pending"}</strong>
      </header>

      <div className="student-course-plan-selected-body">
        {!hasDetails ? (
          <section className="student-course-plan-empty-selected">
            <h4>Planning in progress</h4>
            <p>Details for this lesson have not yet been published.</p>
          </section>
        ) : (
          <>
            {day.pages_to_cover && (
              <section className="student-course-plan-detail-section is-pages">
                <div className="student-course-plan-detail-heading">
                  <span className="student-course-plan-detail-icon">
                    <BookOpen size={17} aria-hidden="true" />
                  </span>
                  <h4>Pages to be covered</h4>
                </div>
                <p>{day.pages_to_cover}</p>
              </section>
            )}

            {practice.length > 0 && (
              <section className="student-course-plan-detail-section is-practice">
                <div className="student-course-plan-detail-heading">
                  <span className="student-course-plan-detail-icon">
                    <ClipboardList size={17} aria-hidden="true" />
                  </span>
                  <h4>Class Practice</h4>
                </div>
                <MaterialActions items={practice} />
              </section>
            )}

            {day.other_activities && (
              <section className="student-course-plan-detail-section is-activities">
                <div className="student-course-plan-detail-heading">
                  <span className="student-course-plan-detail-icon">
                    <CalendarDays size={17} aria-hidden="true" />
                  </span>
                  <h4>Other Activities</h4>
                </div>
                <p>{day.other_activities}</p>
              </section>
            )}

            {safeActivityResources(day).length > 0 && (
              <section className="student-course-plan-detail-section is-resources">
                <div className="student-course-plan-detail-heading">
                  <span className="student-course-plan-detail-icon">
                    <ExternalLink size={17} aria-hidden="true" />
                  </span>
                  <h4>Files and resources</h4>
                </div>
                <ActivityResourceActions day={day} />
              </section>
            )}

            {hasHomework(day) && (
              <section className="student-course-plan-detail-section is-homework">
                <div className="student-course-plan-homework-heading">
                  <div className="student-course-plan-detail-heading">
                    <span className="student-course-plan-detail-icon">
                      <FileText size={17} aria-hidden="true" />
                    </span>
                    <h4>Homework</h4>
                  </div>
                  {day.homework_due_date && (
                    <span>Due {displayDate(day.homework_due_date, false)}</span>
                  )}
                </div>
                {day.homework_instructions && <p>{day.homework_instructions}</p>}
                {homework.length > 0 && <MaterialActions items={homework} />}
              </section>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function StudentCoursePlan({ plan }: { plan: StudentPlan }) {
  const today = getMadridToday();
  const navigatorRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const groups = useMemo(() => groupByMonth(plan.days), [plan.days]);
  const defaultLessonIndex = useMemo(
    () => getDefaultLessonIndex(plan.days, today),
    [plan.days, today]
  );
  const [selectedIndex, setSelectedIndex] = useState(defaultLessonIndex);

  useEffect(() => {
    setSelectedIndex(defaultLessonIndex);
  }, [defaultLessonIndex, plan.id]);

  const selectedDay = plan.days[selectedIndex] || plan.days[0] || null;
  const activeMonth = selectedDay ? monthKey(selectedDay.lesson_date) : "";
  const scheduledDatesReached = plan.days.filter(
    (day) => day.lesson_date <= today
  ).length;
  const courseProgress = plan.days.length
    ? Math.round((scheduledDatesReached / plan.days.length) * 100)
    : 0;
  const targetDay = plan.days[defaultLessonIndex] || null;
  const targetLabel =
    targetDay?.lesson_date === today
      ? "Jump to today"
      : targetDay?.lesson_date && targetDay.lesson_date > today
      ? "Next lesson"
      : "Latest lesson";

  useEffect(() => {
    if (!selectedDay) return;

    navigatorRowRefs.current[selectedDay.id]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [selectedDay?.id]);

  function selectLesson(index: number) {
    if (!plan.days.length) return;

    setSelectedIndex(Math.max(0, Math.min(plan.days.length - 1, index)));
  }

  function selectMonth(key: string) {
    const index = plan.days.findIndex((day) => monthKey(day.lesson_date) === key);

    if (index >= 0) {
      selectLesson(index);
    }
  }

  return (
    <section className="student-course-plan" aria-labelledby={"course-plan-" + plan.id}>
      <header className="student-course-plan-overview">
        <div className="student-course-plan-overview-main">
          <p>{plan.class.level} {readableCourseType(plan.class.course_type)}</p>
          <h2 id={"course-plan-" + plan.id}>{plan.class.book_name}</h2>
          <span>{plan.class.name}</span>
        </div>
        <dl className="student-course-plan-overview-details">
          <div><dt>Teacher</dt><dd>{plan.class.teacher}</dd></div>
          <div><dt>Course dates</dt><dd>{displayDate(plan.class.start_date, false)} - {displayDate(plan.class.end_date, false)}</dd></div>
          <div><dt>Teaching</dt><dd>{plan.class.days} · {displayTime(plan.class.scheduled_start_time)}-{displayTime(plan.class.scheduled_end_time)}</dd></div>
          <div><dt>Total lessons</dt><dd>{plan.days.length} lessons</dd></div>
        </dl>
        <div className="student-course-plan-progress" aria-label={scheduledDatesReached + " of " + plan.days.length + " scheduled course dates reached"}>
          <div><span>Current course position</span><strong>{scheduledDatesReached} of {plan.days.length} scheduled lessons reached</strong></div>
          <span className="student-course-plan-progress-track"><span style={{ width: courseProgress + "%" }} /></span>
        </div>
      </header>

      {plan.days.length === 0 ? (
        <div className="student-course-plan-state">
          No scheduled lessons have been published for this Course Plan yet.
        </div>
      ) : (
        <>
          <div className="student-course-plan-toolbar" aria-label="Course navigation">
            <div className="student-course-plan-stepper">
              <button
                type="button"
                aria-label="Previous lesson"
                onClick={() => selectLesson(selectedIndex - 1)}
                disabled={selectedIndex <= 0}
              >
                <ChevronLeft size={17} aria-hidden="true" />
                Previous
              </button>
              <strong>Lesson {selectedIndex + 1} of {plan.days.length}</strong>
              <button
                type="button"
                aria-label="Next lesson"
                onClick={() => selectLesson(selectedIndex + 1)}
                disabled={selectedIndex >= plan.days.length - 1}
              >
                Next
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="student-course-plan-toolbar-actions">
              <button type="button" onClick={() => selectLesson(defaultLessonIndex)}>
                <CalendarDays size={17} aria-hidden="true" />
                {targetLabel}
              </button>
              <label>
                <span>Month</span>
                <select value={activeMonth} onChange={(event) => selectMonth(event.target.value)}>
                  {groups.map((group) => (
                    <option key={group.key} value={group.key}>
                      {group.label} · Lessons {group.firstLessonNumber}-{group.lastLessonNumber}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="student-course-plan-mobile-strip" aria-label="Lesson dates">
            {plan.days.map((day, index) => {
              const state = lessonState(day, today);
              const selected = selectedIndex === index;

              return (
                <button
                  key={day.id}
                  type="button"
                  className={(selected ? "is-selected " : "") + "is-" + state}
                  aria-current={selected ? "true" : undefined}
                  aria-label={"Select lesson " + (index + 1) + ", " + displayDate(day.lesson_date)}
                  onClick={() => selectLesson(index)}
                >
                  <span>Lesson {index + 1}</span>
                  <strong>{displayMobileDate(day.lesson_date)}</strong>
                </button>
              );
            })}
          </div>

          <div className="student-course-plan-workspace">
            <aside className="student-course-plan-navigator" aria-label="Lesson Navigator">
              <header>
                <h3>Lesson Navigator</h3>
                <span>{plan.days.length} lessons</span>
              </header>
              <div
                className="student-course-plan-navigator-scroll"
                role="list"
                tabIndex={0}
                aria-label="All scheduled lessons"
              >
                {groups.map((group) => (
                  <section key={group.key} aria-label={group.label}>
                    <h4>{group.label}</h4>
                    {group.days.map((day, index) => {
                      const lessonNumber = group.firstLessonNumber + index;
                      const lessonIndex = lessonNumber - 1;
                      const state = lessonState(day, today);
                      const selected = selectedIndex === lessonIndex;

                      return (
                        <button
                          key={day.id}
                          type="button"
                          ref={(element) => {
                            navigatorRowRefs.current[day.id] = element;
                          }}
                          className={
                            "student-course-plan-navigator-row is-" +
                            state +
                            (selected ? " is-selected" : "")
                          }
                          aria-current={selected ? "true" : undefined}
                          onClick={() => selectLesson(lessonIndex)}
                        >
                          <span>
                            <strong>Lesson {lessonNumber}</strong>
                            <em>{displayShortDate(day.lesson_date)}</em>
                          </span>
                          <small>{lessonStateLabel(state)}</small>
                          <NavigatorIndicators day={day} />
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>
            </aside>

            {selectedDay && (
              <SelectedLessonPanel
                day={selectedDay}
                lessonNumber={selectedIndex + 1}
                totalLessons={plan.days.length}
                today={today}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default function StudentCoursePlanPage() {
  const [plans, setPlans] = useState<StudentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

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

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load your Course Plan.");
      }

      setPlans(payload?.plans || []);
    } catch (loadError: any) {
      setPlans([]);
      setError(loadError?.message || "Unable to load your Course Plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="student-layout-shell">
      <div className="student-mobile-topbar">
        <div className="student-mobile-topbar-title">Sydney School / Student</div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open student menu"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      </div>
      {menuOpen && (
        <button
          type="button"
          aria-label="Close student menu"
          className="student-mobile-drawer-overlay"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className={"student-mobile-drawer " + (menuOpen ? "open" : "")}>
        <button
          type="button"
          className="student-mobile-drawer-close"
          onClick={() => setMenuOpen(false)}
        >
          Close
        </button>
        <StudentMenu mobileMode onClose={() => setMenuOpen(false)} />
      </div>
      <aside className="student-desktop-sidebar"><StudentMenu /></aside>

      <main className="student-main-content student-course-plan-page">
        <header className="student-course-plan-page-intro">
          <p>Learning journey</p>
          <h1>Course Plan</h1>
          <span>
            Follow your daily programme, class practice and homework throughout the course.
          </span>
        </header>

        {loading && (
          <div className="student-course-plan-state">Loading your Course Plan...</div>
        )}
        {!loading && error && (
          <div className="student-course-plan-state is-error">
            <p>{error}</p>
            <button type="button" onClick={() => void load()}>Retry</button>
          </div>
        )}
        {!loading && !error && !plans.length && (
          <div className="student-course-plan-state">
            No Course Plan is currently published for your class.
          </div>
        )}
        {!loading &&
          !error &&
          plans.map((plan) => <StudentCoursePlan key={plan.id} plan={plan} />)}
      </main>
    </div>
  );
}
