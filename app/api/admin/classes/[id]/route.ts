import { NextRequest, NextResponse } from "next/server";

import {
  isValidClassId,
  validateAdminClassPayload,
} from "../../../../../lib/adminClassServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const classId = (await context.params).id;
    if (!isValidClassId(classId)) {
      return examBankJsonError("Invalid class identifier.", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return examBankJsonError("Invalid JSON request body.", 400);
    }

    const levelId = Number((body as Record<string, unknown>)?.level_id);
    const { data: level, error: levelError } = await supabaseAdmin
      .from("levels")
      .select("id, name, catagory")
      .eq("id", levelId)
      .maybeSingle();
    if (levelError) return examBankJsonError("Unable to verify the level.", 500);

    const academicYearId = String(
      (body as Record<string, unknown>)?.academic_year_id || ""
    ).trim();
    const { data: academicYear, error: academicYearError } =
      isValidClassId(academicYearId)
        ? await supabaseAdmin
            .from("academic_years")
            .select("id, start_date, end_date")
            .eq("id", academicYearId)
            .maybeSingle()
        : { data: null, error: null };
    if (academicYearError) {
      return examBankJsonError("Unable to verify the academic year.", 500);
    }

    const validation = validateAdminClassPayload(body, level, academicYear);
    if (validation.error || !validation.value) {
      return examBankJsonError(validation.error || "Invalid class details.", 422);
    }

    const { data: updateResult, error } = await supabaseAdmin.rpc(
      "update_class_with_effective_dates",
      {
        p_actor_id: admin.userId,
        p_class_id: classId,
        p_class_name: validation.value.class_name,
        p_level_id: validation.value.level_id,
        p_teacher_id: validation.value.teacher_id,
        p_classroom_id: validation.value.classroom_id,
        p_course_type: validation.value.course_type,
        p_days: validation.value.days,
        p_start_time: validation.value.start_time,
        p_end_time: validation.value.end_time,
        p_meet_link: validation.value.meet_link,
        p_is_cambridge: validation.value.is_cambridge,
        p_academic_year_id: validation.value.academic_year_id,
        p_start_date: validation.value.start_date,
        p_end_date: validation.value.end_date,
        p_confirm_date_impact: (body as Record<string, unknown>)?.confirm_date_impact === true,
      }
    );
    if (error) {
      console.error("Admin class update failed:", {
        actorId: admin.userId,
        classId,
        code: error.code,
      });
      if (error.code === "42501") return examBankJsonError("Admin access required.", 403);
      if (error.code === "22023") return examBankJsonError(error.message, 422);
      throw error;
    }
    if (updateResult?.requires_confirmation) {
      return NextResponse.json(
        {
          error: "These date changes affect existing enrolments and require confirmation.",
          requires_confirmation: true,
          affected_count: Number(updateResult.affected_count || 0),
          affected_enrolments: updateResult.affected_enrolments || [],
        },
        { status: 409 }
      );
    }
    const { data: classroom, error: classroomError } = await supabaseAdmin
      .from("classes")
      .select("*")
      .eq("id", classId)
      .maybeSingle();
    if (classroomError) throw classroomError;
    if (!classroom) return examBankJsonError("Class not found.", 404);

    return NextResponse.json({ class: classroom });
  } catch {
    return examBankJsonError("Unable to update the class.", 500);
  }
}
