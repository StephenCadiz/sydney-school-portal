"use client";

import { Search, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";

import { getStudentAcademicYearDisplayValue } from "../../../lib/academicYearRules";
import { getStudentInformation, searchAllStudents } from "../../../lib/studentInformation";

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
      setSelectedStudent(await getStudentInformation(student.student_type, student.id));
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
                <p>{studentSubtitle(selectedStudent)}</p>
              </div>
              <button type="button" className="admin-pwa-student-close" onClick={() => setSelectedStudent(null)} aria-label="Close student information"><X size={20} /></button>
            </header>
            {loadingStudent ? <p className="admin-pwa-student-state">Loading student information…</p> : (
              <div className="admin-pwa-student-facts">
                <div><span>Type</span><strong>{studentTypeLabel(selectedStudent.student_type)}</strong></div>
                <div><span>Level</span><strong>{selectedStudent.level_name || "Unknown level"}</strong></div>
                <div><span>Class</span><strong>{selectedStudent.class_label || "Class not found"}</strong></div>
                <div><span>Current academic year</span><strong>{getStudentAcademicYearDisplayValue(selectedStudent)}</strong></div>
                <div><span>Teacher</span><strong>{selectedStudent.teacher_name || "No teacher assigned"}</strong></div>
                <div><span>Days / time</span><strong>{[selectedStudent.class_days, selectedStudent.start_time && selectedStudent.end_time ? `${selectedStudent.start_time}-${selectedStudent.end_time}` : ""].filter(Boolean).join(" ") || "-"}</strong></div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
