"use client";

import { CalendarDays, Pencil, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  SCHOOL_CLOSURE_TYPE_LABELS,
  SCHOOL_CLOSURE_TYPES,
  getMadridSchoolDate,
  type SchoolClosure,
  type SchoolClosureType,
} from "../../../lib/schoolClosures";
import { supabase } from "../../../lib/supabase";
import styles from "./SchoolCalendar.module.css";

type FormState = {
  name: string;
  closure_type: SchoolClosureType;
  start_date: string;
  end_date: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  closure_type: "public_holiday",
  start_date: "",
  end_date: "",
  notes: "",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatRange(closure: SchoolClosure) {
  return closure.start_date === closure.end_date
    ? formatDate(closure.start_date)
    : `${formatDate(closure.start_date)} – ${formatDate(closure.end_date)}`;
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your Admin session has expired.");
  return session.access_token;
}

export default function SchoolCalendarPage() {
  const [closures, setClosures] = useState<SchoolClosure[]>([]);
  const [todayMadrid, setTodayMadrid] = useState(() => getMadridSchoolDate());
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadClosures = useCallback(async () => {
    const token = await getAccessToken();
    const response = await fetch("/api/admin/school-closures", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Unable to load the School Calendar.");
    }
    setClosures(Array.isArray(payload.closures) ? payload.closures : []);
    setTodayMadrid(String(payload.today_madrid || getMadridSchoolDate()));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadClosures();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load the School Calendar."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [loadClosures]);

  const upcoming = useMemo(
    () => closures.filter((closure) => closure.end_date >= todayMadrid),
    [closures, todayMadrid]
  );
  const past = useMemo(
    () =>
      closures
        .filter((closure) => closure.end_date < todayMadrid)
        .sort((left, right) => right.start_date.localeCompare(left.start_date)),
    [closures, todayMadrid]
  );

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId("");
  }

  function editClosure(closure: SchoolClosure) {
    setEditingId(closure.id);
    setForm({
      name: closure.name,
      closure_type: closure.closure_type,
      start_date: closure.start_date,
      end_date: closure.end_date,
      notes: closure.notes || "",
    });
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const token = await getAccessToken();
      const response = await fetch(
        editingId
          ? `/api/admin/school-closures/${encodeURIComponent(editingId)}`
          : "/api/admin/school-closures",
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save the School Closure.");
      }
      const wasEditing = Boolean(editingId);
      resetForm();
      await loadClosures();
      setMessage(
        wasEditing
          ? "School Closure updated. Attendance alerts were reconciled."
          : "School Closure added. Attendance alerts were reconciled."
      );
      window.dispatchEvent(new Event("admin-attendance-alerts-changed"));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save the School Closure."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteClosure(closure: SchoolClosure) {
    const confirmed = window.confirm(
      `Delete “${closure.name}”? Attendance alerts will be recalculated and this date will count as a teaching date again.`
    );
    if (!confirmed) return;

    setDeletingId(closure.id);
    setError("");
    setMessage("");
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/admin/school-closures/${encodeURIComponent(closure.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete the School Closure.");
      }
      if (editingId === closure.id) resetForm();
      await loadClosures();
      setMessage(
        "School Closure deleted. Attendance alerts were reconciled."
      );
      window.dispatchEvent(new Event("admin-attendance-alerts-changed"));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to delete the School Closure."
      );
    } finally {
      setDeletingId("");
    }
  }

  function renderClosures(items: SchoolClosure[], empty: string) {
    if (!items.length) return <p className={styles.empty}>{empty}</p>;
    return (
      <div className={styles.list}>
        {items.map((closure) => (
          <article className={styles.closureCard} key={closure.id}>
            <div className={styles.dateMarker} aria-hidden="true">
              <CalendarDays size={21} />
            </div>
            <div className={styles.closureCopy}>
              <div className={styles.closureTitleRow}>
                <h3>{closure.name}</h3>
                <span className={styles.typeBadge}>
                  {SCHOOL_CLOSURE_TYPE_LABELS[closure.closure_type]}
                </span>
              </div>
              <strong className={styles.dateRange}>{formatRange(closure)}</strong>
              {closure.notes && <p>{closure.notes}</p>}
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => editClosure(closure)}>
                <Pencil size={15} aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                className={styles.deleteButton}
                disabled={deletingId === closure.id}
                onClick={() => void deleteClosure(closure)}
              >
                <Trash2 size={15} aria-hidden="true" />
                {deletingId === closure.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>School operations</span>
            <h1>School Calendar</h1>
            <p>
              Manage school-wide no-teaching dates. Closures suppress registers,
              progress records, attendance calculations and Friday Tutorial duties.
            </p>
          </div>
          <div className={styles.headerIcon} aria-hidden="true">
            <CalendarDays size={30} />
          </div>
        </header>

        <section className={styles.formCard} aria-labelledby="closure-form-title">
          <div className={styles.formHeading}>
            <div>
              <span>{editingId ? "Edit calendar entry" : "New calendar entry"}</span>
              <h2 id="closure-form-title">
                {editingId ? "Update School Closure" : "Add School Closure"}
              </h2>
            </div>
            {editingId && (
              <button type="button" onClick={resetForm} className={styles.cancelEdit}>
                <X size={16} aria-hidden="true" />
                Cancel edit
              </button>
            )}
          </div>

          {message && <div className={styles.success} role="status">{message}</div>}
          {error && <div className={styles.error} role="alert">{error}</div>}

          <form onSubmit={submitClosure} className={styles.form}>
            <label className={styles.nameField}>
              <span>Name</span>
              <input
                required
                maxLength={160}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="e.g. Constitution Day"
              />
            </label>
            <label>
              <span>Closure type</span>
              <select
                value={form.closure_type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    closure_type: event.target.value as SchoolClosureType,
                  }))
                }
              >
                {SCHOOL_CLOSURE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SCHOOL_CLOSURE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Start date</span>
              <input
                required
                type="date"
                value={form.start_date}
                onChange={(event) => {
                  const startDate = event.target.value;
                  setForm((current) => ({
                    ...current,
                    start_date: startDate,
                    end_date:
                      !current.end_date || current.end_date === current.start_date
                        ? startDate
                        : current.end_date,
                  }));
                }}
              />
            </label>
            <label>
              <span>End date</span>
              <input
                required
                type="date"
                min={form.start_date || undefined}
                value={form.end_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    end_date: event.target.value,
                  }))
                }
              />
            </label>
            <label className={styles.notesField}>
              <span>Notes <small>Optional</small></span>
              <textarea
                maxLength={2000}
                rows={3}
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Internal context for Admin staff"
              />
            </label>
            <div className={styles.submitWrap}>
              <button type="submit" disabled={saving}>
                <Plus size={17} aria-hidden="true" />
                {saving
                  ? "Saving…"
                  : editingId
                    ? "Update Closure"
                    : "Add Closure"}
              </button>
            </div>
          </form>
        </section>

        {loading ? (
          <div className={styles.loading} role="status">Loading School Calendar…</div>
        ) : (
          <div className={styles.sections}>
            <section className={styles.section} aria-labelledby="upcoming-closures">
              <div className={styles.sectionHeading}>
                <div>
                  <span>Planned no-teaching dates</span>
                  <h2 id="upcoming-closures">Upcoming Closures</h2>
                </div>
                <strong>{upcoming.length}</strong>
              </div>
              {renderClosures(upcoming, "No upcoming closures.")}
            </section>

            <section className={styles.section} aria-labelledby="past-closures">
              <div className={styles.sectionHeading}>
                <div>
                  <span>Calendar history</span>
                  <h2 id="past-closures">Past Closures</h2>
                </div>
                <strong>{past.length}</strong>
              </div>
              {renderClosures(past, "No past closures.")}
            </section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
