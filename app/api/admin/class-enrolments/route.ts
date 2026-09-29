import { NextRequest, NextResponse } from "next/server";

import { requireExamBankAdmin } from "../../../../lib/cambridgeExamBankServer";
import { isEnrolmentDate, madridEnrolmentDate } from "../../../../lib/classEnrolment";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getEffectiveClassDateRange, isDateWithinEffectiveClassRange } from "../../../../lib/classDateRange";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const response = (payload: unknown, status = 200) => NextResponse.json(payload, {
  status, headers: { "Cache-Control": "no-store" },
});

function validStudent(type: unknown, id: unknown) {
  return (type === "profile" || type === "young_learner") && typeof id === "string" && uuid.test(id);
}

export async function GET(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;
  const type = request.nextUrl.searchParams.get("student_type");
  const id = request.nextUrl.searchParams.get("student_id");
  if (!validStudent(type, id)) return response({ error: "Choose a valid student." }, 400);
  try {
    const { data, error } = await supabaseAdmin.from("class_enrolment_periods")
      .select("id, class_id, student_type, starts_on, ends_before, cancelled_at")
      .eq("student_type", type).eq("student_id", id)
      .order("starts_on", { ascending: false }).order("id");
    if (error) throw error;
    const classes = await supabaseAdmin.from("classes")
      .select("id, class_name, days, start_time, end_time, classroom_id, teacher_id, level_id, is_cambridge, course_type, academic_year_id, start_date, end_date");
    if (classes.error) throw classes.error;
    const { data: currentAcademicYear, error: academicYearError } = await supabaseAdmin
      .from("academic_years").select("id, start_date, end_date").eq("status", "current").maybeSingle();
    if (academicYearError) throw academicYearError;
    const today = madridEnrolmentDate();
    const isActiveClass = (row: any) => {
      if (!currentAcademicYear || String(row.academic_year_id || "") !== String(currentAcademicYear.id)) return false;
      return isDateWithinEffectiveClassRange(today, getEffectiveClassDateRange({
        academicYearStart: currentAcademicYear.start_date,
        academicYearEnd: currentAcademicYear.end_date,
        classStart: row.start_date,
        classEnd: row.end_date,
      }));
    };
    const levelIds = [...new Set((classes.data || []).map(row => row.level_id).filter(Boolean))];
    const teacherIds = [...new Set((classes.data || []).map(row => row.teacher_id).filter(Boolean))];
    const classroomIds = [...new Set((classes.data || []).map(row => row.classroom_id).filter(Boolean))];
    const [{ data: levels, error: levelsError }, { data: teachers, error: teachersError }, { data: classrooms, error: classroomsError }] = await Promise.all([
      levelIds.length ? supabaseAdmin.from("levels").select("id, name").in("id", levelIds) : Promise.resolve({ data: [], error: null }),
      teacherIds.length ? supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", teacherIds) : Promise.resolve({ data: [], error: null }),
      classroomIds.length ? supabaseAdmin.from("classrooms").select("id, name").in("id", classroomIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (levelsError || teachersError || classroomsError) throw levelsError || teachersError || classroomsError;
    const names = new Map((classes.data || []).map(row => [row.id, row.class_name]));
    const levelNames = new Map((levels || []).map(row => [String(row.id), row.name]));
    const teacherNames = new Map((teachers || []).map(row => [String(row.id), `${row.first_name || ""} ${row.last_name || ""}`.trim()]));
    const classroomNames = new Map((classrooms || []).map(row => [String(row.id), row.name]));
    const periodRows = (data || []).map(period => ({
      ...period,
      class_name: names.get(period.class_id) || "Class",
      level_name: levelNames.get(String((classes.data || []).find(row => row.id === period.class_id)?.level_id)) || "Level",
    }));
    const classRows = (classes.data || [])
      .filter(row => Boolean(row.is_cambridge) === (type === "profile"))
      .filter(isActiveClass)
      .map(row => ({
        id: row.id,
        class_name: row.class_name,
        level_name: levelNames.get(String(row.level_id)) || "Level",
        days: row.days || null,
        start_time: row.start_time || null,
        end_time: row.end_time || null,
        classroom_name: classroomNames.get(String(row.classroom_id)) || null,
        teacher_name: teacherNames.get(String(row.teacher_id)) || null,
        course_type: row.course_type || null,
        academic_year_id: row.academic_year_id || null,
        start_date: row.start_date || null,
        end_date: row.end_date || null,
      }));
    return response({
      periods: periodRows,
      classes: classRows,
      today_madrid: madridEnrolmentDate(),
    });
  } catch (error) {
    console.error("Admin enrolment history failed:", error);
    return response({ error: "Unable to load class enrolment history." }, 500);
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;
  const body = await request.json().catch(() => null);
  const keys = ["student_type", "student_id", "action", "class_id", "starts_on", "ends_before", "period_id", "reason"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key)) ||
    !validStudent(body.student_type, body.student_id) ||
    !["enrol", "transfer", "withdraw", "correct", "cancel"].includes(body.action) ||
    typeof body.class_id !== "string" || !uuid.test(body.class_id) ||
    !isEnrolmentDate(body.starts_on) ||
    (body.ends_before !== null && !isEnrolmentDate(body.ends_before)) ||
    (body.reason !== undefined && body.reason !== null && (typeof body.reason !== "string" || body.reason.trim().length > 500)) ||
    (body.action === "withdraw" && typeof body.reason !== "string" || body.action === "withdraw" && !body.reason.trim()) ||
    (body.action === "enrol" ? body.period_id !== null : typeof body.period_id !== "string" || !uuid.test(body.period_id))) {
    return response({ error: "Provide a valid class, operation and explicit enrolment dates." }, 400);
  }
  try {
    const { data, error } = await supabaseAdmin.rpc("manage_class_enrolment_period_with_reason", {
      p_actor_id: admin.userId,
      p_student_type: body.student_type,
      p_student_id: body.student_id,
      p_action: body.action,
      p_class_id: body.class_id,
      p_starts_on: body.starts_on,
      p_ends_before: body.ends_before,
      p_period_id: body.period_id,
      p_reason: typeof body.reason === "string" ? body.reason.trim() : null,
    });
    if (error) {
      if (error.code === "42501") return response({ error: "Admin access required." }, 403);
      if (error.code === "23P01") return response({ error: "These dates overlap an existing enrolment period." }, 409);
      if (error.code === "22023") return response({ error: error.message }, 422);
      if (error.code === "23514") return response({ error: "The end must be after the start and within the class dates." }, 422);
      throw error;
    }
    return response({ period_id: data });
  } catch (error) {
    console.error("Admin enrolment change failed:", error);
    return response({ error: "Unable to save the enrolment change. No partial change was saved." }, 500);
  }
}
