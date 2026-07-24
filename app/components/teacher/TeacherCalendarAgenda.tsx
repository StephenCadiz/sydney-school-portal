"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getUpcomingTeacherCalendarEvents } from "../../../lib/teacherCalendar";

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

function formatClockTime(time: string) {
  if (!time) return "";

  return time.slice(0, 5);
}

function formatTime(startTime: string, endTime: string) {
  const start = formatClockTime(startTime);
  const end = formatClockTime(endTime);

  if (!start && !end) return "All day";
  if (!end || start === end) return start;

  return `${start} - ${end}`;
}

export default function TeacherCalendarAgenda() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      try {
        const data = await getUpcomingTeacherCalendarEvents();
        setEvents(data);
      } catch (loadError) {
        console.error("Unable to load teacher calendar:", loadError);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, []);

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
          {events.map((item) => {
            const dateParts = getDateParts(item.event_date);

            return (
              <article key={item.id} className="teacher-dashboard-event">
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

                  {item.description && (
                    <p>
                      {item.description}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
