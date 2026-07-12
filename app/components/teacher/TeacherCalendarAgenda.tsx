"use client";

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
    <section
      style={{
        background: "#ffffff",
        borderRadius: "12px",
        padding: "28px",
        marginBottom: "30px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          marginBottom: "22px",
        }}
      >
        <div>
          <h2
            style={{
              color: "#1f3c88",
              margin: 0,
            }}
          >
            Teacher Calendar
          </h2>
          <p
            style={{
              color: "#666",
              margin: "6px 0 0",
            }}
          >
            Upcoming school-wide teacher events.
          </p>
        </div>
      </div>

      {loading && <p>Loading teacher calendar...</p>}

      {!loading && error && <p>Unable to load teacher calendar.</p>}

      {!loading && !error && events.length === 0 && (
        <p>No upcoming teacher events.</p>
      )}

      {!loading && !error && events.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: "12px",
            maxHeight: "430px",
            overflowY: "auto",
            paddingRight: "4px",
          }}
        >
          {events.map((item) => {
            const dateParts = getDateParts(item.event_date);

            return (
              <div
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "68px minmax(0, 1fr)",
                  gap: "16px",
                  alignItems: "center",
                  border: "1px solid #edf0f5",
                  borderRadius: "10px",
                  padding: "14px",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    background: "#1f3c88",
                    color: "#ffffff",
                    borderRadius: "9px",
                    padding: "9px 8px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                  >
                    {dateParts.dayNumber}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      marginTop: "6px",
                      textTransform: "uppercase",
                    }}
                  >
                    {dateParts.month}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      color: "#777",
                      fontSize: "13px",
                      fontWeight: 700,
                      marginBottom: "4px",
                    }}
                  >
                    {dateParts.weekday} ·{" "}
                    {formatTime(item.start_time, item.end_time)}
                  </div>

                  <div
                    style={{
                      color: "#1f3c88",
                      fontSize: "17px",
                      fontWeight: 800,
                    }}
                  >
                    {item.title}
                  </div>

                  {item.description && (
                    <p
                      style={{
                        color: "#666",
                        margin: "6px 0 0",
                        lineHeight: 1.45,
                        fontSize: "14px",
                      }}
                    >
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
