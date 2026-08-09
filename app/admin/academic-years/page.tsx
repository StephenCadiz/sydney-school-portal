"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  createAcademicYear,
  getAdminAcademicYears,
  updateAcademicYear,
} from "../../../lib/academicYears";
import type { AcademicYear } from "../../../lib/academicYearRules";
import styles from "./AcademicYears.module.css";

const emptyForm = { label: "", start_date: "", end_date: "" };

function formatDate(value: string) {
  if (!value) return "Date not set";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(new Date(`${value}T12:00:00Z`));
}

function statusClass(status: AcademicYear["status"]) {
  if (status === "current") return `${styles.status} ${styles.statusCurrent}`;
  if (status === "future") return `${styles.status} ${styles.statusFuture}`;
  return `${styles.status} ${styles.statusArchived}`;
}

export default function AdminAcademicYearsPage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const currentAcademicYear = useMemo(
    () => academicYears.find((year) => year.status === "current") || null,
    [academicYears]
  );

  const loadAcademicYears = useCallback(async () => {
    setLoading(true);
    try {
      setAcademicYears(await getAdminAcademicYears());
      setIsError(false);
    } catch (error) {
      console.error("Unable to load academic years:", error);
      setAcademicYears([]);
      setMessage("Unable to load academic years.");
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAcademicYears();
  }, [loadAcademicYears]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId("");
  }

  function startEdit(year: AcademicYear) {
    setEditingId(year.id);
    setForm({
      label: year.label,
      start_date: year.start_date,
      end_date: year.end_date,
    });
    setMessage("");
    setIsError(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    if (!form.label.trim()) {
      setMessage("Academic year label is required.");
      setIsError(true);
      return;
    }
    if (!form.start_date || !form.end_date || form.end_date < form.start_date) {
      setMessage("Choose an end date on or after the start date.");
      setIsError(true);
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateAcademicYear(editingId, {
          action: "update",
          label: form.label.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
        });
        setMessage("Academic year updated successfully.");
      } else {
        await createAcademicYear({
          label: form.label.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
        });
        setMessage("Future academic year created successfully.");
      }
      resetForm();
      await loadAcademicYears();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save the academic year."
      );
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function setCurrent(year: AcademicYear) {
    if (
      !confirm(
        `Set ${year.label} as the Current academic year? Teacher and student annual-course views will switch to this year.`
      )
    ) {
      return;
    }

    setSaving(true);
    setMessage("");
    setIsError(false);
    try {
      await updateAcademicYear(year.id, { action: "set_current" });
      setMessage(`${year.label} is now the Current academic year.`);
      await loadAcademicYears();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to change the current year."
      );
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function archiveYear(year: AcademicYear) {
    if (!confirm(`Archive ${year.label}? Its classes and history will be preserved.`)) {
      return;
    }

    setSaving(true);
    setMessage("");
    setIsError(false);
    try {
      await updateAcademicYear(year.id, { action: "archive" });
      setMessage(`${year.label} archived. No class or enrolment data was changed.`);
      await loadAcademicYears();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to archive the academic year."
      );
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <main className={styles.page}>
        <header className={styles.heading}>
          <div>
            <h1>Academic Years</h1>
            <p>Manage the annual September–June context used across the portal.</p>
          </div>
          <div className={styles.currentSummary}>
            <span>Current Academic Year</span>
            <strong>{currentAcademicYear?.label || "Not set"}</strong>
          </div>
        </header>

        {message && (
          <div
            className={`${styles.message}${
              isError ? ` ${styles.messageError}` : ""
            }`}
            role={isError ? "alert" : "status"}
          >
            {message}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.formHeader}>
            <div>
              <h2>{editingId ? "Edit Academic Year" : "Create Academic Year"}</h2>
              <p>New years are created as Future until explicitly made Current.</p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Label</span>
              <input
                required
                value={form.label}
                placeholder="2027–2028"
                onChange={(event) =>
                  setForm((current) => ({ ...current, label: event.target.value }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>Start date</span>
              <input
                required
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    start_date: event.target.value,
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>End date</span>
              <input
                required
                type="date"
                min={form.start_date || undefined}
                value={form.end_date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, end_date: event.target.value }))
                }
              />
            </label>
          </div>

          <div className={styles.formActions}>
            <button className={styles.primaryButton} disabled={saving} type="submit">
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Academic Year"}
            </button>
            {editingId && (
              <button
                className={styles.secondaryButton}
                disabled={saving}
                type="button"
                onClick={resetForm}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>

        <section className={styles.listSection}>
          <div className={styles.listHeader}>
            <div>
              <h2>Academic Year Records</h2>
              <p>Changing Current changes portal context, never enrolment history.</p>
            </div>
          </div>

          {loading ? (
            <div className={styles.empty}>Loading academic years...</div>
          ) : academicYears.length === 0 ? (
            <div className={styles.empty}>No academic years are available.</div>
          ) : (
            <div className={styles.yearList}>
              {academicYears.map((year) => (
                <article
                  className={`${styles.yearRow}${
                    year.status === "current" ? ` ${styles.yearRowCurrent}` : ""
                  }`}
                  key={year.id}
                >
                  <div className={styles.yearIdentity}>
                    <div className={styles.yearTitleLine}>
                      <h3>{year.label}</h3>
                      <span className={statusClass(year.status)}>{year.status}</span>
                    </div>
                    <p>
                      {year.class_count || 0} {(year.class_count || 0) === 1 ? "class" : "classes"}
                    </p>
                  </div>
                  <div className={styles.yearDates}>
                    <strong>
                      {formatDate(year.start_date)} – {formatDate(year.end_date)}
                    </strong>
                    <p>Admin-configured annual course dates</p>
                  </div>
                  <div className={styles.yearActions}>
                    <button
                      className={styles.secondaryButton}
                      disabled={saving}
                      type="button"
                      onClick={() => startEdit(year)}
                    >
                      Edit Dates
                    </button>
                    {year.status !== "current" && (
                      <button
                        className={styles.primaryButton}
                        disabled={saving}
                        type="button"
                        onClick={() => void setCurrent(year)}
                      >
                        Set as Current
                      </button>
                    )}
                    {year.status !== "current" && year.status !== "archived" && (
                      <button
                        className={styles.archiveButton}
                        disabled={saving}
                        type="button"
                        onClick={() => void archiveYear(year)}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </AdminLayout>
  );
}
