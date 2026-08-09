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
            .select("id")
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

    const { data: classroom, error } = await supabaseAdmin
      .from("classes")
      .update(validation.value)
      .eq("id", classId)
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("Admin class update failed:", {
        actorId: admin.userId,
        classId,
        code: error.code,
      });
      return examBankJsonError("Unable to update the class.", 500);
    }
    if (!classroom) return examBankJsonError("Class not found.", 404);

    return NextResponse.json({ class: classroom });
  } catch {
    return examBankJsonError("Unable to update the class.", 500);
  }
}
