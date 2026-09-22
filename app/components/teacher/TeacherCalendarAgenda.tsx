"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  formatTeacherCalendarClosureRange,
  getFutureTeacherSchoolClosures,
  getTeacherCalendarClosureTypeLabel,
  getUpcomingTeacherCalendarEvents,
  getUpcomingCalendarGroups,
  getUpcomingTeacherSchoolClosures,
  mergeTeacherCalendarEventsWithClosures,
  type TeacherCalendarAgendaItem,
  type TeacherCalendarEvent,
} from "../../../lib/teacherCalendar";

function getDateParts(date: string) {
  const value = new Date(`${date}T00:00:00`);

  return {
    dayNumber: value.toLocaleDateString("en-GB", {
      day: "2-digit",
    }),
    month: value.toLocaleDateString("en-GB", {
      month: "short",
    }),
    weekday: value.toLocaleDateString("en-GB", {
      weekday: "long",
    }),
  };
}

function formatClockTime(time: string | null) {
  if (!time) return "";

  return time.slice(0, 5);
}

function formatTime(startTime: string | null, endTime: string | null) {
  const start = formatClockTime(startTime);
  const end = formatClockTime(endTime);

  if (!start && !end) return "All day";
  if (!end || start === end) return start;

  return `${start} - ${end}`;
}

function formatDisplayDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(new Date(`${date}T12:00:00Z`));
}

export default function TeacherCalendarAgenda() {
  const [calendarEvents, setCalendarEvents] = useState<TeacherCalendarEvent[]>([]);
  const [calendarGroups, setCalendarGroups] = useState<Awaited<ReturnType<typeof getUpcomingCalendarGroups>>>([]);
  const [closures, setClosures] = useState<Awaited<ReturnType<typeof getUpcomingTeacherSchoolClosures>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [closureError, setClosureError] = useState(false);
  const [closuresOpen, setClosuresOpen] = useState(false);
  const [closuresRefreshing, setClosuresRefreshing] = useState(false);
  const closureTriggerRef = useRef<HTMLButtonElement>(null);
  const closureDialogRef = useRef<HTMLDivElement>(null);

  const events = [
    ...mergeTeacherCalendarEventsWithClosures(calendarEvents, closures),
    ...calendarGroups,
  ].sort((left, right) =>
    left.event_date.localeCompare(right.event_date) ||
    ("kind" in left ? -1 : 1) ||
    String(left.id).localeCompare(String(right.id))
  );
  const visibleEvents = events;
  const futureClosures = getFutureTeacherSchoolClosures(closures);

  async function refreshClosures() {
    setClosuresRefreshing(true);
    try {
      const latestClosures = await getUpcomingTeacherSchoolClosures();
      setClosures(latestClosures);
      setClosureError(false);
    } catch (loadError) {
      console.error("Unable to refresh school closures:", loadError);
      setClosureError(true);
    } finally {
      setClosuresRefreshing(false);
    }
  }

  useEffect(() => {
    async function loadEvents() {
      try {
        const [data, closures, groups] = await Promise.all([
          getUpcomingTeacherCalendarEvents(),
          getUpcomingTeacherSchoolClosures().catch((loadError) => {
            console.error("Unable to load school closures:", loadError);
            return [];
          }),
          getUpcomingCalendarGroups().catch((loadError) => {
            console.error("Unable to load Friday Tutorial and Exam Week events:", loadError);
            return [];
          }),
        ]);
        setCalendarEvents(data);
        setClosures(closures);
        setCalendarGroups(groups);
      } catch (loadError) {
        console.error("Unable to load teacher calendar:", loadError);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    loadEvents();

    // Keep the link current when Admin adds a new record while the dashboard
    // remains open. The source remains the Admin school-calendar data.
    const refreshInterval = window.setInterval(() => {
      void refreshClosures();
    }, 60_000);

    return () => window.clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    if (!closuresOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = closureDialogRef.current;
    const focusable = dialog
      ? Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((element) => !element.hasAttribute("disabled"))
      : [];
    focusable[0]?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setClosuresOpen(false);
        return;
      }

      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      } else {
        closureTriggerRef.current?.focus();
      }
    };
  }, [closuresOpen]);

  return (
    <section className="teacher-dashboard-section teacher-dashboard-calendar">
      <div className="teacher-dashboard-section-title">
        <div>
          <h2>Teacher Calendar</h2>
          <p>
            Upcoming school-wide teacher events.
          </p>
        </div>

        <Link
          href="/teacher/calendar"
          className="teacher-dashboard-section-link"
        >
          View Calendar
        </Link>
      </div>

      {loading && (
        <p className="teacher-dashboard-muted-text">
          Loading teacher calendar...
        </p>
      )}

      {!loading && error && (
        <p className="teacher-dashboard-error-text">
          Unable to load teacher calendar.
        </p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="teacher-dashboard-empty-state">
          No upcoming teacher events.
        </p>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="teacher-dashboard-event-list">
          {visibleEvents.map((item) => {
            const dateParts = getDateParts(item.event_date);
            const isClosure = "is_closure_notice" in item && item.is_closure_notice;

            return (
              <article
                key={item.id}
                className={`teacher-dashboard-event${isClosure ? " is-closure" : ""}`}
              >
                <div className="teacher-dashboard-event-date">
                  <span>
                    {dateParts.dayNumber}
                  </span>
                  <strong>
                    {dateParts.month}
                  </strong>
                </div>

                <div className="teacher-dashboard-event-content">
                  <div className="teacher-dashboard-event-meta">
                    {dateParts.weekday} ·{" "}
                    {formatTime(item.start_time, item.end_time)}
                  </div>

                  <h3>
                    {item.title}
                  </h3>

                  {isClosure && futureClosures.length > 0 ? (
                    <button
                      type="button"
                      className="teacher-dashboard-inline-closures-link"
                      ref={closureTriggerRef}
                      aria-expanded={closuresOpen}
                      aria-controls="teacher-dashboard-future-closures-dialog"
                      onClick={() => {
                        setClosuresOpen(true);
                        void refreshClosures();
                      }}
                    >
                      View future holidays and school closures
                    </button>
                  ) : "kind" in item ? (
                    <>
                      <p>
                        {item.description} · {formatDisplayDate(item.event_date)}
                        {item.end_date !== item.event_date
                          ? `–${formatDisplayDate(item.end_date)}`
                          : ""}
                      </p>
                      <ul className="teacher-dashboard-calendar-group-items">
                        {item.items.map((groupItem) => (
                          <li key={groupItem.id}>
                            <span>{groupItem.label}</span>
                            {groupItem.start_time || groupItem.end_time ? (
                              <small>{formatTime(groupItem.start_time, groupItem.end_time)}</small>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : item.description ? (
                    <p>
                      {item.description}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {closuresOpen && (
        <div
          className="teacher-dashboard-closures-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setClosuresOpen(false);
          }}
        >
          <div
            id="teacher-dashboard-future-closures-dialog"
            ref={closureDialogRef}
            className="teacher-dashboard-future-closures-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-dashboard-future-closures-title"
            aria-describedby="teacher-dashboard-future-closures-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="teacher-dashboard-future-closures-heading">
              <div>
                <h3 id="teacher-dashboard-future-closures-title">
                  Future holidays and school closures
                </h3>
                <p id="teacher-dashboard-future-closures-description">
                  Upcoming school-calendar dates that may affect teaching.
                </p>
              </div>
              <button
                type="button"
                className="teacher-dashboard-future-closures-close"
                aria-label="Close future holidays and school closures"
                onClick={() => setClosuresOpen(false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="teacher-dashboard-future-closures-content">
              {closuresRefreshing && (
                <p className="teacher-dashboard-muted-text">
                  Loading future holidays and school closures...
                </p>
              )}

              {!closuresRefreshing && closureError ? (
                <p className="teacher-dashboard-error-text">
                  Unable to refresh future school closures.
                </p>
              ) : !closuresRefreshing && futureClosures.length === 0 ? (
                <p className="teacher-dashboard-empty-state">
                  No future school closures are currently scheduled.
                </p>
              ) : !closuresRefreshing ? (
                <ul className="teacher-dashboard-future-closures-list">
                  {futureClosures.map((closure) => (
                    <li
                      key={closure.id}
                      className="teacher-dashboard-future-closure-item"
                    >
                      <strong>{closure.name}</strong>
                      <span className="teacher-dashboard-future-closure-meta">
                        <span className="teacher-dashboard-future-closure-type">
                          {getTeacherCalendarClosureTypeLabel(closure)}
                        </span>
                        <span className="teacher-dashboard-future-closure-date">
                          {formatTeacherCalendarClosureRange(closure)}
                        </span>
                      </span>
                      <p>
                        {closure.closure_type === "public_holiday"
                          ? "Public holiday — no classes are scheduled."
                          : "School closure — no classes are scheduled."}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
