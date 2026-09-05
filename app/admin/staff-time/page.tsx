"use client";

import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  STAFF_TIME_WEEKDAYS,
  addCalendarDays,
  formatMadridTime,
  formatMinutes,
  getMadridDate,
  minutesBetween,
  normalizeTime,
  plannedIntervalLabel,
  type StaffTimeInterval,
} from "../../../lib/staffTime";
import { supabase } from "../../../lib/supabase";

type Section = "today" | "teachers" | "incidences" | "reports" | "settings";
type Feedback = { type: "success" | "error"; message: string };

type TeacherSummary = {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
  staff_role: "teacher" | "admin";
  staff_role_label: string;
  employment_records: any[];
  schedules: any[];
  remote_authorisations: any[];
};

const sections: Array<{ id: Section; label: string; icon: typeof Clock3 }> = [
  { id: "today", label: "Today", icon: Clock3 },
  { id: "teachers", label: "Staff", icon: UsersRound },
  { id: "incidences", label: "Incidences", icon: AlertTriangle },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Building2 },
];

function nextEffectiveDate(current: any) {
  const today = getMadridDate();
  if (!current?.effective_from) return today;
  return current.effective_from >= today
    ? addCalendarDays(current.effective_from, 1)
    : today;
}

function monthDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return { start: "", end: "" };
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function displayDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function incidenceLabel(value: string) {
  return (
    {
      missing_sign_in: "Missing Sign In",
      missing_sign_out: "Missing Sign Out",
      network_problem: "Network-related problem",
      other: "Other clocking incidence",
    }[value] || value
  );
}

export default function StaffTimeAdminPage() {
  const [section, setSection] = useState<Section>("today");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [todayData, setTodayData] = useState<any>(null);
  const [teacherData, setTeacherData] = useState<any>(null);
  const [incidenceData, setIncidenceData] = useState<any>(null);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [historyStart, setHistoryStart] = useState(addCalendarDays(getMadridDate(), -30));
  const [historyEnd, setHistoryEnd] = useState(getMadridDate());
  const [incidenceStart, setIncidenceStart] = useState(addCalendarDays(getMadridDate(), -30));
  const [incidenceEnd, setIncidenceEnd] = useState(getMadridDate());
  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected">("approved");
  const [reviewNote, setReviewNote] = useState("");
  const [resolveTarget, setResolveTarget] = useState<any>(null);
  const [resolutionStatus, setResolutionStatus] = useState<"resolved" | "dismissed">("resolved");
  const [resolutionNote, setResolutionNote] = useState("");
  const [currentAdminId, setCurrentAdminId] = useState("");

  const currentMonth = getMadridDate().slice(0, 7);
  const initialMonth = monthDates(currentMonth);
  const [reportMonth, setReportMonth] = useState(currentMonth);
  const [reportStart, setReportStart] = useState(initialMonth.start);
  const [reportEnd, setReportEnd] = useState(initialMonth.end);
  const [reportTeacher, setReportTeacher] = useState("all");
  const [downloading, setDownloading] = useState<"pdf" | "xlsx" | "">("");

  const [employmentForm, setEmploymentForm] = useState({
    effective_from: getMadridDate(),
    dni_nie: "",
    job_title: "Teacher",
    working_time_type: "part_time",
    contracted_weekly_hours: "",
    time_recording_enabled: true,
    clocking_location_policy: "school_network_only",
  });
  const [scheduleEffectiveFrom, setScheduleEffectiveFrom] = useState(getMadridDate());
  const [scheduleLabel, setScheduleLabel] = useState("Regular weekly schedule");
  const [scheduleIntervals, setScheduleIntervals] = useState<StaffTimeInterval[]>([]);
  const [remoteForm, setRemoteForm] = useState({
    start_date: getMadridDate(),
    end_date: getMadridDate(),
    reason: "",
  });
  const [manualForm, setManualForm] = useState({
    teacher_id: "",
    work_date: getMadridDate(),
    session_id: "",
    sign_in_time: "",
    sign_out_time: "",
    reason: "",
  });
  const [companyForm, setCompanyForm] = useState({
    effective_from: getMadridDate(),
    legal_employer_name: "",
    tax_identifier: "",
    workplace_name: "",
    workplace_address: "",
    postcode: "",
    city: "",
    province: "",
    country: "España",
  });
  const [networkForm, setNetworkForm] = useState({ label: "", network: "" });

  async function token() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || "";
  }

  const apiGet = useCallback(async (query: string) => {
    const accessToken = await token();
    const response = await fetch(`/api/admin/staff-time?${query}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load Staff Time data.");
    return payload;
  }, []);

  async function mutate(action: string, input: Record<string, unknown>) {
    const accessToken = await token();
    const response = await fetch("/api/admin/staff-time", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...input }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to update Staff Time data.");
    return payload;
  }

  const loadToday = useCallback(async () => {
    const payload = await apiGet("view=today");
    setTodayData(payload);
    setCurrentAdminId(payload.current_admin_id || "");
  }, [apiGet]);
  const loadTeachers = useCallback(
    async (teacherId = selectedTeacherId) => {
      const params = new URLSearchParams({
        view: "teachers",
        start: historyStart,
        end: historyEnd,
      });
      if (teacherId) params.set("teacher", teacherId);
      const payload = await apiGet(params.toString());
      setTeacherData(payload);
      setCurrentAdminId(payload.current_admin_id || "");
      if (!teacherId && payload.teachers?.length) {
        setSelectedTeacherId(payload.teachers[0].id);
      }
    },
    [apiGet, historyEnd, historyStart, selectedTeacherId]
  );
  const loadIncidences = useCallback(async () => {
    const params = new URLSearchParams({
      view: "incidences",
      start: incidenceStart,
      end: incidenceEnd,
    });
    const payload = await apiGet(params.toString());
    setIncidenceData(payload);
    setCurrentAdminId(payload.current_admin_id || "");
  }, [apiGet, incidenceEnd, incidenceStart]);
  const loadSettings = useCallback(
    async () => setSettingsData(await apiGet("view=settings")),
    [apiGet]
  );

  const loadSection = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      if (section === "today") await loadToday();
      if (section === "teachers" || section === "reports") await loadTeachers();
      if (section === "incidences") {
        await Promise.all([loadIncidences(), loadTeachers()]);
      }
      if (section === "settings") await loadSettings();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to load Staff Time data.",
      });
    } finally {
      setLoading(false);
    }
  }, [loadIncidences, loadSettings, loadTeachers, loadToday, section]);

  useEffect(() => {
    void loadSection();
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (section === "teachers" && selectedTeacherId && !teacherData?.selected) {
      void loadTeachers(selectedTeacherId);
    }
  }, [selectedTeacherId, section]); // eslint-disable-line react-hooks/exhaustive-deps

  const teachers = (teacherData?.teachers || []) as TeacherSummary[];
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId) || null;
  const manualStaff = teachers.find(
    (teacher) => teacher.id === manualForm.teacher_id
  );
  const manualSelfActionForbidden =
    manualStaff?.staff_role === "admin" && manualStaff.id === currentAdminId;
  const employmentControlledByEnrollment =
    selectedTeacher?.staff_role === "admin";
  const currentEmployment = selectedTeacher?.employment_records.find((row) => !row.effective_to) || null;
  const currentSchedule = selectedTeacher?.schedules.find((row) => !row.effective_to) || null;

  useEffect(() => {
    if (!selectedTeacher) return;
    setEmploymentForm({
      effective_from: nextEffectiveDate(currentEmployment),
      dni_nie: currentEmployment?.dni_nie || "",
      job_title:
        currentEmployment?.job_title ||
        (selectedTeacher.staff_role === "admin" ? "Administrative staff" : "Teacher"),
      working_time_type: currentEmployment?.working_time_type || "part_time",
      contracted_weekly_hours: currentEmployment
        ? String(currentEmployment.contracted_weekly_hours)
        : "",
      time_recording_enabled:
        selectedTeacher.staff_role === "admin"
          ? true
          : currentEmployment?.time_recording_enabled !== false,
      clocking_location_policy:
        currentEmployment?.clocking_location_policy || "school_network_only",
    });
    setScheduleEffectiveFrom(nextEffectiveDate(currentSchedule));
    setScheduleLabel(currentSchedule?.label || "Regular weekly schedule");
    setScheduleIntervals(
      (currentSchedule?.intervals || []).map((row: any) => ({
        weekday: Number(row.weekday),
        start_time: normalizeTime(row.start_time),
        end_time: normalizeTime(row.end_time),
      }))
    );
    setManualForm((form) => ({ ...form, teacher_id: selectedTeacher.id }));
  }, [selectedTeacherId, currentEmployment?.id, currentSchedule?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!settingsData) return;
    const current = settingsData.current_company;
    setCompanyForm({
      effective_from: nextEffectiveDate(current),
      legal_employer_name: current?.legal_employer_name || "",
      tax_identifier: current?.tax_identifier || "",
      workplace_name: current?.workplace_name || "",
      workplace_address: current?.workplace_address || "",
      postcode: current?.postcode || "",
      city: current?.city || "",
      province: current?.province || "",
      country: current?.country || "España",
    });
  }, [settingsData?.current_company?.id]);

  async function perform(
    action: string,
    input: Record<string, unknown>,
    success: string,
    reload: () => Promise<void>
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      await mutate(action, input);
      await reload();
      setFeedback({ type: "success", message: success });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to update Staff Time data.",
      });
    } finally {
      setBusy(false);
    }
  }

  function addInterval(weekday: number) {
    setScheduleIntervals((rows) => [
      ...rows,
      { weekday, start_time: "16:00", end_time: "21:00" },
    ]);
  }

  function updateInterval(index: number, field: "start_time" | "end_time", value: string) {
    setScheduleIntervals((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
  }

  function removeInterval(index: number) {
    setScheduleIntervals((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  async function saveEmployment(event: FormEvent) {
    event.preventDefault();
    if (!selectedTeacher) return;
    await perform(
      "save_employment",
      { teacher_id: selectedTeacher.id, ...employmentForm },
      "The effective-dated employment record was saved.",
      () => loadTeachers(selectedTeacher.id)
    );
  }

  async function saveSchedule(event: FormEvent) {
    event.preventDefault();
    if (!selectedTeacher) return;
    await perform(
      "save_schedule",
      {
        teacher_id: selectedTeacher.id,
        effective_from: scheduleEffectiveFrom,
        label: scheduleLabel,
        intervals: scheduleIntervals,
      },
      "The new weekly schedule was saved without replacing history.",
      () => loadTeachers(selectedTeacher.id)
    );
  }

  async function saveRemote(event: FormEvent) {
    event.preventDefault();
    if (!selectedTeacher) return;
    await perform(
      "authorise_remote",
      { teacher_id: selectedTeacher.id, ...remoteForm },
      "Remote work was authorised for the selected period.",
      () => loadTeachers(selectedTeacher.id)
    );
  }

  async function saveManualCorrection(event: FormEvent) {
    event.preventDefault();
    await perform(
      "manual_correction",
      manualForm,
      "The audited manual correction was approved and recorded.",
      async () => {
        await loadIncidences();
        if (selectedTeacherId) await loadTeachers(selectedTeacherId);
      }
    );
    setManualForm((form) => ({
      ...form,
      session_id: "",
      sign_in_time: "",
      sign_out_time: "",
      reason: "",
    }));
  }

  async function download(format: "pdf" | "xlsx") {
    setDownloading(format);
    setFeedback(null);
    try {
      const accessToken = await token();
      const params = new URLSearchParams({
        start: reportStart,
        end: reportEnd,
        teacher: reportTeacher,
      });
      const response = await fetch(
        `/api/admin/staff-time/reports/${format}?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Unable to generate ${format.toUpperCase()}.`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `registro-jornada-${reportStart}-${reportEnd}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setFeedback({ type: "success", message: `Official ${format.toUpperCase()} generated.` });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to generate the report.",
      });
    } finally {
      setDownloading("");
    }
  }

  const todayCounts = useMemo(() => {
    const rows = todayData?.rows || [];
    return {
      working: rows.filter((row: any) => ["working", "authorised_remote"].includes(row.status)).length,
      completed: rows.filter((row: any) => row.status === "completed").length,
      attention: rows.filter((row: any) =>
        ["missing_sign_in", "missing_sign_out", "correction_pending"].includes(row.status)
      ).length,
    };
  }, [todayData]);

  return (
    <AdminLayout>
      <main className="staff-time-admin-page">
        <header className="staff-time-admin-header">
          <div>
            <span className="staff-time-eyebrow">Official employment record</span>
            <h1>Staff Time Register</h1>
            <p>Actual working-time records, schedules, corrections and inspection-ready reports.</p>
          </div>
          <button type="button" className="staff-time-refresh" onClick={() => void loadSection()} disabled={loading}>
            <RefreshCw aria-hidden="true" size={17} />
            Refresh
          </button>
        </header>

        <nav className="staff-time-tabs" aria-label="Staff Time Register sections">
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined}>
                <Icon aria-hidden="true" size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {feedback && (
          <div className={`staff-time-admin-feedback is-${feedback.type}`} role="status">
            {feedback.type === "success" ? <Check aria-hidden="true" size={18} /> : <AlertTriangle aria-hidden="true" size={18} />}
            {feedback.message}
          </div>
        )}

        {loading ? (
          <section className="staff-time-admin-loading" aria-label="Loading Staff Time data">
            <div />
            <div />
            <div />
          </section>
        ) : (
          <>
            {section === "today" && (
              <section className="staff-time-section" aria-labelledby="staff-time-today-title">
                <div className="staff-time-section-heading">
                  <div>
                    <h2 id="staff-time-today-title">Today</h2>
                    <p>{todayData?.date ? displayDate(todayData.date) : "Current Madrid working day"}</p>
                  </div>
                  <div className="staff-time-today-summary" aria-label="Today summary">
                    <span><strong>{todayCounts.working}</strong> working</span>
                    <span><strong>{todayCounts.completed}</strong> completed</span>
                    <span><strong>{todayCounts.attention}</strong> attention</span>
                  </div>
                </div>
                <div className="staff-time-table-wrap">
                  <table className="staff-time-table">
                    <thead><tr><th>Staff member</th><th>Planned schedule</th><th>Current status</th><th>Actual sessions</th><th>Verification</th><th>Incidence</th></tr></thead>
                    <tbody>
                      {(todayData?.rows || []).map((row: any) => (
                        <tr key={row.teacher_id}>
                          <td><strong>{row.teacher_name}</strong><small>{row.staff_role_label} · {row.profile_active ? "Active profile" : "Inactive profile"}</small></td>
                          <td>{row.planned}</td>
                          <td><span className={`staff-time-text-status is-${row.status}`}>{row.status_label}</span></td>
                          <td>
                            {row.sessions.length
                              ? row.sessions.map((session: any) => (
                                  <span className="staff-time-session-line" key={session.id}>
                                    {formatMadridTime(session.effective_sign_in_at)}–{formatMadridTime(session.effective_sign_out_at)}
                                  </span>
                                ))
                              : "—"}
                          </td>
                          <td>{row.network_verification}</td>
                          <td>{row.incidence_types.length ? row.incidence_types.map(incidenceLabel).join(", ") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {section === "teachers" && (
              <section className="staff-time-section" aria-labelledby="staff-time-teachers-title">
                <div className="staff-time-section-heading">
                  <div><h2 id="staff-time-teachers-title">Staff members</h2><p>Teacher and tracked Admin employment terms, schedules, remote work and record audit.</p></div>
                  <label className="staff-time-inline-control">Staff member<select value={selectedTeacherId} onChange={(event) => { setSelectedTeacherId(event.target.value); setTeacherData((data: any) => ({ ...data, selected: null })); }}>
                    {teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name} · {teacher.staff_role_label}{teacher.active ? "" : " (inactive)"}</option>)}
                  </select></label>
                </div>

                {selectedTeacher && (
                  <div className="staff-time-teacher-admin-grid">
                    <form className="staff-time-form-panel" onSubmit={saveEmployment}>
                      <div className="staff-time-form-panel-heading"><UserRoundCog aria-hidden="true" size={19} /><div><h3>Employment information</h3><p>Names are sourced from the legal profile and snapshotted in each effective record.</p></div></div>
                      <div className="staff-time-readonly-name"><span>Legal name · {selectedTeacher.staff_role_label}</span><strong>{selectedTeacher.name}</strong></div>
                      <div className="staff-time-form-grid two-columns">
                        <label>Effective from<input type="date" value={employmentForm.effective_from} onChange={(event) => setEmploymentForm({ ...employmentForm, effective_from: event.target.value })} required /></label>
                        <label>DNI/NIE<input value={employmentForm.dni_nie} onChange={(event) => setEmploymentForm({ ...employmentForm, dni_nie: event.target.value })} maxLength={32} required /></label>
                        <label>Job title / category<input value={employmentForm.job_title} onChange={(event) => setEmploymentForm({ ...employmentForm, job_title: event.target.value })} maxLength={160} required /></label>
                        <label>Working-time type<select value={employmentForm.working_time_type} onChange={(event) => setEmploymentForm({ ...employmentForm, working_time_type: event.target.value })}><option value="full_time">Full time</option><option value="part_time">Part time</option></select></label>
                        <label>Contracted weekly hours<input type="number" min="0.01" max="168" step="0.25" value={employmentForm.contracted_weekly_hours} onChange={(event) => setEmploymentForm({ ...employmentForm, contracted_weekly_hours: event.target.value })} required /></label>
                        <label>Clocking-location policy<select value={employmentForm.clocking_location_policy} onChange={(event) => setEmploymentForm({ ...employmentForm, clocking_location_policy: event.target.value })}><option value="school_network_only">School network only</option><option value="school_or_authorised_remote">School or authorised remote</option></select></label>
                      </div>
                      <label className="staff-time-checkbox"><input type="checkbox" checked={employmentForm.time_recording_enabled} disabled={employmentControlledByEnrollment} onChange={(event) => setEmploymentForm({ ...employmentForm, time_recording_enabled: event.target.checked })} />Time recording enabled</label>
                      {employmentControlledByEnrollment && <p className="staff-time-history-note">Admin time registration is controlled by the Requires sign-in and sign-out setting on the Admin Staff page.</p>}
                      {currentEmployment && <p className="staff-time-history-note">Current record: {displayDate(currentEmployment.effective_from)} onward. Saving creates a new dated record and closes this one.</p>}
                      <button className="staff-time-save-button" type="submit" disabled={busy}>Save new employment record</button>
                    </form>

                    <form className="staff-time-form-panel" onSubmit={saveSchedule}>
                      <div className="staff-time-form-panel-heading"><CalendarClock aria-hidden="true" size={19} /><div><h3>Expected weekly schedule</h3><p>Supports split shifts. It never creates actual clock records.</p></div></div>
                      <div className="staff-time-form-grid two-columns">
                        <label>Effective from<input type="date" value={scheduleEffectiveFrom} onChange={(event) => setScheduleEffectiveFrom(event.target.value)} required /></label>
                        <label>Schedule label<input value={scheduleLabel} onChange={(event) => setScheduleLabel(event.target.value)} maxLength={160} /></label>
                      </div>
                      <div className="staff-time-week-list">
                        {STAFF_TIME_WEEKDAYS.map((weekday) => {
                          const rows = scheduleIntervals.map((row, index) => ({ row, index })).filter(({ row }) => row.weekday === weekday.value);
                          return (
                            <div className="staff-time-week-row" key={weekday.value}>
                              <strong>{weekday.label}</strong>
                              <div>
                                {rows.map(({ row, index }) => (
                                  <span className="staff-time-interval-editor" key={`${weekday.value}-${index}`}>
                                    <input aria-label={`${weekday.label} start`} type="time" value={row.start_time} onChange={(event) => updateInterval(index, "start_time", event.target.value)} required />
                                    <span>to</span>
                                    <input aria-label={`${weekday.label} end`} type="time" value={row.end_time} onChange={(event) => updateInterval(index, "end_time", event.target.value)} required />
                                    <button type="button" aria-label={`Remove ${weekday.label} interval`} onClick={() => removeInterval(index)}><X aria-hidden="true" size={15} /></button>
                                  </span>
                                ))}
                                <button type="button" className="staff-time-add-interval" onClick={() => addInterval(weekday.value)}><Plus aria-hidden="true" size={14} />Add interval</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {currentSchedule && <p className="staff-time-history-note">Current schedule: {displayDate(currentSchedule.effective_from)} onward. New dates preserve this schedule for historical reports.</p>}
                      <button className="staff-time-save-button" type="submit" disabled={busy}>Save new schedule</button>
                    </form>

                    <form className="staff-time-form-panel" onSubmit={saveRemote}>
                      <div className="staff-time-form-panel-heading"><ShieldCheck aria-hidden="true" size={19} /><div><h3>Authorised remote work</h3><p>Only applies when the staff member&apos;s policy permits authorised remote clocking.</p></div></div>
                      <div className="staff-time-form-grid two-columns">
                        <label>Start date<input type="date" value={remoteForm.start_date} onChange={(event) => setRemoteForm({ ...remoteForm, start_date: event.target.value })} required /></label>
                        <label>End date<input type="date" value={remoteForm.end_date} onChange={(event) => setRemoteForm({ ...remoteForm, end_date: event.target.value })} required /></label>
                      </div>
                      <label>Reason / notes<textarea value={remoteForm.reason} onChange={(event) => setRemoteForm({ ...remoteForm, reason: event.target.value })} maxLength={1000} /></label>
                      <button className="staff-time-save-button" type="submit" disabled={busy}>Authorise period</button>
                      <div className="staff-time-compact-history">
                        {selectedTeacher.remote_authorisations.filter((row) => !row.revoked_at).map((row) => (
                          <div key={row.id}><span>{displayDate(row.start_date)}–{displayDate(row.end_date)}{row.reason ? ` · ${row.reason}` : ""}</span><button type="button" disabled={busy} onClick={() => void perform("revoke_remote", { id: row.id, reason: "Revoked from Staff Time administration." }, "Remote-work authorisation revoked; audit history retained.", () => loadTeachers(selectedTeacher.id))}>Revoke</button></div>
                        ))}
                        {!selectedTeacher.remote_authorisations.some((row) => !row.revoked_at) && <p>No current remote-work periods.</p>}
                      </div>
                    </form>

                    <section className="staff-time-form-panel staff-time-history-panel">
                      <div className="staff-time-form-panel-heading"><Clock3 aria-hidden="true" size={19} /><div><h3>Time-record inspection</h3><p>Original/effective times, corrections, incidences and network audit.</p></div></div>
                      <div className="staff-time-date-filter"><label>From<input type="date" value={historyStart} onChange={(event) => setHistoryStart(event.target.value)} /></label><label>To<input type="date" value={historyEnd} onChange={(event) => setHistoryEnd(event.target.value)} /></label><button type="button" onClick={() => void loadTeachers(selectedTeacher.id)}>Apply</button></div>
                      <div className="staff-time-history-records">
                        {(teacherData?.selected?.sessions || []).map((session: any) => (
                          <article key={session.id}><div><strong>{displayDate(session.work_date)}</strong><span>{formatMadridTime(session.effective_sign_in_at)}–{formatMadridTime(session.effective_sign_out_at)}</span></div><div><span>{session.clocking_mode === "authorised_remote" ? "Authorised remote" : "School network verified"}</span>{session.corrected && <small>Registro rectificado · original {formatMadridTime(session.original_sign_in_at)}–{formatMadridTime(session.original_sign_out_at)}</small>}</div></article>
                        ))}
                        {teacherData?.selected && !(teacherData.selected.sessions || []).length && <p>No actual clock sessions in this date range.</p>}
                      </div>
                      <details className="staff-time-audit-details"><summary>Detailed clock-action audit ({teacherData?.selected?.attempts?.length || 0})</summary><div>{(teacherData?.selected?.attempts || []).map((attempt: any) => <p key={attempt.id}><strong>{displayDateTime(attempt.attempted_at)}</strong> · {attempt.action_type.replace("_", " ")} · {attempt.accepted ? "Accepted" : "Rejected"} · {attempt.verification_result} · IP {attempt.request_ip}</p>)}</div></details>
                    </section>
                  </div>
                )}
              </section>
            )}

            {section === "incidences" && (
              <section className="staff-time-section" aria-labelledby="staff-time-incidences-title">
                <div className="staff-time-section-heading"><div><h2 id="staff-time-incidences-title">Incidences</h2><p>Non-punitive review queue for missing clock actions, corrections and network problems.</p></div><div className="staff-time-date-filter"><label>From<input type="date" value={incidenceStart} onChange={(event) => setIncidenceStart(event.target.value)} /></label><label>To<input type="date" value={incidenceEnd} onChange={(event) => setIncidenceEnd(event.target.value)} /></label><button type="button" onClick={() => void loadIncidences()}>Apply</button></div></div>
                <div className="staff-time-queue-grid">
                  <div className="staff-time-queue-panel"><h3>Correction requests</h3><p className="staff-time-queue-intro">Approve or reject requested effective times. Originals remain immutable.</p>{(incidenceData?.corrections || []).filter((row: any) => row.status === "pending").map((row: any) => <article key={row.id}><div><strong>{row.teacher_name}</strong><span>{row.staff_role_label} · {displayDate(row.work_date)} · {row.request_type.replaceAll("_", " ")}</span><p>{row.reason}</p><small>Requested: {formatMadridTime(row.requested_sign_in_at)}–{formatMadridTime(row.requested_sign_out_at)}</small></div><div><button type="button" disabled={row.self_action_forbidden} title={row.self_action_forbidden ? "Another Admin must review your correction request." : undefined} onClick={() => { setReviewTarget(row); setReviewDecision("approved"); }}>Review</button></div></article>)}{!(incidenceData?.corrections || []).some((row: any) => row.status === "pending") && <div className="staff-time-empty-queue"><Check size={20} aria-hidden="true" />No pending correction requests.</div>}</div>
                  <div className="staff-time-queue-panel"><h3>Open incidences</h3><p className="staff-time-queue-intro">Automatic warnings use a grace period and never invent clock times.</p>{(incidenceData?.incidences || []).filter((row: any) => row.status === "open").map((row: any) => <article key={row.id}><div><strong>{row.teacher_name}</strong><span>{row.staff_role_label} · {displayDate(row.work_date)} · {incidenceLabel(row.incidence_type)}</span><p>{row.description}</p></div><div><button type="button" disabled={row.self_action_forbidden} title={row.self_action_forbidden ? "Another Admin must resolve your Staff Time incidence." : undefined} onClick={() => { setResolveTarget(row); setResolutionStatus("resolved"); }}>Resolve</button></div></article>)}{!(incidenceData?.incidences || []).some((row: any) => row.status === "open") && <div className="staff-time-empty-queue"><Check size={20} aria-hidden="true" />No open incidences.</div>}</div>
                </div>
                <form className="staff-time-form-panel staff-time-manual-form" onSubmit={saveManualCorrection}>
                  <div className="staff-time-form-panel-heading"><UserRoundCog aria-hidden="true" size={19} /><div><h3>Audited manual resolution</h3><p>Create an approved correction for a missing or incorrect event. This never inserts a backdated original clock event.</p></div></div>
                  <div className="staff-time-form-grid three-columns">
                    <label>Staff member<select value={manualForm.teacher_id} onChange={(event) => { const teacherId = event.target.value; setManualForm({ ...manualForm, teacher_id: teacherId, session_id: "" }); setSelectedTeacherId(teacherId); setTeacherData((data: any) => ({ ...data, selected: null })); if (teacherId) void loadTeachers(teacherId); }} required><option value="">Choose staff member</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id} disabled={teacher.staff_role === "admin" && teacher.id === currentAdminId}>{teacher.name} · {teacher.staff_role_label}{teacher.staff_role === "admin" && teacher.id === currentAdminId ? " (your record)" : ""}</option>)}</select></label>
                    <label>Work date<input type="date" value={manualForm.work_date} onChange={(event) => setManualForm({ ...manualForm, work_date: event.target.value })} required /></label>
                    <label>Related clock session<select value={manualForm.session_id} onChange={(event) => setManualForm({ ...manualForm, session_id: event.target.value })}><option value="">Missing event / no existing session</option>{(teacherData?.selected?.sessions || []).filter((session: any) => !String(session.id).startsWith("correction:") && session.work_date === manualForm.work_date).map((session: any) => <option value={session.id} key={session.id}>{displayDate(session.work_date)} · {formatMadridTime(session.effective_sign_in_at)}–{formatMadridTime(session.effective_sign_out_at)}</option>)}</select></label>
                    <label>Corrected sign-in<input type="time" value={manualForm.sign_in_time} onChange={(event) => setManualForm({ ...manualForm, sign_in_time: event.target.value })} /></label>
                    <label>Corrected sign-out<input type="time" value={manualForm.sign_out_time} onChange={(event) => setManualForm({ ...manualForm, sign_out_time: event.target.value })} /></label>
                  </div>
                  <label>Reason<textarea value={manualForm.reason} onChange={(event) => setManualForm({ ...manualForm, reason: event.target.value })} required maxLength={2000} placeholder="Record the evidence and reason for the correction." /></label>
                  {manualSelfActionForbidden && <p className="staff-time-history-note">Another Admin must create a manual correction for your own record.</p>}
                  <button className="staff-time-save-button" type="submit" disabled={busy || manualSelfActionForbidden || (!manualForm.sign_in_time && !manualForm.sign_out_time)}>Approve audited correction</button>
                </form>
              </section>
            )}

            {section === "reports" && (
              <section className="staff-time-section" aria-labelledby="staff-time-reports-title">
                <div className="staff-time-section-heading"><div><h2 id="staff-time-reports-title">Official reports</h2><p>Spanish A4 PDF and native XLSX generated from the same authoritative record model.</p></div></div>
                <div className="staff-time-report-panel">
                  <div className="staff-time-report-form">
                    <label>Quick month<input type="month" value={reportMonth} onChange={(event) => { const month = event.target.value; const range = monthDates(month); setReportMonth(month); setReportStart(range.start); setReportEnd(range.end); }} /></label>
                    <label>From<input type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} /></label>
                    <label>To<input type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} /></label>
                    <label>Staff member<select value={reportTeacher} onChange={(event) => setReportTeacher(event.target.value)}><option value="all">All enrolled staff</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name} · {teacher.staff_role_label}{teacher.active ? "" : " (inactive)"}</option>)}</select></label>
                  </div>
                  <div className="staff-time-report-actions">
                    <button type="button" onClick={() => void download("pdf")} disabled={Boolean(downloading)}><FileText aria-hidden="true" size={20} /><span><strong>{downloading === "pdf" ? "Generating…" : "Official PDF"}</strong><small>Spanish · A4 · inspection-ready</small></span><Download aria-hidden="true" size={17} /></button>
                    <button type="button" onClick={() => void download("xlsx")} disabled={Boolean(downloading)}><FileSpreadsheet aria-hidden="true" size={20} /><span><strong>{downloading === "xlsx" ? "Generating…" : "Excel / XLSX"}</strong><small>Native workbook · gestoría-ready</small></span><Download aria-hidden="true" size={17} /></button>
                  </div>
                  <div className="staff-time-report-note"><ShieldCheck aria-hidden="true" size={19} /><p>Reports show actual effective times, approved rectifications, split sessions, authorised remote work and School Calendar closures. Variance is neutral and is not automatically classified as overtime or underwork.</p></div>
                </div>
              </section>
            )}

            {section === "settings" && (
              <section className="staff-time-section" aria-labelledby="staff-time-settings-title">
                <div className="staff-time-section-heading"><div><h2 id="staff-time-settings-title">Settings</h2><p>Legal employer identity and allowed school public networks.</p></div></div>
                <div className="staff-time-settings-grid">
                  <form className="staff-time-form-panel" onSubmit={(event) => { event.preventDefault(); void perform("save_company", companyForm, "Company and workplace details saved as a new effective record.", loadSettings); }}>
                    <div className="staff-time-form-panel-heading"><Building2 aria-hidden="true" size={19} /><div><h3>Company / workplace details</h3><p>Used in official reports. Details are stored in the database, never hard-coded.</p></div></div>
                    <div className="staff-time-form-grid two-columns">
                      <label>Effective from<input type="date" value={companyForm.effective_from} onChange={(event) => setCompanyForm({ ...companyForm, effective_from: event.target.value })} required /></label>
                      <label>Legal company / employer name<input value={companyForm.legal_employer_name} onChange={(event) => setCompanyForm({ ...companyForm, legal_employer_name: event.target.value })} required /></label>
                      <label>CIF/NIF<input value={companyForm.tax_identifier} onChange={(event) => setCompanyForm({ ...companyForm, tax_identifier: event.target.value })} required /></label>
                      <label>Workplace / trading name<input value={companyForm.workplace_name} onChange={(event) => setCompanyForm({ ...companyForm, workplace_name: event.target.value })} required /></label>
                      <label className="span-two">Workplace address<input value={companyForm.workplace_address} onChange={(event) => setCompanyForm({ ...companyForm, workplace_address: event.target.value })} required /></label>
                      <label>Postcode<input value={companyForm.postcode} onChange={(event) => setCompanyForm({ ...companyForm, postcode: event.target.value })} required /></label>
                      <label>City<input value={companyForm.city} onChange={(event) => setCompanyForm({ ...companyForm, city: event.target.value })} required /></label>
                      <label>Province<input value={companyForm.province} onChange={(event) => setCompanyForm({ ...companyForm, province: event.target.value })} required /></label>
                      <label>Country<input value={companyForm.country} onChange={(event) => setCompanyForm({ ...companyForm, country: event.target.value })} required /></label>
                    </div>
                    <p className="staff-time-history-note">Records are retained for at least four years. Saving new legal details closes the current dated record and preserves historical report identity.</p>
                    <button className="staff-time-save-button" type="submit" disabled={busy}>Save company settings</button>
                  </form>
                  <section className="staff-time-form-panel">
                    <div className="staff-time-form-panel-heading"><ShieldCheck aria-hidden="true" size={19} /><div><h3>Allowed School Networks</h3><p>Public IP or CIDR checked only when a staff member clocks in or out.</p></div></div>
                    <form className="staff-time-network-form" onSubmit={(event) => { event.preventDefault(); void perform("add_network", networkForm, "Allowed school network added.", loadSettings); }}><label>Label<input value={networkForm.label} onChange={(event) => setNetworkForm({ ...networkForm, label: event.target.value })} required placeholder="Main Academy Internet" /></label><label>IP address / CIDR<input value={networkForm.network} onChange={(event) => setNetworkForm({ ...networkForm, network: event.target.value })} required placeholder="85.10.20.30 or 85.10.20.0/24" /></label><button type="submit" disabled={busy}><Plus aria-hidden="true" size={16} />Add network</button></form>
                    <button type="button" className="staff-time-current-ip-button" disabled={busy || !settingsData?.current_ip || !networkForm.label} onClick={() => void perform("add_current_network", { label: networkForm.label }, "The current Admin network IP was added.", loadSettings)}><ShieldCheck aria-hidden="true" size={17} />Add current network IP{settingsData?.current_ip ? ` (${settingsData.current_ip})` : ""}</button>
                    <div className="staff-time-network-list">{(settingsData?.networks || []).map((network: any) => <article key={network.id}><div><strong>{network.label}</strong><span>{network.network}</span></div><button type="button" className={network.active ? "is-active" : ""} onClick={() => void perform("toggle_network", { id: network.id, active: !network.active }, network.active ? "Network deactivated; history retained." : "Network activated.", loadSettings)} disabled={busy}>{network.active ? "Active" : "Inactive"}</button></article>)}{!(settingsData?.networks || []).length && <p>No allowed school networks configured.</p>}</div>
                  </section>
                </div>
                <aside className="staff-time-legal-note">Template designed for Spanish working-time record requirements. Confirm company-specific payroll/reporting requirements with the gestoría.</aside>
              </section>
            )}
          </>
        )}

        {reviewTarget && (
          <div className="staff-time-modal-backdrop" role="presentation"><div className="staff-time-modal" role="dialog" aria-modal="true" aria-labelledby="staff-time-review-title"><button type="button" className="staff-time-modal-close" aria-label="Close" onClick={() => setReviewTarget(null)}><X size={18} /></button><h2 id="staff-time-review-title">Review correction request</h2><p><strong>{reviewTarget.teacher_name}</strong> · {displayDate(reviewTarget.work_date)}</p><div className="staff-time-review-original"><span>Requested effective record</span><strong>{formatMadridTime(reviewTarget.requested_sign_in_at)}–{formatMadridTime(reviewTarget.requested_sign_out_at)}</strong><p>{reviewTarget.reason}</p></div><label>Decision<select value={reviewDecision} onChange={(event) => setReviewDecision(event.target.value as "approved" | "rejected")}><option value="approved">Approve</option><option value="rejected">Reject</option></select></label><label>Review note<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} /></label><div className="staff-time-modal-actions"><button type="button" onClick={() => setReviewTarget(null)}>Cancel</button><button type="button" disabled={busy} onClick={() => void perform("review_correction", { id: reviewTarget.id, decision: reviewDecision, review_note: reviewNote }, `Correction ${reviewDecision}. Original clock evidence remains unchanged.`, async () => { await loadIncidences(); setReviewTarget(null); setReviewNote(""); })}>Confirm decision</button></div></div></div>
        )}

        {resolveTarget && (
          <div className="staff-time-modal-backdrop" role="presentation"><div className="staff-time-modal" role="dialog" aria-modal="true" aria-labelledby="staff-time-resolve-title"><button type="button" className="staff-time-modal-close" aria-label="Close" onClick={() => setResolveTarget(null)}><X size={18} /></button><h2 id="staff-time-resolve-title">Resolve incidence</h2><p><strong>{resolveTarget.teacher_name}</strong> · {incidenceLabel(resolveTarget.incidence_type)} · {displayDate(resolveTarget.work_date)}</p><label>Outcome<select value={resolutionStatus} onChange={(event) => setResolutionStatus(event.target.value as "resolved" | "dismissed")}><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></label><label>Resolution note<textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} required maxLength={2000} /></label><p className="staff-time-history-note">If an actual time is missing, cancel this dialog and use Audited manual resolution. Do not resolve by inventing an original clock event.</p><div className="staff-time-modal-actions"><button type="button" onClick={() => setResolveTarget(null)}>Cancel</button><button type="button" disabled={busy || !resolutionNote.trim()} onClick={() => void perform("resolve_incidence", { id: resolveTarget.id, status: resolutionStatus, resolution_note: resolutionNote }, "Incidence resolved with an audit note.", async () => { await loadIncidences(); setResolveTarget(null); setResolutionNote(""); })}>Save resolution</button></div></div></div>
        )}
      </main>
    </AdminLayout>
  );
}
