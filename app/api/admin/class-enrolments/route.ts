import { NextRequest, NextResponse } from "next/server";

import { requireExamBankAdmin } from "../../../../lib/cambridgeExamBankServer";
import { isEnrolmentDate, madridEnrolmentDate } from "../../../../lib/classEnrolment";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

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
    const classIds = [...new Set((data || []).map(period => period.class_id))];
    const classes = classIds.length
      ? await supabaseAdmin.from("classes").select("id, class_name").in("id", classIds)
      : { data: [], error: null };
    if (classes.error) throw classes.error;
    const names = new Map((classes.data || []).map(row => [row.id, row.class_name]));
    return response({
      periods: (data || []).map(period => ({ ...period, class_name: names.get(period.class_id) || "Class" })),
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
  const keys = ["student_type", "student_id", "action", "class_id", "starts_on", "ends_before", "period_id"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key)) ||
    !validStudent(body.student_type, body.student_id) ||
    !["enrol", "transfer", "withdraw", "correct", "cancel"].includes(body.action) ||
    typeof body.class_id !== "string" || !uuid.test(body.class_id) ||
    !isEnrolmentDate(body.starts_on) ||
    (body.ends_before !== null && !isEnrolmentDate(body.ends_before)) ||
    (body.action === "enrol" ? body.period_id !== null : typeof body.period_id !== "string" || !uuid.test(body.period_id))) {
    return response({ error: "Provide a valid class, operation and explicit enrolment dates." }, 400);
  }
  try {
    const { data, error } = await supabaseAdmin.rpc("manage_class_enrolment_period", {
      p_actor_id: admin.userId,
      p_student_type: body.student_type,
      p_student_id: body.student_id,
      p_action: body.action,
      p_class_id: body.class_id,
      p_starts_on: body.starts_on,
      p_ends_before: body.ends_before,
      p_period_id: body.period_id,
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
