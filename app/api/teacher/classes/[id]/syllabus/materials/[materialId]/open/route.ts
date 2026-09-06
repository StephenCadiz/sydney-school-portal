import { NextRequest, NextResponse } from "next/server";

import {
  logSyllabusFailure,
  requireTeacherSyllabusClass,
  syllabusJsonError,
  SYLLABUS_SIGNED_URL_SECONDS,
  SYLLABUS_STORAGE_BUCKET,
} from "../../../../../../../../../lib/syllabusServer";
import { isSyllabusUuid } from "../../../../../../../../../lib/syllabusValidation";
import { supabaseAdmin } from "../../../../../../../../../lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{ id: string; materialId: string }>;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { id, materialId } = await routeContext.params;
  const classId = String(id || "").trim();
  const requestedMaterialId = String(materialId || "").trim();
  const access = await requireTeacherSyllabusClass(request, classId);
  if (access.response || !access.context) return access.response;
  if (!isSyllabusUuid(requestedMaterialId)) {
    return syllabusJsonError("Choose a valid syllabus material.", 400);
  }

  try {
    const { data: syllabus, error: syllabusError } = await supabaseAdmin
      .from("syllabuses")
      .select("id")
      .eq("academic_year_id", access.context.academicYearId)
      .eq("level_id", access.context.levelId)
      .eq("status", "published")
      .maybeSingle();
    if (syllabusError) throw syllabusError;
    if (!syllabus) return syllabusJsonError("Syllabus material was not found.", 404);

    const { data: material, error: materialError } = await supabaseAdmin
      .from("syllabus_unit_materials")
      .select("id, material_type, storage_path, unit:syllabus_units!inner(syllabus_id)")
      .eq("id", requestedMaterialId)
      .eq("unit.syllabus_id", syllabus.id)
      .maybeSingle();
    if (materialError) throw materialError;
    if (!material) return syllabusJsonError("Syllabus material was not found.", 404);
    if (material.material_type !== "file" || !material.storage_path) {
      return syllabusJsonError("This syllabus material is an external link.", 400);
    }

    const { data, error } = await supabaseAdmin.storage
      .from(SYLLABUS_STORAGE_BUCKET)
      .createSignedUrl(
        String(material.storage_path),
        SYLLABUS_SIGNED_URL_SECONDS
      );
    if (error || !data?.signedUrl) throw error || new Error("Signed URL missing.");

    return NextResponse.json({
      signedUrl: data.signedUrl,
      expiresIn: SYLLABUS_SIGNED_URL_SECONDS,
    });
  } catch (error) {
    logSyllabusFailure("teacher-material-open", error);
    return syllabusJsonError("Unable to open the syllabus material.", 500);
  }
}
