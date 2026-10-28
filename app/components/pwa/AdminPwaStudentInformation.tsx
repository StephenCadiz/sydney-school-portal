"use client";

import { Search, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  formatAverage,
  getAdminStudentAttendanceSummary,
  getStudentInformation,
  searchAllStudents,
} from "../../../lib/studentInformation";
import {
  getCambridgeReadingSkillLabel,
  normalizeHomeworkSkill,
} from "../../../lib/homework";
import { formatClockRange } from "../../../lib/timeDisplay";

function studentTypeLabel(type: string) {
  return type === "young_learner" ? "Young Learner" : "Cambridge";
}

function studentSubtitle(student: any) {
  return [student?.level_name, student?.class_label].filter(Boolean).join(" · ") || "Student information";
}

export default function AdminPwaStudentInformation() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setResults([]);
      setSearching(false);
      setError("");
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      setError("");
      void searchAllStudents(trimmedQuery)
        .then((data) => {
          if (active) setResults(data);
        })
        .catch((searchError: any) => {
          if (!active) return;
          setResults([]);
          setError(searchError?.message || "Unable to search students.");
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  async function openStudent(student: any) {
    setLoadingStudent(true);
    setError("");
    try {
      const information = await getStudentInformation(student.student_type, student.id);
      let attendanceSummary = null;
      try {
        attendanceSummary = await getAdminStudentAttendanceSummary(
          student.student_type,
          student.id
        );
      } catch {
        // The read-only profile remains useful if attendance is temporarily unavailable.
      }
      setSelectedStudent({ ...information, attendance_summary: attendanceSummary });
    } catch (loadError: any) {
      setError(loadError?.message || "Unable to load student information.");
    } finally {
      setLoadingStudent(false);
    }
  }

  return (
    <main className="admin-pwa-student-page" aria-labelledby="admin-pwa-student-title">
      <section className="admin-pwa-student-search-card">
        <div className="admin-pwa-student-heading">
          <div className="admin-pwa-calendar-icon" aria-hidden="true"><UserRound size={21} /></div>
          <div>
            <span className="admin-pwa-eyebrow">READ-ONLY LOOKUP</span>
            <h1 id="admin-pwa-student-title">Student Information</h1>
          </div>
        </div>
        <label className="admin-pwa-student-search">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only">Search student by name</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student name" autoComplete="off" />
        </label>
        {error && <p className="admin-pwa-student-state is-error" role="alert">{error}</p>}
        {query.trim() && !error && (
          <div className="admin-pwa-student-results" aria-live="polite">
            {searching ? <p className="admin-pwa-student-state">Searching…</p> : results.length === 0 ? <p className="admin-pwa-student-state">No matching students found.</p> : results.map((student) => (
              <button type="button" key={`${student.student_type}-${student.id}`} className="admin-pwa-student-result" onClick={() => void openStudent(student)}>
                <span className="admin-pwa-student-avatar" aria-hidden="true">{String(student.full_name || "S").trim().charAt(0).toUpperCase()}</span>
                <span className="admin-pwa-student-result-copy"><strong>{student.full_name}</strong><small>{studentSubtitle(student)}</small></span>
                <span className="admin-pwa-student-type">{studentTypeLabel(student.student_type)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedStudent && (
        <div className="admin-pwa-student-overlay" role="presentation">
          <button type="button" className="admin-pwa-student-overlay-backdrop" onClick={() => setSelectedStudent(null)} aria-label="Close student information" />
          <section className="admin-pwa-student-panel" role="dialog" aria-modal="true" aria-labelledby="admin-pwa-student-panel-title">
            <header>
              <div>
                <span className="admin-pwa-eyebrow">READ-ONLY INFORMATION</span>
                <h2 id="admin-pwa-student-panel-title">{selectedStudent.full_name || "Student"}</h2>
                <p className="admin-pwa-student-context">
                  {[selectedStudent.level_name, selectedStudent.teacher_name, [selectedStudent.class_days, formatClockRange(selectedStudent.start_time, selectedStudent.end_time, "-")].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button type="button" className="admin-pwa-student-close" onClick={() => setSelectedStudent(null)} aria-label="Close student information"><X size={20} /></button>
            </header>
            {loadingStudent ? <p className="admin-pwa-student-state">Loading student information…</p> : (
              <div className="admin-pwa-student-summary">
                <div className="admin-pwa-student-attendance" aria-label="Attendance summary">
                  <span>Attendance</span>
                  <strong>{selectedStudent.attendance_summary ? `${selectedStudent.attendance_summary.present_count} attended · ${selectedStudent.attendance_summary.absent_count} missed · ${selectedStudent.attendance_summary.attendance_percentage === null ? "—" : `${selectedStudent.attendance_summary.attendance_percentage}%`}` : "—"}</strong>
                </div>
                <div className="admin-pwa-student-performance">
                  <span>{selectedStudent.student_type === "young_learner" ? "Class exam average" : "Homework averages"}</span>
                  {selectedStudent.student_type === "young_learner" ? (
                    <strong>{formatAverage(selectedStudent.results_summary?.averages?.overall) === "-" ? "—" : `${formatAverage(selectedStudent.results_summary?.averages?.overall)}%`}</strong>
                  ) : (
                    <div className="admin-pwa-student-skill-grid">
                      {[
                        ["reading", getCambridgeReadingSkillLabel(selectedStudent.level_name)],
                        ["writing", "Writing"],
                        ["listening", "Listening"],
                      ].map(([skill, label]) => {
                        const item = (selectedStudent.results_summary?.practice?.skill_averages || []).find((entry: any) => normalizeHomeworkSkill(entry.skill) === skill);
                        const value = formatAverage(item?.average);
                        return <span key={skill}><small>{label}</small><strong>{value === "-" ? "—" : `${value}%`}</strong></span>;
                      })}
                    </div>
                  )}
                </div>
                <div className="admin-pwa-student-follow-up"><span>Follow-up documents</span><strong>{selectedStudent.follow_ups?.length ? "Yes" : "No"}</strong></div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
