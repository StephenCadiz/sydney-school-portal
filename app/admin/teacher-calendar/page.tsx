"use client";

import { useEffect, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  createTeacherCalendarEvent,
  deleteTeacherCalendarEvent,
  getTeacherCalendarEvents,
} from "../../../lib/teacherCalendar";

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #d9d9d9",
  borderRadius: "8px",
  fontSize: "15px",
  color: "#333",
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  fontWeight: 600,
  marginBottom: "6px",
  display: "block" as const,
  color: "#333",
};

function formatDate(date: string) {
  if (!date) return "-";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(startTime: string, endTime: string) {
  if (!startTime && !endTime) return "-";
  if (!endTime) return startTime;

  return `${startTime} - ${endTime}`;
}

export default function AdminTeacherCalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    title: "",
    event_date: "",
    start_time: "",
    end_time: "",
    description: "",
  });

  async function loadEvents() {
    setLoading(true);

    try {
      const data = await getTeacherCalendarEvents();
      setEvents(data);
    } catch (error) {
      console.error("Unable to load teacher calendar events:", error);
      setMessage("Unable to load teacher calendar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm({
      title: "",
      event_date: "",
      start_time: "",
      end_time: "",
      description: "",
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      await createTeacherCalendarEvent(form);
      resetForm();
      await loadEvents();
      setMessage("Teacher calendar event added.");
    } catch (error: any) {
      console.error("Unable to add teacher calendar event:", error);
      setMessage(error.message || "Unable to add event.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = confirm("Delete this teacher calendar event?");

    if (!confirmed) return;

    setMessage("");

    try {
      await deleteTeacherCalendarEvent(id);
      await loadEvents();
      setMessage("Teacher calendar event deleted.");
    } catch (error: any) {
      console.error("Unable to delete teacher calendar event:", error);
      setMessage(error.message || "Unable to delete event.");
    }
  }

  return (
    <AdminLayout>
      <h1
        style={{
          color: "#1f3c88",
          marginBottom: "10px",
        }}
      >
        Teacher Calendar
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: "30px",
        }}
      >
        Create school-wide events for all teachers.
      </p>

      {message && (
        <div
          style={{
            background: "#ffffff",
            borderRadius: "8px",
            padding: "14px",
            marginBottom: "20px",
            color: "#333",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          {message}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          background: "#ffffff",
          padding: "30px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          marginBottom: "30px",
        }}
      >
        <h2
          style={{
            color: "#1f3c88",
            marginTop: 0,
            marginBottom: "24px",
          }}
        >
          Add Event
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "20px",
          }}
        >
          <div>
            <label style={labelStyle}>Title</label>
            <input
              required
              style={inputStyle}
              value={form.title}
              onChange={(event) =>
                updateForm("title", event.target.value)
              }
            />
          </div>

          <div>
            <label style={labelStyle}>Date</label>
            <input
              required
              type="date"
              style={inputStyle}
              value={form.event_date}
              onChange={(event) =>
                updateForm("event_date", event.target.value)
              }
            />
          </div>

          <div>
            <label style={labelStyle}>Start Time</label>
            <input
              type="time"
              style={inputStyle}
              value={form.start_time}
              onChange={(event) =>
                updateForm("start_time", event.target.value)
              }
            />
          </div>

          <div>
            <label style={labelStyle}>End Time</label>
            <input
              type="time"
              style={inputStyle}
              value={form.end_time}
              onChange={(event) =>
                updateForm("end_time", event.target.value)
              }
            />
          </div>
        </div>

        <div
          style={{
            marginTop: "20px",
          }}
        >
          <label style={labelStyle}>Description</label>
          <textarea
            style={{
              ...inputStyle,
              minHeight: "110px",
              resize: "vertical" as const,
            }}
            value={form.description}
            onChange={(event) =>
              updateForm("description", event.target.value)
            }
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            background: "#1f3c88",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "12px 22px",
            marginTop: "25px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {saving ? "Adding..." : "Add Event"}
        </button>
      </form>

      <section
        style={{
          background: "#ffffff",
          padding: "30px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <h2
          style={{
            color: "#1f3c88",
            marginTop: 0,
            marginBottom: "20px",
          }}
        >
          Calendar Events
        </h2>

        {loading ? (
          <p>Loading teacher calendar...</p>
        ) : events.length === 0 ? (
          <p
            style={{
              color: "#333",
            }}
          >
            No teacher calendar events yet.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "14px",
            }}
          >
            {events.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: "10px",
                  padding: "18px",
                  background: "#f8f9fc",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: "18px",
                  alignItems: "start",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#1f3c88",
                      fontWeight: 800,
                      fontSize: "18px",
                    }}
                  >
                    {item.title}
                  </div>

                  <div
                    style={{
                      color: "#555",
                      marginTop: "8px",
                      fontWeight: 600,
                    }}
                  >
                    {formatDate(item.event_date)} ·{" "}
                    {formatTime(item.start_time, item.end_time)}
                  </div>

                  {item.description && (
                    <p
                      style={{
                        color: "#666",
                        marginBottom: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      {item.description}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(item.id)}
                  style={{
                    background: "#d32f2f",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
