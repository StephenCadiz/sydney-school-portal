"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import {
  CAMBRIDGE_EXAM_ASSIGNMENT_STATUS_LABELS,
  CAMBRIDGE_EXAM_COURSE_LABELS,
  CAMBRIDGE_EXAM_COURSE_TYPES,
  CAMBRIDGE_EXAM_LEVELS,
  CAMBRIDGE_EXAM_PARTS,
  CambridgeExamAssignmentRecord,
  CambridgeExamCourseType,
  CambridgeExamPartType,
  CambridgeExamRecord,
  formatExamName,
  getCambridgeExamAssignmentStatus,
  isDateOnly,
  RESOURCE_LABELS,
} from "../../../lib/cambridgeExamBank";
import { supabase } from "../../../lib/supabase";

async function token() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Your session has expired.");
  return data.session.access_token;
}

export default function CambridgeExamAssignmentEditor({
  assignment,
}: {
  assignment?: CambridgeExamAssignmentRecord;
}) {
  const router = useRouter();
  const editing = Boolean(assignment);
  const [exams, setExams] = useState<CambridgeExamRecord[]>([]);
  const [loadingExams, setLoadingExams] = useState(!editing);
  const [loadError, setLoadError] = useState("");
  const [level, setLevel] = useState(assignment?.level.name || "");
  const [examId, setExamId] = useState(assignment?.exam.id || "");
  const [partTypes, setPartTypes] = useState<CambridgeExamPartType[]>(
    assignment ? [assignment.part.part_type] : []
  );
  const [courseTypes, setCourseTypes] = useState<CambridgeExamCourseType[]>(
    assignment ? [assignment.course_type] : []
  );
  const [releaseDate, setReleaseDate] = useState(assignment?.release_date || "");
  const [dueDate, setDueDate] = useState(assignment?.due_date || "");
  const [active, setActive] = useState(assignment?.active || false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const levelRef = useRef<HTMLSelectElement | null>(null);
  const examRef = useRef<HTMLSelectElement | null>(null);
  const partsRef = useRef<HTMLFieldSetElement | null>(null);
  const coursesRef = useRef<HTMLFieldSetElement | null>(null);
  const releaseRef = useRef<HTMLInputElement | null>(null);
  const dueRef = useRef<HTMLInputElement | null>(null);

  async function loadExams() {
    setLoadingExams(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/exam-bank?status=active", {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load exams.");
      setExams((result.exams || []).filter(
        (exam: CambridgeExamRecord) => exam.active && !exam.archived_at
      ));
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Unable to load exams.");
    } finally {
      setLoadingExams(false);
    }
  }

  useEffect(() => {
    if (!editing) void loadExams();
  }, [editing]);

  const levelExams = exams.filter((exam) => exam.level.name === level);
  const selectedExam = exams.find((exam) => exam.id === examId);
  const selectedCount = partTypes.length * courseTypes.length;
  const previewStatus = getCambridgeExamAssignmentStatus({
    active,
    archived_at: assignment?.archived_at || null,
    release_date: releaseDate || null,
    due_date: dueDate || null,
  });

  function selectLevel(value: string) {
    setLevel(value);
    setExamId("");
    setPartTypes([]);
  }

  function selectExam(value: string) {
    setExamId(value);
    setPartTypes([]);
  }

  function togglePart(partType: CambridgeExamPartType) {
    setPartTypes((current) =>
      current.includes(partType)
        ? current.filter((item) => item !== partType)
        : [...current, partType]
    );
  }

  function toggleCourse(course: CambridgeExamCourseType) {
    setCourseTypes((current) =>
      current.includes(course)
        ? current.filter((item) => item !== course)
        : [...current, course]
    );
  }

  function selectCompleteExam() {
    if (!selectedExam?.completeness.ready) return;
    setPartTypes([...CAMBRIDGE_EXAM_PARTS]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const errors: Record<string, string> = {};
    if (!editing && !level) errors.level = "Choose an eligible Cambridge level.";
    if (!editing && !examId) errors.exam = "Choose an active Exam Bank exam.";
    if (!editing && partTypes.length === 0) errors.parts = "Choose at least one complete exam part.";
    if (!editing && courseTypes.length === 0) errors.courses = "Choose at least one course type.";
    if (releaseDate && !isDateOnly(releaseDate)) errors.release = "Enter a valid release date.";
    if (dueDate && !isDateOnly(dueDate)) errors.due = "Enter a valid due date.";
    if (releaseDate && dueDate && dueDate < releaseDate) {
      errors.due = "Due date cannot be earlier than release date.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(Object.values(errors)[0]);
      const first = Object.keys(errors)[0];
      const targets: Record<string, HTMLElement | null> = {
        level: levelRef.current,
        exam: examRef.current,
        parts: partsRef.current,
        courses: coursesRef.current,
        release: releaseRef.current,
        due: dueRef.current,
      };
      targets[first]?.focus();
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        editing
          ? `/api/admin/exam-bank/assignments/${assignment!.id}`
          : "/api/admin/exam-bank/assignments",
        {
          method: editing ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${await token()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            editing
              ? {
                  release_date: releaseDate || null,
                  due_date: dueDate || null,
                  active,
                }
              : {
                  exam_set_id: examId,
                  part_types: partTypes,
                  course_types: courseTypes,
                  release_date: releaseDate || null,
                  due_date: dueDate || null,
                  active,
                }
          ),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save assignments.");
      if (editing) {
        setSuccess("Assignment updated.");
        router.refresh();
      } else {
        router.push("/admin/exam-bank/assignments");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save assignments.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="exam-assignment-editor" onSubmit={submit} noValidate>
      {loadError && (
        <div className="exam-bank-notice is-error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void loadExams()}>Retry</button>
        </div>
      )}
      {error && <div className="exam-bank-notice is-error" role="alert">{error}</div>}
      {success && <div className="exam-bank-notice is-success" role="status">{success}</div>}

      {editing ? (
        <section className="exam-assignment-context" aria-label="Immutable assignment context">
          <div><span>Level</span><strong>{assignment!.level.name}</strong></div>
          <div><span>Exam</span><strong>{formatExamName(assignment!.level.name, assignment!.exam.exam_number, assignment!.exam.title)}</strong></div>
          <div><span>Part</span><strong>{assignment!.part.display_label}</strong></div>
          <div><span>Course</span><strong>{CAMBRIDGE_EXAM_COURSE_LABELS[assignment!.course_type]}</strong></div>
        </section>
      ) : (
        <>
          <section className="exam-assignment-section">
            <h2>1. Choose the exam</h2>
            <div className="exam-assignment-fields">
              <label>Level
                <select ref={levelRef} value={level} disabled={loadingExams || Boolean(loadError)} aria-describedby={fieldErrors.level ? "assignment-level-error" : undefined} onChange={(event) => selectLevel(event.target.value)}>
                  <option value="">Choose level</option>
                  {CAMBRIDGE_EXAM_LEVELS.map((item) => <option key={item}>{item}</option>)}
                </select>
                {fieldErrors.level && <small id="assignment-level-error" className="exam-bank-field-error">{fieldErrors.level}</small>}
              </label>
              <label>Exam
                <select ref={examRef} value={examId} disabled={!level || levelExams.length === 0} aria-describedby={[fieldErrors.exam ? "assignment-exam-error" : "", level && levelExams.length === 0 ? "assignment-exam-empty" : ""].filter(Boolean).join(" ") || undefined} onChange={(event) => selectExam(event.target.value)}>
                  <option value="">Choose active exam</option>
                  {levelExams.map((exam) => <option key={exam.id} value={exam.id}>{formatExamName(exam.level.name, exam.exam_number, exam.title)}</option>)}
                </select>
                {fieldErrors.exam && <small id="assignment-exam-error" className="exam-bank-field-error">{fieldErrors.exam}</small>}
                {level && !loadingExams && !loadError && levelExams.length === 0 && <small id="assignment-exam-empty" className="exam-assignment-empty-note">No active Exam Bank exams are available for {level}.</small>}
              </label>
            </div>
          </section>

          <fieldset ref={partsRef} tabIndex={-1} className="exam-assignment-section" disabled={!selectedExam} aria-describedby={fieldErrors.parts ? "assignment-parts-error" : undefined}>
            <legend>2. Choose exam parts</legend>
            <button type="button" className="exam-bank-button is-secondary" disabled={!selectedExam?.completeness.ready} onClick={selectCompleteExam}>
              Assign complete exam
            </button>
            <div className="exam-assignment-options">
              {selectedExam?.parts.map((part) => (
                <label key={part.part_type} className={!part.complete ? "is-disabled" : ""}>
                  <input type="checkbox" checked={partTypes.includes(part.part_type)} disabled={!part.complete} onChange={() => togglePart(part.part_type)} />
                  <span><strong>{part.display_label}</strong>
                    <small>{part.complete ? "Complete" : `Missing ${part.missing_resources.map((item) => RESOURCE_LABELS[item].toLowerCase()).join(", ")}`}</small>
                  </span>
                </label>
              ))}
            </div>
            {fieldErrors.parts && <small id="assignment-parts-error" className="exam-bank-field-error">{fieldErrors.parts}</small>}
          </fieldset>

          <fieldset ref={coursesRef} tabIndex={-1} className="exam-assignment-section" aria-describedby={fieldErrors.courses ? "assignment-courses-error" : undefined}>
            <legend>3. Choose course types</legend>
            <div className="exam-assignment-options is-courses">
              {CAMBRIDGE_EXAM_COURSE_TYPES.map((course) => (
                <label key={course}>
                  <input type="checkbox" checked={courseTypes.includes(course)} onChange={() => toggleCourse(course)} />
                  <span><strong>{CAMBRIDGE_EXAM_COURSE_LABELS[course]}</strong></span>
                </label>
              ))}
            </div>
            {fieldErrors.courses && <small id="assignment-courses-error" className="exam-bank-field-error">{fieldErrors.courses}</small>}
          </fieldset>
        </>
      )}

      <section className="exam-assignment-section">
        <h2>{editing ? "Schedule and status" : "4. Schedule and status"}</h2>
        <div className="exam-assignment-fields">
          <label>Release date<input ref={releaseRef} type="date" value={releaseDate} aria-describedby={fieldErrors.release ? "assignment-release-error" : undefined} onChange={(event) => setReleaseDate(event.target.value)} />{fieldErrors.release && <small id="assignment-release-error" className="exam-bank-field-error">{fieldErrors.release}</small>}</label>
          <label>Due date<input ref={dueRef} type="date" value={dueDate} aria-describedby={fieldErrors.due ? "assignment-due-error" : undefined} onChange={(event) => setDueDate(event.target.value)} />{fieldErrors.due && <small id="assignment-due-error" className="exam-bank-field-error">{fieldErrors.due}</small>}</label>
        </div>
        <fieldset className="exam-assignment-status-choice">
          <legend>Save status</legend>
          <label><input type="radio" name="active" checked={!active} onChange={() => setActive(false)} /> Save as Draft</label>
          <label><input type="radio" name="active" checked={active} disabled={Boolean(assignment?.archived_at)} onChange={() => setActive(true)} /> Activate assignment</label>
          <p>Scheduled status is derived automatically when an active assignment has a future release date.</p>
          {assignment?.archived_at && <p>Restore this assignment before activating it.</p>}
        </fieldset>
      </section>

      {!editing && selectedExam && (
        <section className="exam-assignment-review" aria-live="polite">
          <h2>Review and assign</h2>
          <strong>{formatExamName(selectedExam.level.name, selectedExam.exam_number, selectedExam.title)}</strong>
          <p>Parts: {partTypes.map((part) => selectedExam.parts.find((item) => item.part_type === part)?.display_label).join(", ") || "None selected"}</p>
          <p>Courses: {courseTypes.map((course) => CAMBRIDGE_EXAM_COURSE_LABELS[course]).join(", ") || "None selected"}</p>
          <p><strong>{selectedCount} assignment record{selectedCount === 1 ? "" : "s"} will be created.</strong></p>
          <p>Release: {releaseDate || "Immediately when active"}</p>
          <p>Due: {dueDate || "No due date"}</p>
          <p>Status: {CAMBRIDGE_EXAM_ASSIGNMENT_STATUS_LABELS[previewStatus]}</p>
        </section>
      )}

      <div className="exam-bank-editor-actions">
        <Link className="exam-bank-button is-secondary" href="/admin/exam-bank/assignments">Cancel</Link>
        <button className="exam-bank-button" type="submit" disabled={saving || (!editing && (loadingExams || Boolean(loadError) || (Boolean(level) && levelExams.length === 0)))}>
          {saving ? "Saving…" : editing ? "Save Changes" : "Assign Exam"}
        </button>
      </div>
    </form>
  );
}
