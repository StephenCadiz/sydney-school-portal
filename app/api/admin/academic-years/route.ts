import { NextRequest, NextResponse } from "next/server";

import {
  getAcademicYearsWithClassCounts,
  validateAcademicYearDetails,
} from "../../../../lib/academicYearsServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const academicYears = await getAcademicYearsWithClassCounts();
    return NextResponse.json({ academic_years: academicYears });
  } catch (error) {
    console.error("Admin academic years load failed:", error);
    return examBankJsonError("Unable to load academic years.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return examBankJsonError("Invalid JSON request body.", 400);
    }

    const validation = validateAcademicYearDetails(body);
    if (validation.error || !validation.value) {
      return examBankJsonError(
        validation.error || "Invalid academic year details.",
        422
      );
    }

    const { data, error } = await supabaseAdmin
      .from("academic_years")
      .insert({ ...validation.value, status: "future" })
      .select("id, label, start_date, end_date, status, created_at, updated_at")
      .single();

    if (error) {
      console.error("Admin academic year creation failed:", {
        actorId: admin.userId,
        code: error.code,
      });
      return examBankJsonError(
        error.code === "23505"
          ? "An academic year with this label already exists."
          : "Unable to create the academic year.",
        error.code === "23505" ? 409 : 500
      );
    }

    return NextResponse.json({ academic_year: data }, { status: 201 });
  } catch (error) {
    console.error("Admin academic year creation failed:", error);
    return examBankJsonError("Unable to create the academic year.", 500);
  }
}
