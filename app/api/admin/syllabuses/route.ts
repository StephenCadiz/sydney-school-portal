import { NextRequest, NextResponse } from "next/server";

import {
  loadSyllabusById,
  logSyllabusFailure,
  requireSyllabusAdmin,
  serializeSyllabus,
  syllabusJsonError,
  SYLLABUS_SELECT,
} from "../../../../lib/syllabusServer";
import {
  validateSyllabusCreateInput,
  validateSyllabusTitle,
} from "../../../../lib/syllabusValidation";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  try {
    const [syllabusResult, yearResult, levelResult] = await Promise.all([
      supabaseAdmin
        .from("syllabuses")
        .select(SYLLABUS_SELECT)
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("academic_years")
        .select("id, label, start_date, end_date, status")
        .order("start_date", { ascending: false }),
      supabaseAdmin.from("levels").select("id, name").order("name"),
    ]);

    if (syllabusResult.error) throw syllabusResult.error;
    if (yearResult.error) throw yearResult.error;
    if (levelResult.error) throw levelResult.error;

    return NextResponse.json({
      syllabuses: (syllabusResult.data || []).map((row) =>
        serializeSyllabus(row)
      ),
      reference_data: {
        academic_years: yearResult.data || [],
        levels: levelResult.data || [],
      },
    });
  } catch (error) {
    logSyllabusFailure("admin-list", error);
    return syllabusJsonError("Unable to load syllabuses.", 500);
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  try {
    const body = await request.json().catch(() => null);
    const validation = validateSyllabusCreateInput(body);
    if (validation.error || !validation.value) {
      return syllabusJsonError(validation.error || "Invalid syllabus details.", 422);
    }

    const [yearResult, levelResult] = await Promise.all([
      supabaseAdmin
        .from("academic_years")
        .select("id, label")
        .eq("id", validation.value.academicYearId)
        .maybeSingle(),
      supabaseAdmin
        .from("levels")
        .select("id, name")
        .eq("id", validation.value.levelId)
        .maybeSingle(),
    ]);
    if (yearResult.error) throw yearResult.error;
    if (levelResult.error) throw levelResult.error;
    if (!yearResult.data) {
      return syllabusJsonError("Selected academic year was not found.", 404);
    }
    if (!levelResult.data) {
      return syllabusJsonError("Selected level was not found.", 404);
    }

    const generatedTitle = `${String(levelResult.data.name || "").trim()} Syllabus — ${String(yearResult.data.label || "").trim()}`;
    const titleValidation = validateSyllabusTitle(
      validation.value.title || generatedTitle
    );
    if (titleValidation.error) {
      return syllabusJsonError(titleValidation.error, 422);
    }

    const { data, error } = await supabaseAdmin
      .from("syllabuses")
      .insert({
        academic_year_id: validation.value.academicYearId,
        level_id: validation.value.levelId,
        title: titleValidation.value,
        status: "draft",
        created_by: admin.userId,
        updated_by: admin.userId,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return syllabusJsonError(
          "A syllabus already exists for this academic year and level.",
          409
        );
      }
      throw error;
    }

    const syllabus = await loadSyllabusById(String(data.id));
    return NextResponse.json({ syllabus }, { status: 201 });
  } catch (error) {
    logSyllabusFailure("admin-create", error);
    return syllabusJsonError("Unable to create the syllabus.", 500);
  }
}
