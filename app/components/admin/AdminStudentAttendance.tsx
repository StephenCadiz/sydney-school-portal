"use client";

import { CalendarCheck2, Filter } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type AdminStudentAttendance,
  getEmptyClassAttendanceSummary,
} from "../../../lib/classRegister";
import { supabase } from "../../../lib/supabase";
import AttendanceSummaryCard from "../attendance/AttendanceSummaryCard";

type AttendanceFilter = "all" | "present" | "absent";

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function displayTime(value: string) {
  return String(value || "").slice(0, 5);
}

export default function AdminStudentAttendance({
  studentId,
  studentType,
  summaryOnly = false,
}: {
  studentId: string;
  studentType: "cambridge" | "young_learner";
  summaryOnly?: boolean;
}) {
  const [attendance, setAttendance] = useState<AdminStudentAttendance | null>(null);
  const [statusFilter, setStatusFilter] = useState<AttendanceFilter>("all");
  const [classFilter, setClassFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch(
        `/api/admin/students/${encodeURIComponent(
          studentId
        )}/attendance?studentType=${encodeURIComponent(studentType)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load attendance.");
      }
      setAttendance(payload as AdminStudentAttendance);
    } catch (caught) {
      console.error("Admin attendance history load failed:", caught);
      setError("Attendance could not be loaded. Please try again.");
      setAttendance(null);
    } finally {
      setLoading(false);
    }
  }, [studentId, studentType]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  const filteredHistory = useMemo(
    () =>
      (attendance?.history || []).filter(
        (row) =>
          (statusFilter === "all" || row.attendance_status === statusFilter) &&
          (classFilter === "all" || row.class_id === classFilter)
      ),
    [attendance?.history, classFilter, statusFilter]
  );
  const currentCourse = attendance?.courses.find(
    (course) => course.class_id === attendance.current_class_id
  );

  if (loading) {
    return <div className="admin-attendance-state">Loading attendance...</div>;
  }
  if (error || !attendance) {
    return (
      <div className="admin-attendance-state is-error" role="alert">
        <p>{error || "Attendance could not be loaded."}</p>
        <button type="button" onClick={() => void loadAttendance()}>
          Retry
        </button>
      </div>
    );
  }

  const summaryCard = (
    <AttendanceSummaryCard
      summary={attendance.summary || getEmptyClassAttendanceSummary()}
      description={
        currentCourse
          ? [currentCourse.label, currentCourse.academic_year_label]
              .filter(Boolean)
              .join(" · ")
          : "Current class or course context"
      }
    />
  );

  if (summaryOnly) return summaryCard;

  return (
    <div className="admin-student-attendance">
      {summaryCard}

      <section className="admin-attendance-history" aria-labelledby="admin-attendance-history-title">
        <div className="admin-attendance-history-heading">
          <div>
            <p>Parent query record</p>
            <h3 id="admin-attendance-history-title">Attendance Details</h3>
            <span>Completed registers only. Missing registers are never absences.</span>
          </div>
          <CalendarCheck2 aria-hidden="true" size={23} />
        </div>

        <div className="admin-attendance-filters">
          <div className="admin-attendance-status-filter" aria-label="Attendance status filter">
            {(["all", "present", "absent"] as AttendanceFilter[]).map((filter) => (
              <button
                type="button"
                key={filter}
                className={statusFilter === filter ? "is-active" : ""}
                aria-pressed={statusFilter === filter}
                onClick={() => setStatusFilter(filter)}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          {attendance.courses.length > 1 && (
            <label className="admin-attendance-course-filter">
              <Filter aria-hidden="true" size={16} />
              <span className="admin-attendance-visually-hidden">
                Filter attendance by class or course
              </span>
              <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                <option value="all">All classes and courses</option>
                {attendance.courses.map((course) => (
                  <option key={course.class_id} value={course.class_id}>
                    {[course.label, course.academic_year_label]
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {filteredHistory.length === 0 ? (
          <p className="admin-attendance-empty">
            No completed attendance records match these filters.
          </p>
        ) : (
          <div className="admin-attendance-history-list">
            {filteredHistory.map((row) => (
              <article key={row.entry_id}>
                <div className="admin-attendance-history-date">
                  <strong>{displayDate(row.lesson_date)}</strong>
                  <span>
                    {displayTime(row.scheduled_start_time)}–
                    {displayTime(row.scheduled_end_time)}
                  </span>
                </div>
                <span className={`admin-attendance-status is-${row.attendance_status}`}>
                  {row.attendance_status === "present" ? "Present" : "Absent"}
                </span>
                <div className="admin-attendance-history-context">
                  <strong>{row.class_name}</strong>
                  <span>
                    {[row.level_name, row.teacher_name, row.academic_year_label]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
