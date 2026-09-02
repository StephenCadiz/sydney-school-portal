"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Search,
  School,
  Users,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  formatAttendancePercentage,
  type AdminAttendanceAlert,
  type AdminAttendanceClassDetails,
  type AdminAttendanceOverview,
  type AdminAttendanceStudentDetails,
  type AdminAttendanceStudentSearchResult,
  type AttendanceAlertViewStatus,
  type AttendanceStudentType,
} from "../../../lib/adminAttendance";
import { supabase } from "../../../lib/supabase";
import styles from "./Attendance.module.css";

type AttendanceTab = "overview" | "classes" | "students";
type HistoryStatus = "all" | "present" | "absent";
type AlertFilter = "needs_attention" | "dealt_with" | "resolved" | "all";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T")
    ? new Date(value)
    : new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  return String(value || "").slice(0, 5) || "-";
}

function formatCoursePeriod(
  academicYearLabel: string | null,
  startDate: string | null,
  endDate: string | null
) {
  if (academicYearLabel) return academicYearLabel;
  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }
  return "Course dates not available";
}

function alertTitle(alert: AdminAttendanceAlert) {
  return alert.alert_type === "consecutive_absence"
    ? "Two consecutive absences"
    : "Attendance below 70%";
}

function alertDescription(alert: AdminAttendanceAlert) {
  if (alert.alert_type === "consecutive_absence") {
    return alert.absence_dates.length
      ? `Absent on ${alert.absence_dates
          .slice()
          .reverse()
          .map(formatDate)
          .join(" and ")}.`
      : "A completed-register absence streak requires attention.";
  }
  return `${alert.summary.present_count} Present · ${alert.summary.absent_count} Absent · ${formatAttendancePercentage(
    alert.summary.attendance_percentage
  )}`;
}

function alertStatusLabel(status: AttendanceAlertViewStatus) {
  if (status === "needs_attention") return "Needs Attention";
  if (status === "dealt_with") return "Dealt With";
  return "Resolved";
}

function Metric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "default" | "warning";
}) {
  return (
    <article className={`${styles.metric} ${tone === "warning" ? styles.metricWarning : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function AlertQueue({
  alerts,
  filter,
  onFilter,
  onViewStudent,
  onDealtWith,
  updatingId,
  showFilters = true,
  showViewStudent = true,
}: {
  alerts: AdminAttendanceAlert[];
  filter: AlertFilter;
  onFilter: (filter: AlertFilter) => void;
  onViewStudent: (studentType: AttendanceStudentType, studentId: string) => void;
  onDealtWith: (alert: AdminAttendanceAlert) => void;
  updatingId: string;
  showFilters?: boolean;
  showViewStudent?: boolean;
}) {
  const visibleAlerts = alerts.filter(
    (alert) => filter === "all" || alert.status === filter
  );
  const filters: Array<{ value: AlertFilter; label: string }> = [
    { value: "needs_attention", label: "Needs Attention" },
    { value: "dealt_with", label: "Dealt With" },
    { value: "resolved", label: "Resolved" },
    { value: "all", label: "All" },
  ];

  return (
    <section className={styles.panel} aria-labelledby="attendance-alerts-title">
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}>Attendance alerts</span>
          <h2 id="attendance-alerts-title">Students requiring attention</h2>
          <p>Class-scoped episodes created from completed registers.</p>
        </div>
        <AlertTriangle aria-hidden="true" size={23} />
      </div>

      {showFilters && (
        <div className={styles.segmented} aria-label="Attendance alert filter">
          {filters.map((option) => (
            <button
              type="button"
              key={option.value}
              className={filter === option.value ? styles.segmentedActive : ""}
              aria-pressed={filter === option.value}
              onClick={() => onFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {visibleAlerts.length === 0 ? (
        <div className={styles.emptyState}>
          <CheckCircle2 aria-hidden="true" size={22} />
          <div>
            <strong>No attendance alerts in this view.</strong>
            <p>New issues will appear after completed Class Registers are saved.</p>
          </div>
        </div>
      ) : (
        <div className={styles.alertList}>
          {visibleAlerts.map((alert) => (
            <article key={alert.id} className={styles.alertRow}>
              <div className={styles.alertIdentity}>
                <div className={styles.alertNameLine}>
                  <strong>{alert.student_name}</strong>
                  <span
                    className={`${styles.statusBadge} ${
                      alert.status === "needs_attention"
                        ? styles.statusNeedsAttention
                        : alert.status === "dealt_with"
                          ? styles.statusDealt
                          : styles.statusResolved
                    }`}
                  >
                    {alertStatusLabel(alert.status)}
                  </span>
                </div>
                <span>
                  {alert.class_name} · {alert.teacher_name}
                </span>
              </div>

              <div className={styles.alertReason}>
                <strong>{alertTitle(alert)}</strong>
                <span>{alertDescription(alert)}</span>
                <small>Raised {formatDate(alert.triggered_at)}</small>
              </div>

              <div className={styles.rowActions}>
                {showViewStudent && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      onViewStudent(alert.student_type, alert.student_id)
                    }
                  >
                    View Student
                  </button>
                )}
                {alert.status === "needs_attention" && (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={updatingId === alert.id}
                    onClick={() => onDealtWith(alert)}
                  >
                    {updatingId === alert.id ? "Updating..." : "Dealt With"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function AdminAttendancePage() {
  const [activeTab, setActiveTab] = useState<AttendanceTab>("overview");
  const [overview, setOverview] = useState<AdminAttendanceOverview | null>(null);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState("all");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [classDetails, setClassDetails] = useState<AdminAttendanceClassDetails | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<AdminAttendanceStudentSearchResult[]>([]);
  const [hasSearchedStudents, setHasSearchedStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<AdminAttendanceStudentDetails | null>(null);
  const [studentClassFilter, setStudentClassFilter] = useState("all");
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("all");
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("needs_attention");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [updatingAlertId, setUpdatingAlertId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function request(url: string, init: RequestInit = {}) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your Admin session has expired.");

    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Unable to load attendance information.");
    }
    return payload;
  }

  async function loadOverview(academicYearId = "") {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ view: "overview" });
      if (academicYearId) params.set("academicYearId", academicYearId);
      const payload = (await request(
        `/api/admin/attendance?${params.toString()}`
      )) as AdminAttendanceOverview;
      setOverview(payload);
      setSelectedAcademicYearId(payload.selected_academic_year?.id || "");
      return payload;
    } catch (caught) {
      console.error("Attendance Centre overview load failed:", caught);
      setOverview(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load the Attendance Centre."
      );
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function loadClass(classId: string) {
    setSelectedClassId(classId);
    setDetailLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ view: "class", classId });
      const payload = (await request(
        `/api/admin/attendance?${params.toString()}`
      )) as AdminAttendanceClassDetails;
      setClassDetails(payload);
    } catch (caught) {
      console.error("Attendance class details load failed:", caught);
      setClassDetails(null);
      setError(
        caught instanceof Error ? caught.message : "Unable to load this class."
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadStudent(
    studentType: AttendanceStudentType,
    studentId: string,
    academicYearId = selectedAcademicYearId
  ) {
    setActiveTab("students");
    setDetailLoading(true);
    setError("");
    setStudentClassFilter("all");
    setHistoryStatus("all");
    try {
      const params = new URLSearchParams({
        view: "student",
        studentType,
        studentId,
      });
      if (academicYearId) params.set("academicYearId", academicYearId);
      const payload = (await request(
        `/api/admin/attendance?${params.toString()}`
      )) as AdminAttendanceStudentDetails;
      setSelectedStudent(payload);
    } catch (caught) {
      console.error("Attendance student details load failed:", caught);
      setSelectedStudent(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load this student's attendance."
      );
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialise() {
      const params = new URLSearchParams(window.location.search);
      const yearId = String(params.get("academicYearId") || "");
      const payload = await loadOverview(yearId);
      if (cancelled || !payload) return;

      const studentId = String(params.get("studentId") || "");
      const requestedType = String(params.get("studentType") || "");
      const studentType: AttendanceStudentType | null =
        requestedType === "profile" || requestedType === "cambridge"
          ? "profile"
          : requestedType === "young_learner"
            ? "young_learner"
            : null;
      if (studentId && studentType) {
        await loadStudent(
          studentType,
          studentId,
          payload.selected_academic_year?.id || ""
        );
      }
    }

    void initialise();
    return () => {
      cancelled = true;
    };
    // URL hydration is intentionally performed once when the route mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleClasses = useMemo(
    () =>
      (overview?.classes || []).filter(
        (classroom) =>
          selectedLevelId === "all" || classroom.level_id === selectedLevelId
      ),
    [overview?.classes, selectedLevelId]
  );
  const lowestAttendanceClasses = useMemo(
    () =>
      [...(overview?.classes || [])]
        .filter((classroom) => classroom.completed_register_count > 0)
        .sort((left, right) => {
          if (left.active_alert_count !== right.active_alert_count) {
            return right.active_alert_count - left.active_alert_count;
          }
          return (
            (left.attendance_percentage ?? 101) -
            (right.attendance_percentage ?? 101)
          );
        })
        .slice(0, 6),
    [overview?.classes]
  );
  const filteredStudentHistory = useMemo(
    () =>
      (selectedStudent?.history || []).filter(
        (row) =>
          (studentClassFilter === "all" || row.class_id === studentClassFilter) &&
          (historyStatus === "all" || row.attendance_status === historyStatus)
      ),
    [historyStatus, selectedStudent?.history, studentClassFilter]
  );

  async function changeAcademicYear(nextId: string) {
    setSelectedAcademicYearId(nextId);
    setSelectedClassId("");
    setClassDetails(null);
    const payload = await loadOverview(nextId);
    if (payload && selectedStudent) {
      await loadStudent(
        selectedStudent.student.student_type,
        selectedStudent.student.student_id,
        nextId
      );
    }
  }

  async function searchStudents(event: FormEvent) {
    event.preventDefault();
    if (!studentQuery.trim()) {
      setStudentResults([]);
      setHasSearchedStudents(false);
      setError("Enter a student name to search.");
      return;
    }
    setSearching(true);
    setError("");
    try {
      const params = new URLSearchParams({
        view: "students",
        query: studentQuery.trim(),
      });
      const payload = await request(`/api/admin/attendance?${params.toString()}`);
      setStudentResults(
        (payload.students || []) as AdminAttendanceStudentSearchResult[]
      );
      setHasSearchedStudents(true);
    } catch (caught) {
      console.error("Attendance student search failed:", caught);
      setStudentResults([]);
      setHasSearchedStudents(false);
      setError(
        caught instanceof Error ? caught.message : "Unable to search students."
      );
    } finally {
      setSearching(false);
    }
  }

  async function markDealtWith(alert: AdminAttendanceAlert) {
    const confirmed = window.confirm(
      `Mark the attendance alert for ${alert.student_name} as dealt with?\n\nThis records the Admin follow-up. It does not change attendance.`
    );
    if (!confirmed) return;

    setUpdatingAlertId(alert.id);
    setError("");
    setMessage("");
    try {
      const payload = await request(
        `/api/admin/attendance/alerts/${encodeURIComponent(alert.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "dealt_with" }),
        }
      );
      setMessage(payload.message || "Attendance alert marked as dealt with.");
      window.dispatchEvent(new Event("admin-attendance-alerts-changed"));
      const refreshed = await loadOverview(selectedAcademicYearId);
      if (selectedStudent && refreshed) {
        await loadStudent(
          selectedStudent.student.student_type,
          selectedStudent.student.student_id,
          selectedAcademicYearId
        );
      }
      if (selectedClassId) await loadClass(selectedClassId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update the attendance alert."
      );
    } finally {
      setUpdatingAlertId("");
    }
  }

  return (
    <AdminLayout>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Student support</span>
            <h1>Attendance Centre</h1>
            <p>Monitor completed Class Registers across the academy.</p>
          </div>

          <label className={styles.yearSelector}>
            <span>Academic Year</span>
            <select
              value={selectedAcademicYearId}
              onChange={(event) => void changeAcademicYear(event.target.value)}
              disabled={loading || !(overview?.academic_years.length)}
            >
              {(overview?.academic_years || []).map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label}{year.status === "current" ? " · Current" : ""}
                </option>
              ))}
            </select>
          </label>
        </header>

        <nav className={styles.tabs} aria-label="Attendance Centre sections">
          {(
            [
              ["overview", "Overview"],
              ["classes", "Classes & Levels"],
              ["students", "Students"],
            ] as Array<[AttendanceTab, string]>
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={activeTab === value ? styles.tabActive : ""}
              aria-current={activeTab === value ? "page" : undefined}
              onClick={() => setActiveTab(value)}
            >
              {label}
            </button>
          ))}
        </nav>

        {message && <div className={styles.successMessage}>{message}</div>}
        {error && <div className={styles.errorMessage} role="alert">{error}</div>}

        {loading && !overview ? (
          <div className={styles.loadingState}>Loading attendance information...</div>
        ) : !overview ? null : activeTab === "overview" ? (
          <div className={styles.sectionStack}>
            <section className={styles.metricsGrid} aria-label="Attendance overview">
              <Metric
                label="Overall Attendance"
                value={formatAttendancePercentage(overview.summary.attendance_percentage)}
                detail={`${overview.summary.completed_register_count} completed attendance records`}
              />
              <Metric
                label="Present / Absent"
                value={`${overview.summary.present_count} / ${overview.summary.absent_count}`}
                detail="Actual completed-register entries"
              />
              <Metric
                label="Active Alerts"
                value={overview.summary.active_alert_count}
                detail={`${overview.summary.alert_student_count} student${overview.summary.alert_student_count === 1 ? "" : "s"} require attention`}
                tone={overview.summary.active_alert_count > 0 ? "warning" : "default"}
              />
              <Metric
                label="Students Below 70%"
                value={overview.summary.students_below_70_count}
                detail={`${overview.summary.low_attendance_alert_count} meet the 15-record alert threshold`}
                tone={overview.summary.students_below_70_count > 0 ? "warning" : "default"}
              />
            </section>

            <AlertQueue
              alerts={overview.alerts}
              filter={alertFilter}
              onFilter={setAlertFilter}
              onViewStudent={(studentType, studentId) =>
                void loadStudent(studentType, studentId)
              }
              onDealtWith={(alert) => void markDealtWith(alert)}
              updatingId={updatingAlertId}
            />

            <div className={styles.overviewGrid}>
              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div>
                    <span className={styles.eyebrow}>Class monitoring</span>
                    <h2>Classes requiring attention</h2>
                    <p>Lowest attendance and active alerts appear first.</p>
                  </div>
                  <School aria-hidden="true" size={22} />
                </div>
                {lowestAttendanceClasses.length === 0 ? (
                  <div className={styles.emptyState}>No completed class attendance yet.</div>
                ) : (
                  <div className={styles.compactList}>
                    {lowestAttendanceClasses.map((classroom) => (
                      <button
                        type="button"
                        key={classroom.class_id}
                        onClick={() => {
                          setActiveTab("classes");
                          setSelectedLevelId(classroom.level_id);
                          void loadClass(classroom.class_id);
                        }}
                      >
                        <span>
                          <strong>{classroom.class_name}</strong>
                          <small>{classroom.teacher_name}</small>
                        </span>
                        <span className={styles.compactValue}>
                          {formatAttendancePercentage(classroom.attendance_percentage)}
                          {classroom.active_alert_count > 0 && (
                            <small>{classroom.active_alert_count} alert{classroom.active_alert_count === 1 ? "" : "s"}</small>
                          )}
                        </span>
                        <ChevronRight aria-hidden="true" size={18} />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div>
                    <span className={styles.eyebrow}>Level analysis</span>
                    <h2>Attendance by level</h2>
                    <p>Aggregate Present divided by Present plus Absent.</p>
                  </div>
                  <Users aria-hidden="true" size={22} />
                </div>
                {overview.levels.length === 0 ? (
                  <div className={styles.emptyState}>No classes in this Academic Year.</div>
                ) : (
                  <div className={styles.levelList}>
                    {overview.levels.map((level) => (
                      <button
                        type="button"
                        key={level.level_id}
                        onClick={() => {
                          setSelectedLevelId(level.level_id);
                          setActiveTab("classes");
                        }}
                      >
                        <span>
                          <strong>{level.level_name}</strong>
                          <small>{level.class_count} class{level.class_count === 1 ? "" : "es"}</small>
                        </span>
                        <span className={styles.levelPercentage}>
                          {formatAttendancePercentage(level.attendance_percentage)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : activeTab === "classes" ? (
          <div className={styles.sectionStack}>
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.eyebrow}>Classes & Levels</span>
                  <h2>Class attendance</h2>
                  <p>Select a level, then open a class to inspect its roster.</p>
                </div>
                <label className={styles.compactSelect}>
                  <span>Level</span>
                  <select
                    value={selectedLevelId}
                    onChange={(event) => {
                      setSelectedLevelId(event.target.value);
                      setSelectedClassId("");
                      setClassDetails(null);
                    }}
                  >
                    <option value="all">All levels</option>
                    {overview.levels.map((level) => (
                      <option key={level.level_id} value={level.level_id}>
                        {level.level_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {visibleClasses.length === 0 ? (
                <div className={styles.emptyState}>No classes match this level and Academic Year.</div>
              ) : (
                <div className={styles.classList}>
                  {visibleClasses.map((classroom) => (
                  <button
                    type="button"
                    key={classroom.class_id}
                    className={selectedClassId === classroom.class_id ? styles.classSelected : ""}
                    onClick={() => void loadClass(classroom.class_id)}
                  >
                    <span className={styles.classIdentity}>
                      <strong>{classroom.class_name}</strong>
                      <small>
                        {classroom.days || "Days not set"} · {formatTime(classroom.scheduled_start_time)}–{formatTime(classroom.scheduled_end_time)}
                      </small>
                    </span>
                    <span>{classroom.teacher_name}</span>
                    <span>{classroom.student_count} students</span>
                    <strong className={styles.classPercentage}>
                      {formatAttendancePercentage(classroom.attendance_percentage)}
                    </strong>
                    {classroom.active_alert_count > 0 && (
                      <span className={styles.alertCount}>{classroom.active_alert_count}</span>
                    )}
                    <ChevronRight aria-hidden="true" size={18} />
                  </button>
                  ))}
                </div>
              )}
            </section>

            {detailLoading && <div className={styles.loadingState}>Loading class attendance...</div>}
            {!detailLoading && classDetails && (
              <section className={styles.panel}>
                <div className={styles.classDetailHeader}>
                  <div>
                    <span className={styles.eyebrow}>{classDetails.classroom.level_name}</span>
                    <h2>{classDetails.classroom.class_name}</h2>
                    <p>
                      {classDetails.classroom.teacher_name} · {classDetails.classroom.course_type} · {formatCoursePeriod(
                        classDetails.classroom.academic_year_label,
                        classDetails.classroom.course_start_date,
                        classDetails.classroom.course_end_date
                      )}
                    </p>
                  </div>
                  <div className={styles.classAggregate}>
                    <span>Class Attendance</span>
                    <strong>{formatAttendancePercentage(classDetails.classroom.attendance_percentage)}</strong>
                    <small>{classDetails.classroom.present_count} Present · {classDetails.classroom.absent_count} Absent</small>
                  </div>
                </div>

                {classDetails.students.length === 0 ? (
                  <div className={styles.emptyState}>No students are linked to this class.</div>
                ) : (
                  <div className={styles.roster} role="table" aria-label="Class attendance roster">
                    <div className={styles.rosterHeader} role="row">
                      <span>Student</span><span>Present</span><span>Absent</span><span>Attendance</span><span>Alerts</span>
                    </div>
                    {classDetails.students.map((student) => (
                      <div className={styles.rosterRow} role="row" key={`${student.student_type}-${student.student_id}`}>
                        <button
                          type="button"
                          className={styles.studentNameButton}
                          onClick={() => void loadStudent(student.student_type, student.student_id)}
                        >
                          {student.student_name}
                          {!student.active && <small>Inactive</small>}
                        </button>
                        <span data-label="Present">{student.present_count}</span>
                        <span data-label="Absent">{student.absent_count}</span>
                        <strong
                          data-label="Attendance"
                          className={student.attendance_percentage !== null && student.attendance_percentage < 70 ? styles.lowPercentage : ""}
                        >
                          {formatAttendancePercentage(student.attendance_percentage)}
                        </strong>
                        <span data-label="Alerts">
                          {student.active_alert_count > 0 ? `${student.active_alert_count} active` : "None"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          <div className={styles.sectionStack}>
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.eyebrow}>Student attendance</span>
                  <h2>Find a student</h2>
                  <p>Search Cambridge students and Young Learners.</p>
                </div>
                <Search aria-hidden="true" size={22} />
              </div>
              <form className={styles.searchForm} onSubmit={searchStudents}>
                <label>
                  <span className={styles.visuallyHidden}>Student name</span>
                  <Search aria-hidden="true" size={18} />
                  <input
                    value={studentQuery}
                    onChange={(event) => {
                      setStudentQuery(event.target.value);
                      setHasSearchedStudents(false);
                    }}
                    placeholder="Search by student name"
                  />
                </label>
                <button type="submit" className={styles.primaryButton} disabled={searching}>
                  {searching ? "Searching..." : "Search"}
                </button>
              </form>

              {studentResults.length > 0 && (
                <div className={styles.searchResults}>
                  {studentResults.map((student) => (
                    <button
                      type="button"
                      key={`${student.student_type}-${student.student_id}`}
                      onClick={() => void loadStudent(student.student_type, student.student_id)}
                    >
                      <span>
                        <strong>{student.student_name}</strong>
                        <small>{student.student_type === "profile" ? "Cambridge" : "Young Learner"}</small>
                      </span>
                      <span>{student.class_name || "No current class"}</span>
                      <ChevronRight aria-hidden="true" size={18} />
                    </button>
                  ))}
                </div>
              )}
              {!searching && hasSearchedStudents && studentResults.length === 0 && !error && (
                <div className={styles.emptyState}>No students match this search.</div>
              )}
            </section>

            {detailLoading && <div className={styles.loadingState}>Loading student attendance...</div>}
            {!detailLoading && selectedStudent && (
              <>
                <section className={styles.studentSummary}>
                  <div className={styles.studentSummaryIdentity}>
                    <span className={styles.eyebrow}>
                      {selectedStudent.student.student_type === "profile" ? "Cambridge Student" : "Young Learner"}
                    </span>
                    <h2>{selectedStudent.student.student_name}</h2>
                    <p>{selectedStudent.student.email || "No portal email"}</p>
                  </div>
                  <Metric
                    label="Attendance"
                    value={formatAttendancePercentage(selectedStudent.summary.attendance_percentage)}
                    detail={`${selectedStudent.summary.completed_register_count} completed records`}
                  />
                  <Metric
                    label="Present"
                    value={selectedStudent.summary.present_count}
                    detail={`${selectedStudent.summary.absent_count} absent`}
                  />
                  <Metric
                    label="Active Alerts"
                    value={selectedStudent.alerts.filter((alert) => alert.status === "needs_attention").length}
                    detail="Current class-scoped issues"
                    tone={selectedStudent.alerts.some((alert) => alert.status === "needs_attention") ? "warning" : "default"}
                  />
                </section>

                {selectedStudent.alerts.some((alert) => alert.status === "needs_attention") && (
                  <AlertQueue
                    alerts={selectedStudent.alerts}
                    filter="needs_attention"
                    onFilter={() => undefined}
                    onViewStudent={() => undefined}
                    onDealtWith={(alert) => void markDealtWith(alert)}
                    updatingId={updatingAlertId}
                    showFilters={false}
                    showViewStudent={false}
                  />
                )}

                <section className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <div>
                      <span className={styles.eyebrow}>Parent query record</span>
                      <h2>Completed lesson history</h2>
                      <p>Exact Present and Absent records for the selected Academic Year.</p>
                    </div>
                    <CalendarDays aria-hidden="true" size={22} />
                  </div>

                  <div className={styles.historyFilters}>
                    <div className={styles.segmented} aria-label="Attendance history status">
                      {(["all", "present", "absent"] as HistoryStatus[]).map((status) => (
                        <button
                          type="button"
                          key={status}
                          className={historyStatus === status ? styles.segmentedActive : ""}
                          aria-pressed={historyStatus === status}
                          onClick={() => setHistoryStatus(status)}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                      ))}
                    </div>
                    {selectedStudent.courses.length > 1 && (
                      <label className={styles.compactSelect}>
                        <span>Class / Course</span>
                        <select value={studentClassFilter} onChange={(event) => setStudentClassFilter(event.target.value)}>
                          <option value="all">All classes and courses</option>
                          {selectedStudent.courses.map((course) => (
                            <option key={course.class_id} value={course.class_id}>
                              {course.class_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>

                  {filteredStudentHistory.length === 0 ? (
                    <div className={styles.emptyState}>No completed attendance records match these filters.</div>
                  ) : (
                    <div className={styles.historyList}>
                      {filteredStudentHistory.map((row) => (
                        <article key={row.entry_id}>
                          <div className={styles.historyDate}>
                            <strong>{formatDate(row.lesson_date)}</strong>
                            <span>{formatTime(row.scheduled_start_time)}–{formatTime(row.scheduled_end_time)}</span>
                          </div>
                          <span className={`${styles.attendanceStatus} ${row.attendance_status === "present" ? styles.present : styles.absent}`}>
                            {row.attendance_status === "present" ? "Present" : "Absent"}
                          </span>
                          <div className={styles.historyContext}>
                            <strong>{row.class_name}</strong>
                            <span>{[row.level_name, row.teacher_name, row.academic_year_label].filter(Boolean).join(" · ")}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
