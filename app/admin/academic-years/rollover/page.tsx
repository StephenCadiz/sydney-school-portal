"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  Copy,
  ExternalLink,
  Save,
  School,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import AdminLayout from "../../../components/layout/AdminLayout";
import {
  applyAcademicYearRollover,
  copyAcademicYearRolloverClasses,
  createAcademicYearRollover,
  getAcademicYearRolloverLanding,
  getAcademicYearRolloverWorkspace,
  saveAcademicYearRolloverDecisions,
} from "../../../../lib/academicYearRollover";
import {
  getRolloverDecisionLabel,
  targetClassMatchesDecision,
  type AcademicYearRollover,
  type AcademicYearRolloverDecision,
  type AcademicYearRolloverWorkspace,
  type RolloverClass,
  type RolloverStudent,
} from "../../../../lib/academicYearRolloverRules";
import type { AcademicYear } from "../../../../lib/academicYearRules";
import styles from "./Rollover.module.css";

type StudentDraft = {
  decision: AcademicYearRolloverDecision;
  target_class_id: string | null;
  notes: string;
};

type ClassDraft = {
  selected: boolean;
  teacher_id: string;
  classroom_id: string | null;
};

type StudentFilter = "all" | "ready" | "decide_later" | "not_returning" | "applied";

const decisions: AcademicYearRolloverDecision[] = [
  "decide_later",
  "promote",
  "repeat",
  "different_level",
  "not_returning",
];

function formatTime(value: string) {
  return String(value || "").slice(0, 5) || "--:--";
}

function classSchedule(classroom: RolloverClass) {
  return `${classroom.days || "Days not set"} · ${formatTime(
    classroom.start_time
  )}–${formatTime(classroom.end_time)}`;
}

function classOption(classroom: RolloverClass) {
  return `${classroom.level_name} · ${classroom.course_type || "Regular"} · ${
    classroom.days || "Days not set"
  } · ${formatTime(classroom.start_time)}–${formatTime(classroom.end_time)} · ${
    classroom.teacher_name
  }`;
}

function statusLabel(status: AcademicYearRollover["status"]) {
  if (status === "partially_applied") return "Partially Applied";
  if (status === "completed") return "Completed";
  return "Draft";
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AcademicYearRolloverPage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [rollovers, setRollovers] = useState<AcademicYearRollover[]>([]);
  const [sourceYearId, setSourceYearId] = useState("");
  const [targetYearId, setTargetYearId] = useState("");
  const [workspace, setWorkspace] = useState<AcademicYearRolloverWorkspace | null>(
    null
  );
  const [classDrafts, setClassDrafts] = useState<Record<string, ClassDraft>>({});
  const [studentDrafts, setStudentDrafts] = useState<
    Record<string, StudentDraft>
  >({});
  const [dirtyStudentIds, setDirtyStudentIds] = useState<Set<string>>(new Set());
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(
    new Set()
  );
  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<StudentFilter>("all");
  const [classFilter, setClassFilter] = useState("all");
  const [bulkDecision, setBulkDecision] =
    useState<AcademicYearRolloverDecision>("decide_later");
  const [bulkTargetClassId, setBulkTargetClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const initializeWorkspace = useCallback(
    (nextWorkspace: AcademicYearRolloverWorkspace) => {
      setWorkspace(nextWorkspace);
      setClassDrafts(
        Object.fromEntries(
          nextWorkspace.source_classes.map((classroom) => [
            classroom.id,
            {
              selected: false,
              teacher_id: classroom.teacher_id,
              classroom_id: classroom.classroom_id,
            },
          ])
        )
      );
      setStudentDrafts(
        Object.fromEntries(
          nextWorkspace.students.map((student) => [
            student.id,
            {
              decision: student.decision,
              target_class_id: student.target_class_id,
              notes: student.notes,
            },
          ])
        )
      );
      setDirtyStudentIds(new Set());
      setSelectedStudentIds(new Set());
    },
    []
  );

  const loadLanding = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAcademicYearRolloverLanding();
      setAcademicYears(data.academic_years);
      setRollovers(data.rollovers);
      const current = data.academic_years.find((year) => year.status === "current");
      const future = [...data.academic_years]
        .filter((year) => year.status === "future")
        .sort((first, second) => first.start_date.localeCompare(second.start_date))[0];
      setSourceYearId((value) => value || current?.id || "");
      setTargetYearId((value) => value || future?.id || "");
    } catch (error) {
      setMessage(messageFrom(error, "Unable to load academic year preparation."));
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLanding();
  }, [loadLanding]);

  async function openRollover(rolloverId: string) {
    setLoading(true);
    setMessage("");
    setIsError(false);
    try {
      initializeWorkspace(await getAcademicYearRolloverWorkspace(rolloverId));
    } catch (error) {
      setMessage(messageFrom(error, "Unable to open the rollover workspace."));
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  async function refreshWorkspace() {
    if (!workspace) return;
    initializeWorkspace(
      await getAcademicYearRolloverWorkspace(workspace.rollover.id)
    );
  }

  async function startRollover(event: React.FormEvent) {
    event.preventDefault();
    if (!sourceYearId || !targetYearId) {
      setMessage("Choose Source and Target academic years.");
      setIsError(true);
      return;
    }
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      const rollover = await createAcademicYearRollover({
        source_academic_year_id: sourceYearId,
        target_academic_year_id: targetYearId,
      });
      await openRollover(rollover.id);
      await loadLanding();
      setMessage("Academic year preparation workspace is ready.");
    } catch (error) {
      setMessage(messageFrom(error, "Unable to start academic year preparation."));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  function updateClassDraft(classId: string, updates: Partial<ClassDraft>) {
    setClassDrafts((current) => ({
      ...current,
      [classId]: { ...current[classId], ...updates },
    }));
  }

  async function copyClasses(copyAll = false) {
    if (!workspace) return;
    if (workspace.target_year.status !== "future") {
      setMessage("Classes can only be copied while the Target year is Future.");
      setIsError(true);
      return;
    }
    const sourceClasses = workspace.source_classes.filter(
      (classroom) =>
        !classroom.copied_target_class_id &&
        (copyAll || classDrafts[classroom.id]?.selected)
    );
    if (!sourceClasses.length) {
      setMessage("Select at least one class that has not already been copied.");
      setIsError(true);
      return;
    }
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      await copyAcademicYearRolloverClasses(
        workspace.rollover.id,
        sourceClasses.map((classroom) => ({
          source_class_id: classroom.id,
          teacher_id: classDrafts[classroom.id]?.teacher_id || classroom.teacher_id,
          classroom_id:
            classDrafts[classroom.id]?.classroom_id ?? classroom.classroom_id,
        }))
      );
      await refreshWorkspace();
      setMessage(
        `${sourceClasses.length} ${
          sourceClasses.length === 1 ? "class" : "classes"
        } prepared successfully.`
      );
    } catch (error) {
      try {
        await refreshWorkspace();
      } catch (refreshError) {
        console.error("Unable to refresh partially copied classes:", refreshError);
      }
      setMessage(messageFrom(error, "Unable to copy the selected classes."));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  function updateStudentDraft(studentId: string, updates: Partial<StudentDraft>) {
    setStudentDrafts((current) => ({
      ...current,
      [studentId]: { ...current[studentId], ...updates },
    }));
    setDirtyStudentIds((current) => new Set(current).add(studentId));
  }

  function changeStudentDecision(
    student: RolloverStudent,
    decision: AcademicYearRolloverDecision
  ) {
    const currentTarget = studentDrafts[student.id]?.target_class_id || null;
    const currentStudent = { ...student, decision };
    const targetStillMatches = workspace?.target_classes.some(
      (classroom) =>
        classroom.id === currentTarget &&
        targetClassMatchesDecision(currentStudent, classroom)
    );
    updateStudentDraft(student.id, {
      decision,
      target_class_id:
        decision === "decide_later" || decision === "not_returning"
          ? null
          : targetStillMatches
          ? currentTarget
          : null,
    });
  }

  async function saveDraft() {
    if (workspace?.target_year.status !== "future") {
      setMessage("Progression decisions are read-only after the Target year stops being Future.");
      setIsError(true);
      return;
    }
    if (!workspace || dirtyStudentIds.size === 0) {
      setMessage("There are no unsaved progression changes.");
      setIsError(false);
      return;
    }
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      const changedStudents = workspace.students.filter((student) =>
        dirtyStudentIds.has(student.id)
      );
      await saveAcademicYearRolloverDecisions(
        workspace.rollover.id,
        changedStudents.map((student) => ({
          id: student.id,
          ...studentDrafts[student.id],
        }))
      );
      await refreshWorkspace();
      setMessage("Progression decisions saved as Draft.");
    } catch (error) {
      setMessage(messageFrom(error, "Unable to save progression decisions."));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  const selectedStudents = useMemo(
    () =>
      (workspace?.students || []).filter((student) =>
        selectedStudentIds.has(student.id)
      ),
    [selectedStudentIds, workspace]
  );

  const bulkTargetOptions = useMemo(() => {
    if (!workspace || !selectedStudents.length) return [];
    if (bulkDecision === "decide_later" || bulkDecision === "not_returning") {
      return [];
    }
    return workspace.target_classes.filter((classroom) =>
      selectedStudents.every((student) =>
        targetClassMatchesDecision({ ...student, decision: bulkDecision }, classroom)
      )
    );
  }, [bulkDecision, selectedStudents, workspace]);

  function applyBulkDecision() {
    if (workspace?.target_year.status !== "future") {
      setMessage("Progression decisions are read-only after the Target year stops being Future.");
      setIsError(true);
      return;
    }
    if (!selectedStudents.length) {
      setMessage("Select at least one student for the bulk action.");
      setIsError(true);
      return;
    }
    const requiresTarget = !["decide_later", "not_returning"].includes(
      bulkDecision
    );
    if (requiresTarget && !bulkTargetClassId) {
      setMessage("Choose one target class for the selected students.");
      setIsError(true);
      return;
    }
    for (const student of selectedStudents) {
      updateStudentDraft(student.id, {
        decision: bulkDecision,
        target_class_id: requiresTarget ? bulkTargetClassId : null,
      });
    }
    setMessage(
      `${getRolloverDecisionLabel(bulkDecision)} prepared for ${
        selectedStudents.length
      } selected students. Save Draft to persist it.`
    );
    setIsError(false);
  }

  async function applyRollover() {
    if (!workspace) return;
    if (dirtyStudentIds.size > 0) {
      setMessage("Save Draft before applying assignments.");
      setIsError(true);
      return;
    }
    if (workspace.summary.ready_not_applied === 0) {
      setMessage("There are no ready decisions waiting to be applied.");
      setIsError(false);
      return;
    }
    const warning = [
      `Apply ${workspace.summary.ready_not_applied} ready decisions?`,
      "",
      "This creates new target-year enrolments and preserves every source-year enrolment.",
      workspace.summary.decide_later
        ? `${workspace.summary.decide_later} Decide Later students will remain unchanged.`
        : "All students have a decision.",
    ].join("\n");
    if (!confirm(warning)) return;

    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      await applyAcademicYearRollover(workspace.rollover.id);
      await refreshWorkspace();
      setMessage("Ready progression decisions applied successfully.");
    } catch (error) {
      setMessage(messageFrom(error, "Unable to apply progression decisions."));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  const visibleStudents = useMemo(() => {
    if (!workspace) return [];
    const searchValue = search.trim().toLowerCase();
    return workspace.students.filter((student) => {
      const draft = studentDrafts[student.id] || student;
      const matchesSearch =
        !searchValue ||
        `${student.full_name} ${student.source_level_name} ${student.source_class_name}`
          .toLowerCase()
          .includes(searchValue);
      const matchesClass =
        classFilter === "all" || student.source_class_id === classFilter;
      const matchesStatus =
        studentFilter === "all" ||
        (studentFilter === "ready" && draft.decision !== "decide_later") ||
        (studentFilter === "decide_later" && draft.decision === "decide_later") ||
        (studentFilter === "not_returning" &&
          draft.decision === "not_returning") ||
        (studentFilter === "applied" && Boolean(student.applied_at));
      return matchesSearch && matchesClass && matchesStatus;
    });
  }, [classFilter, search, studentDrafts, studentFilter, workspace]);

  const groupedStudents = useMemo(() => {
    const groups = new Map<string, RolloverStudent[]>();
    for (const student of visibleStudents) {
      groups.set(student.source_class_id, [
        ...(groups.get(student.source_class_id) || []),
        student,
      ]);
    }
    return Array.from(groups.entries());
  }, [visibleStudents]);

  const targetIsFuture = workspace?.target_year.status === "future";

  if (loading && !workspace) {
    return (
      <AdminLayout>
        <div className={styles.loading}>Loading academic year preparation...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <Link className={styles.backLink} href="/admin/academic-years">
              <ArrowLeft size={16} aria-hidden="true" /> Academic Years
            </Link>
            <h1>Prepare Next Academic Year</h1>
            <p>Prepare classes and future enrolments without altering current history.</p>
          </div>
          {workspace && (
            <span className={`${styles.status} ${styles[`status_${workspace.rollover.status}`]}`}>
              {statusLabel(workspace.rollover.status)}
            </span>
          )}
        </header>

        {message && (
          <div
            className={`${styles.message} ${isError ? styles.messageError : ""}`}
            role={isError ? "alert" : "status"}
          >
            {message}
          </div>
        )}

        {!workspace ? (
          <div className={styles.landingGrid}>
            <form className={styles.panel} onSubmit={startRollover}>
              <div className={styles.sectionHeading}>
                <CalendarRange size={21} aria-hidden="true" />
                <div>
                  <h2>Start Preparation</h2>
                  <p>The Target year must already exist with Future status.</p>
                </div>
              </div>
              <div className={styles.setupFields}>
                <label className={styles.field}>
                  <span>Source Academic Year</span>
                  <select
                    required
                    value={sourceYearId}
                    onChange={(event) => setSourceYearId(event.target.value)}
                  >
                    <option value="">Choose source year</option>
                    {academicYears.map((year) => (
                      <option key={year.id} value={year.id}>
                        {year.label} · {year.status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Target Academic Year</span>
                  <select
                    required
                    value={targetYearId}
                    onChange={(event) => setTargetYearId(event.target.value)}
                  >
                    <option value="">Choose Future year</option>
                    {academicYears
                      .filter((year) => year.status === "future")
                      .map((year) => (
                        <option key={year.id} value={year.id}>
                          {year.label}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {academicYears.every((year) => year.status !== "future") && (
                <p className={styles.notice}>
                  Create a Future academic year on the Academic Years page first.
                </p>
              )}
              <button className={styles.primaryButton} disabled={busy} type="submit">
                <CalendarRange size={17} aria-hidden="true" />
                {busy ? "Preparing..." : "Prepare Next Academic Year"}
              </button>
            </form>

            <section className={styles.panel}>
              <div className={styles.sectionHeading}>
                <School size={21} aria-hidden="true" />
                <div>
                  <h2>Existing Preparations</h2>
                  <p>Return to a saved Draft or partially applied rollover.</p>
                </div>
              </div>
              {rollovers.length ? (
                <div className={styles.rolloverList}>
                  {rollovers.map((rollover) => {
                    const source = academicYears.find(
                      (year) => year.id === rollover.source_academic_year_id
                    );
                    const target = academicYears.find(
                      (year) => year.id === rollover.target_academic_year_id
                    );
                    return (
                      <button
                        className={styles.rolloverListItem}
                        key={rollover.id}
                        type="button"
                        onClick={() => void openRollover(rollover.id)}
                      >
                        <span>
                          <strong>
                            {source?.label || "Source"} → {target?.label || "Target"}
                          </strong>
                          <small>{statusLabel(rollover.status)}</small>
                        </span>
                        <ExternalLink size={17} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.empty}>No academic year preparations yet.</p>
              )}
            </section>
          </div>
        ) : (
          <>
            <nav className={styles.sectionNav} aria-label="Rollover sections">
              <a href="#year-summary">Year Summary</a>
              <a href="#prepare-classes">Prepare Classes</a>
              <a href="#student-progression">Student Progression</a>
              <a href="#review-apply">Review & Apply</a>
              <a href="#rollover-summary">Rollover Summary</a>
            </nav>

            {!targetIsFuture && (
              <div className={styles.message} role="status">
                The Target academic year is {workspace.target_year.status}. Class copy
                and progression decisions are now read-only; unapplied ready decisions
                may still be applied safely.
              </div>
            )}

            <section className={styles.panel} id="year-summary">
              <div className={styles.sectionHeading}>
                <CalendarRange size={21} aria-hidden="true" />
                <div>
                  <span className={styles.stepLabel}>1. Academic Year Summary</span>
                  <h2>
                    {workspace.source_year.label} → {workspace.target_year.label}
                  </h2>
                  <p>Admin status remains authoritative; this does not change Current year.</p>
                </div>
              </div>
              <div className={styles.metricStrip}>
                <div><span>Source classes</span><strong>{workspace.source_classes.length}</strong></div>
                <div><span>Target classes</span><strong>{workspace.summary.classes_prepared}</strong></div>
                <div><span>Students</span><strong>{workspace.summary.total_students}</strong></div>
                <div><span>Outstanding</span><strong>{workspace.summary.decide_later}</strong></div>
              </div>
            </section>

            <section className={styles.panel} id="prepare-classes">
              <div className={styles.sectionToolbar}>
                <div className={styles.sectionHeading}>
                  <Copy size={21} aria-hidden="true" />
                  <div>
                    <span className={styles.stepLabel}>2. Prepare Classes</span>
                    <h2>Copy annual class structure</h2>
                    <p>Teachers and classrooms are editable before each copy.</p>
                  </div>
                </div>
                <div className={styles.toolbarActions}>
                  <Link className={styles.secondaryButton} href="/admin/classes">
                    Manage Classes <ExternalLink size={15} aria-hidden="true" />
                  </Link>
                  <button
                    className={styles.secondaryButton}
                    disabled={busy || !targetIsFuture}
                    type="button"
                    onClick={() => void copyClasses(true)}
                  >
                    Copy All Eligible
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={busy || !targetIsFuture}
                    type="button"
                    onClick={() => void copyClasses(false)}
                  >
                    <Copy size={16} aria-hidden="true" /> Copy Selected
                  </button>
                </div>
              </div>

              <div className={styles.classList}>
                {workspace.source_classes.map((classroom) => {
                  const draft = classDrafts[classroom.id];
                  const copied = Boolean(classroom.copied_target_class_id);
                  const online = classroom.course_type.trim().toLowerCase() === "online";
                  return (
                    <article className={styles.classRow} key={classroom.id}>
                      <label className={styles.rowCheckbox}>
                        <input
                          checked={draft?.selected || false}
                          disabled={copied || busy || !targetIsFuture}
                          type="checkbox"
                          onChange={(event) =>
                            updateClassDraft(classroom.id, {
                              selected: event.target.checked,
                            })
                          }
                        />
                        <span className={styles.srOnly}>Select {classroom.class_name}</span>
                      </label>
                      <div className={styles.classIdentity}>
                        <strong>{classroom.level_name}</strong>
                        <span>{classroom.class_name}</span>
                        <small>{classSchedule(classroom)}</small>
                      </div>
                      <label className={styles.compactField}>
                        <span>Teacher</span>
                        <select
                          disabled={copied || busy || !targetIsFuture}
                          value={draft?.teacher_id || classroom.teacher_id}
                          onChange={(event) =>
                            updateClassDraft(classroom.id, {
                              teacher_id: event.target.value,
                            })
                          }
                        >
                          {workspace.teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                          ))}
                        </select>
                      </label>
                      {online ? (
                        <div className={styles.onlineContext}>
                          <span>Online</span>
                          <small>Existing Meet setup will be preserved.</small>
                        </div>
                      ) : (
                        <label className={styles.compactField}>
                          <span>Classroom</span>
                          <select
                            disabled={copied || busy || !targetIsFuture}
                            value={draft?.classroom_id || ""}
                            onChange={(event) =>
                              updateClassDraft(classroom.id, {
                                classroom_id: event.target.value || null,
                              })
                            }
                          >
                            <option value="">Choose classroom</option>
                            {workspace.classrooms.map((room) => (
                              <option key={room.id} value={room.id}>{room.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className={styles.rowStatus}>
                        {copied ? (
                          <><CheckCircle2 size={16} aria-hidden="true" /> Prepared</>
                        ) : (
                          "Not copied"
                        )}
                      </div>
                    </article>
                  );
                })}
                {!workspace.source_classes.length && (
                  <p className={styles.empty}>No annual classes exist in the Source year.</p>
                )}
              </div>
            </section>

            <section className={styles.panel} id="student-progression">
              <div className={styles.sectionToolbar}>
                <div className={styles.sectionHeading}>
                  <Users size={21} aria-hidden="true" />
                  <div>
                    <span className={styles.stepLabel}>3. Student Progression</span>
                    <h2>Plan each future assignment</h2>
                    <p>Suggestions guide decisions; Admin remains authoritative.</p>
                  </div>
                </div>
                <button
                  className={styles.primaryButton}
                  disabled={busy || dirtyStudentIds.size === 0 || !targetIsFuture}
                  type="button"
                  onClick={() => void saveDraft()}
                >
                  <Save size={16} aria-hidden="true" />
                  Save Draft{dirtyStudentIds.size ? ` (${dirtyStudentIds.size})` : ""}
                </button>
              </div>

              <div className={styles.filters}>
                <label className={styles.field}>
                  <span>Search students</span>
                  <input
                    value={search}
                    placeholder="Name, level or class"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Source class</span>
                  <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                    <option value="all">All source classes</option>
                    {workspace.source_classes.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.level_name} · {classroom.class_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Status</span>
                  <select
                    value={studentFilter}
                    onChange={(event) => setStudentFilter(event.target.value as StudentFilter)}
                  >
                    <option value="all">All students</option>
                    <option value="ready">Ready</option>
                    <option value="decide_later">Decide Later</option>
                    <option value="not_returning">Not Returning</option>
                    <option value="applied">Applied</option>
                  </select>
                </label>
              </div>

              <div className={styles.bulkBar}>
                <strong>{selectedStudentIds.size} selected</strong>
                <select
                  aria-label="Bulk progression decision"
                  value={bulkDecision}
                  disabled={!targetIsFuture}
                  onChange={(event) => {
                    setBulkDecision(event.target.value as AcademicYearRolloverDecision);
                    setBulkTargetClassId("");
                  }}
                >
                  {decisions.map((decision) => (
                    <option key={decision} value={decision}>{getRolloverDecisionLabel(decision)}</option>
                  ))}
                </select>
                {!['decide_later', 'not_returning'].includes(bulkDecision) && (
                  <select
                    aria-label="Bulk target class"
                    value={bulkTargetClassId}
                    disabled={!targetIsFuture}
                    onChange={(event) => setBulkTargetClassId(event.target.value)}
                  >
                    <option value="">Choose one target class</option>
                    {bulkTargetOptions.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>{classOption(classroom)}</option>
                    ))}
                  </select>
                )}
                <button className={styles.secondaryButton} disabled={!targetIsFuture} type="button" onClick={applyBulkDecision}>
                  Apply to Selected
                </button>
              </div>

              <div className={styles.studentGroups}>
                {groupedStudents.map(([sourceClassId, students]) => {
                  const sourceClass = workspace.source_classes.find(
                    (classroom) => classroom.id === sourceClassId
                  );
                  return (
                    <section className={styles.studentGroup} key={sourceClassId}>
                      <div className={styles.studentGroupHeader}>
                        <div>
                          <h3>{sourceClass?.level_name} · {sourceClass?.class_name}</h3>
                          <p>{sourceClass ? classSchedule(sourceClass) : ""}</p>
                        </div>
                        <button
                          className={styles.textButton}
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedStudentIds);
                            const allSelected = students.every((student) => next.has(student.id));
                            for (const student of students) {
                              if (allSelected) next.delete(student.id);
                              else next.add(student.id);
                            }
                            setSelectedStudentIds(next);
                          }}
                        >
                          Select {students.every((student) => selectedStudentIds.has(student.id)) ? "none" : "all"}
                        </button>
                      </div>
                      <div className={styles.studentRows}>
                        {students.map((student) => {
                          const draft = studentDrafts[student.id] || student;
                          const targetOptions = workspace.target_classes.filter((classroom) =>
                            targetClassMatchesDecision({ ...student, decision: draft.decision }, classroom)
                          );
                          const needsTarget = !['decide_later', 'not_returning'].includes(draft.decision);
                          return (
                            <article className={styles.studentRow} key={student.id}>
                              <label className={styles.rowCheckbox}>
                                <input
                                  checked={selectedStudentIds.has(student.id)}
                                  type="checkbox"
                                  onChange={(event) => {
                                    const next = new Set(selectedStudentIds);
                                    if (event.target.checked) next.add(student.id);
                                    else next.delete(student.id);
                                    setSelectedStudentIds(next);
                                  }}
                                />
                                <span className={styles.srOnly}>Select {student.full_name}</span>
                              </label>
                              <div className={styles.studentIdentity}>
                                <strong>{student.full_name}</strong>
                                <span>{student.student_type === "profile" ? "Cambridge" : "Young Learner"}</span>
                                {!student.active && <small>Inactive record</small>}
                              </div>
                              <div className={styles.progressionContext}>
                                <span>Current: <strong>{student.source_level_name}</strong></span>
                                <span>
                                  Suggested: <strong>{student.suggested_level_name || "No automatic suggestion"}</strong>
                                </span>
                              </div>
                              <label className={styles.compactField}>
                                <span>Decision</span>
                                <select
                                  value={draft.decision}
                                  disabled={!targetIsFuture}
                                  onChange={(event) =>
                                    changeStudentDecision(
                                      student,
                                      event.target.value as AcademicYearRolloverDecision
                                    )
                                  }
                                >
                                  {decisions.map((decision) => (
                                    <option key={decision} value={decision}>{getRolloverDecisionLabel(decision)}</option>
                                  ))}
                                </select>
                              </label>
                              {needsTarget ? (
                                <label className={styles.compactField}>
                                  <span>Target class</span>
                                  <select
                                    value={draft.target_class_id || ""}
                                    disabled={!targetIsFuture}
                                    onChange={(event) =>
                                      updateStudentDraft(student.id, {
                                        target_class_id: event.target.value || null,
                                      })
                                    }
                                  >
                                    <option value="">Choose target class</option>
                                    {targetOptions.map((classroom) => (
                                      <option key={classroom.id} value={classroom.id}>{classOption(classroom)}</option>
                                    ))}
                                  </select>
                                </label>
                              ) : (
                                <div className={styles.noTarget}>
                                  {draft.decision === "not_returning"
                                    ? "No target enrolment"
                                    : "Decision outstanding"}
                                </div>
                              )}
                              <label className={styles.notesField}>
                                <span>Admin note</span>
                                <input
                                  maxLength={2000}
                                  value={draft.notes}
                                  disabled={!targetIsFuture}
                                  placeholder="Optional"
                                  onChange={(event) =>
                                    updateStudentDraft(student.id, { notes: event.target.value })
                                  }
                                />
                              </label>
                              <div className={`${styles.decisionStatus} ${student.applied_at ? styles.applied : ""}`}>
                                {student.applied_at ? "Applied" : dirtyStudentIds.has(student.id) ? "Unsaved" : "Saved"}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
                {!visibleStudents.length && (
                  <p className={styles.empty}>No students match the current filters.</p>
                )}
              </div>
            </section>

            <section className={styles.panel} id="review-apply">
              <div className={styles.sectionHeading}>
                <CheckCircle2 size={21} aria-hidden="true" />
                <div>
                  <span className={styles.stepLabel}>4. Review & Apply</span>
                  <h2>Review future assignments</h2>
                  <p>Apply creates new enrolments only; Source-year history remains unchanged.</p>
                </div>
              </div>
              <div className={styles.reviewGrid}>
                <div><span>Promote</span><strong>{workspace.summary.promote}</strong></div>
                <div><span>Repeat</span><strong>{workspace.summary.repeat}</strong></div>
                <div><span>Different level</span><strong>{workspace.summary.different_level}</strong></div>
                <div><span>Not returning</span><strong>{workspace.summary.not_returning}</strong></div>
                <div className={workspace.summary.decide_later ? styles.warningMetric : ""}>
                  <span>Decide Later</span><strong>{workspace.summary.decide_later}</strong>
                </div>
              </div>
              {workspace.summary.decide_later > 0 && (
                <div className={styles.warning}>
                  <AlertTriangle size={18} aria-hidden="true" />
                  <span>{workspace.summary.decide_later} students still need a decision. Ready decisions may be applied without guessing for them.</span>
                </div>
              )}
              <div className={styles.applyFooter}>
                <span>{workspace.summary.ready_not_applied} ready decisions waiting to be applied</span>
                <button
                  className={styles.primaryButton}
                  disabled={busy || workspace.summary.ready_not_applied === 0}
                  type="button"
                  onClick={() => void applyRollover()}
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {busy ? "Applying..." : "Apply Ready Decisions"}
                </button>
              </div>
            </section>

            <section className={styles.panel} id="rollover-summary">
              <div className={styles.sectionHeading}>
                <School size={21} aria-hidden="true" />
                <div>
                  <span className={styles.stepLabel}>5. Rollover Summary</span>
                  <h2>{workspace.source_year.label} → {workspace.target_year.label}</h2>
                  <p>Preparation remains editable while the Target year is Future.</p>
                </div>
              </div>
              <dl className={styles.summaryList}>
                <div><dt>Classes prepared</dt><dd>{workspace.summary.classes_prepared}</dd></div>
                <div><dt>Promoted</dt><dd>{workspace.summary.promote}</dd></div>
                <div><dt>Repeating</dt><dd>{workspace.summary.repeat}</dd></div>
                <div><dt>Different level</dt><dd>{workspace.summary.different_level}</dd></div>
                <div><dt>Not returning</dt><dd>{workspace.summary.not_returning}</dd></div>
                <div><dt>Undecided</dt><dd>{workspace.summary.decide_later}</dd></div>
                <div><dt>Applied</dt><dd>{workspace.summary.applied} of {workspace.summary.total_students - workspace.summary.decide_later}</dd></div>
              </dl>
            </section>
          </>
        )}
      </main>
    </AdminLayout>
  );
}
