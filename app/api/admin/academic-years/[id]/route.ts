import { NextRequest, NextResponse } from "next/server";

import {
  isAcademicYearId,
  validateAcademicYearDetails,
} from "../../../../../lib/academicYearsServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { getAcademicYearSwitchReadiness } from "../../../../../lib/academicYearRolloverServer";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const academicYearId = (await context.params).id;
    if (!isAcademicYearId(academicYearId)) {
      return examBankJsonError("Invalid academic year identifier.", 400);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return examBankJsonError("Invalid JSON request body.", 400);
    }

    const action = String(body.action || "");

    if (action === "set_current") {
      if (body.confirm_readiness !== true) {
        return examBankJsonError(
          "Review academic year readiness before changing the Current year.",
          409
        );
      }

      const readiness = await getAcademicYearSwitchReadiness(
        academicYearId,
        admin.userId
      );
      const { data, error } = await supabaseAdmin.rpc(
        "set_current_academic_year",
        { p_academic_year_id: academicYearId }
      );
      if (error) {
        console.error("Set current academic year failed:", {
          actorId: admin.userId,
          academicYearId,
          code: error.code,
        });
        return examBankJsonError("Unable to set the current academic year.", 500);
      }

      const academicYear = Array.isArray(data) ? data[0] : data;
      return NextResponse.json({ academic_year: academicYear, readiness });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("academic_years")
      .select("id, status")
      .eq("id", academicYearId)
      .maybeSingle();
    if (existingError) {
      return examBankJsonError("Unable to verify the academic year.", 500);
    }
    if (!existing) return examBankJsonError("Academic year not found.", 404);

    if (action === "archive") {
      if (existing.status === "current") {
        return examBankJsonError(
          "Set another academic year as Current before archiving this one.",
          409
        );
      }

      const { data, error } = await supabaseAdmin
        .from("academic_years")
        .update({ status: "archived" })
        .eq("id", academicYearId)
        .select("id, label, start_date, end_date, status, created_at, updated_at")
        .single();
      if (error) return examBankJsonError("Unable to archive the academic year.", 500);
      return NextResponse.json({ academic_year: data });
    }

    if (action === "update") {
      const validation = validateAcademicYearDetails(body);
      if (validation.error || !validation.value) {
        return examBankJsonError(
          validation.error || "Invalid academic year details.",
          422
        );
      }

      const { data, error } = await supabaseAdmin
        .from("academic_years")
        .update(validation.value)
        .eq("id", academicYearId)
        .select("id, label, start_date, end_date, status, created_at, updated_at")
        .single();
      if (error) {
        return examBankJsonError(
          error.code === "23505"
            ? "An academic year with this label already exists."
            : "Unable to update the academic year.",
          error.code === "23505" ? 409 : 500
        );
      }
      return NextResponse.json({ academic_year: data });
    }

    return examBankJsonError("Choose a valid academic year action.", 400);
  } catch (error) {
    console.error("Admin academic year update failed:", error);
    return examBankJsonError("Unable to update the academic year.", 500);
  }
}
