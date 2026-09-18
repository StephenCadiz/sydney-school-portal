import "server-only";

import { NextRequest } from "next/server";
import { getMadridDate } from "./staffTime";
import { supabaseAdmin } from "./supabaseAdmin";

export type MonitoringStatus =
  | "awaiting_teacher_feedback"
  | "monitoring_continued"
  | "overdue"
  | "feedback_submitted"
  | "kept"
  | "moved_up"
  | "moved_down"
  | "continued"
  | "closed";

export type MonitoringRecord = {
  id: string;
  student_id: string;
  class_id: string;
  level_id: number;
  teacher_id: string;
  reason: string;
  feedback_due_on: string;
  status: MonitoringStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision: string | null;
  admin_notes: string | null;
  continue_count: number;
  student_name?: string;
  class_name?: string;
  level_name?: string;
  teacher_name?: string;
  feedback?: Record<string, unknown> | null;
};

function bearerToken(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export async function authenticateMonitoringActor(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return { actor: null, error: { message: "Authentication required.", status: 401 } };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { actor: null, error: { message: "Authentication required.", status: 401 } };
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles").select("id, role, first_name, last_name").eq("id", data.user.id).maybeSingle();
  if (profileError) return { actor: null, error: { message: "Unable to verify access.", status: 500 } };
  if (!profile || !["admin", "teacher"].includes(String(profile.role))) {
    return { actor: null, error: { message: "Monitoring access denied.", status: 403 } };
  }
  return { actor: { id: String(profile.id), role: String(profile.role), profile }, error: null };
}

function effectiveStatus(row: any, today = getMadridDate()): MonitoringStatus {
  if (["awaiting_teacher_feedback", "monitoring_continued"].includes(String(row.status)) && String(row.feedback_due_on) < today) {
    return "overdue";
  }
  return String(row.status) as MonitoringStatus;
}

async function decorate(rows: any[]): Promise<MonitoringRecord[]> {
  const studentIds = [...new Set(rows.map((row) => String(row.student_id)).filter(Boolean))];
  const classIds = [...new Set(rows.map((row) => String(row.class_id)).filter(Boolean))];
  const levelIds = [...new Set(rows.map((row) => Number(row.level_id)).filter(Number.isFinite))];
  const [students, classes, levels, teachers, feedback] = await Promise.all([
    studentIds.length ? supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", studentIds) : { data: [], error: null },
    classIds.length ? supabaseAdmin.from("classes").select("id, class_name").in("id", classIds) : { data: [], error: null },
    levelIds.length ? supabaseAdmin.from("levels").select("id, name").in("id", levelIds) : { data: [], error: null },
    [...new Set(rows.map((row) => String(row.teacher_id)).filter(Boolean))].length
      ? supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", [...new Set(rows.map((row) => String(row.teacher_id)).filter(Boolean))])
      : { data: [], error: null },
    rows.length ? supabaseAdmin.from("student_monitoring_feedback").select("*").in("monitoring_id", rows.map((row) => row.id)).order("submitted_at", { ascending: false }) : { data: [], error: null },
  ]);
  const byId = (values: any[]) => new Map((values || []).map((value) => [String(value.id), value]));
  const studentById = byId(students.data || []), classById = byId(classes.data || []), levelById = byId(levels.data || []), teacherById = byId(teachers.data || []);
  const feedbackById = new Map<string, any>();
  for (const item of feedback.data || []) if (!feedbackById.has(String(item.monitoring_id))) feedbackById.set(String(item.monitoring_id), item);
  return rows.map((row) => {
    const student = studentById.get(String(row.student_id));
    const teacher = teacherById.get(String(row.teacher_id));
    return { ...row, status: effectiveStatus(row), student_name: `${student?.first_name || ""} ${student?.last_name || ""}`.trim() || "Student", class_name: classById.get(String(row.class_id))?.class_name || "Class", level_name: levelById.get(String(row.level_id))?.name || "Level", teacher_name: `${teacher?.first_name || ""} ${teacher?.last_name || ""}`.trim() || "Teacher", feedback: feedbackById.get(String(row.id)) || null };
  });
}

export async function loadMonitoringRecords(actorId: string, role: string, classId?: string) {
  let query = supabaseAdmin.from("student_monitoring_records").select("*").order("feedback_due_on", { ascending: true }).order("created_at", { ascending: false });
  if (role === "teacher") query = query.eq("teacher_id", actorId);
  if (classId) query = query.eq("class_id", classId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  if (role === "teacher" && rows.length) {
    const classIds = [...new Set(rows.map((row) => String(row.class_id)).filter(Boolean))];
    const { data: assignedClasses, error: classError } = await supabaseAdmin
      .from("classes").select("id").in("id", classIds).eq("teacher_id", actorId);
    if (classError) throw classError;
    const allowed = new Set((assignedClasses || []).map((row) => String(row.id)));
    return decorate(rows.filter((row) => allowed.has(String(row.class_id))));
  }
  return decorate(rows);
}

export async function loadMonitoringOptions() {
  const [students, classes, levels] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, first_name, last_name").eq("role", "student").eq("active", true).order("last_name"),
    supabaseAdmin.from("classes").select("id, class_name, level_id, teacher_id").not("teacher_id", "is", null).order("class_name"),
    supabaseAdmin.from("levels").select("id, name").order("id"),
  ]);
  if (students.error || classes.error || levels.error) throw students.error || classes.error || levels.error;
  const teacherIds = [...new Set((classes.data || []).map((row) => row.teacher_id).filter(Boolean))];
  const teachers = teacherIds.length ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", teacherIds) : { data: [], error: null };
  return {
    students: students.data || [],
    classes: classes.data || [],
    levels: (levels.data || []).filter((level) => !/intensive|express/i.test(String(level.name || ""))),
    teachers: teachers.data || [],
  };
}

export async function callMonitoringRpc<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
