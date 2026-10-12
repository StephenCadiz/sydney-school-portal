"use client";

import { CalendarDays, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getUpcomingCalendarGroups, getUpcomingTeacherCalendarEvents } from "../../../lib/teacherCalendar";

type CalendarEntry = {
  id: string;
  title: string;
  event_date: string;
  end_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  items?: Array<{ id: string; label: string; start_time?: string | null; end_time?: string | null }>;
};

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(start?: string | null, end?: string | null) {
  const first = start ? start.slice(0, 5) : "";
  const last = end ? end.slice(0, 5) : "";
  if (!first && !last) return "All day";
  if (!last || first === last) return first;
  return `${first}–${last}`;
}

export default function AdminPwaDashboard() {
  const [events, setEvents] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([getUpcomingTeacherCalendarEvents(), getUpcomingCalendarGroups()])
      .then(([teacherResult, groupsResult]) => {
        if (!active) return;
        const teacherEvents = teacherResult.status === "fulfilled" ? teacherResult.value : [];
        const calendarGroups = groupsResult.status === "fulfilled" ? groupsResult.value : [];
        setEvents([...teacherEvents, ...calendarGroups].sort((a, b) => {
          return String(a.event_date).localeCompare(String(b.event_date)) || String(a.start_time || "").localeCompare(String(b.start_time || ""));
        }).slice(0, 12));
        setError(teacherResult.status === "rejected" && groupsResult.status === "rejected");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const grouped = useMemo(() => {
    const byDate = new Map<string, CalendarEntry[]>();
    events.forEach((event) => byDate.set(event.event_date, [...(byDate.get(event.event_date) || []), event]));
    return Array.from(byDate.entries());
  }, [events]);

  return (
    <main className="admin-pwa-dashboard" aria-labelledby="admin-pwa-dashboard-title">
      <section className="admin-pwa-calendar-card">
        <div className="admin-pwa-calendar-heading">
          <div className="admin-pwa-calendar-icon" aria-hidden="true"><CalendarDays size={21} /></div>
          <div>
            <span className="admin-pwa-eyebrow">YOUR CALENDAR</span>
            <h1 id="admin-pwa-dashboard-title">Upcoming calendar</h1>
          </div>
        </div>
        {loading ? (
          <p className="admin-pwa-calendar-state" role="status">Loading calendar…</p>
        ) : error ? (
          <p className="admin-pwa-calendar-state is-error">Unable to load the calendar.</p>
        ) : grouped.length === 0 ? (
          <p className="admin-pwa-calendar-state">No upcoming events.</p>
        ) : (
          <div className="admin-pwa-calendar-list">
            {grouped.map(([date, dateEvents]) => (
              <section key={date} className="admin-pwa-calendar-day">
                <h2>{formatDate(date)}</h2>
                {dateEvents.map((event) => (
                  <article key={event.id} className="admin-pwa-calendar-event">
                    <div className="admin-pwa-calendar-event-main">
                      <strong>{event.title || "Untitled event"}</strong>
                      <span>{formatTime(event.start_time, event.end_time)}</span>
                      {event.description && <p>{event.description}</p>}
                      {event.items && event.items.length > 0 && (
                        <ul>
                          {event.items.map((item) => <li key={item.id}>{item.label} · {formatTime(item.start_time, item.end_time)}</li>)}
                        </ul>
                      )}
                    </div>
                    <ChevronRight size={17} aria-hidden="true" />
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
