import { NextRequest, NextResponse } from "next/server";

import {
  loadSyllabusById,
  logSyllabusFailure,
  requireSyllabusAdmin,
  syllabusJsonError,
  SYLLABUS_STORAGE_BUCKET,
} from "../../../../../../../../../lib/syllabusServer";
import {
  isSyllabusUuid,
  validateSyllabusMaterialDetails,
} from "../../../../../../../../../lib/syllabusValidation";
import { validateTeacherResourceExternalUrl } from "../../../../../../../../../lib/teacherResourceValidation";
import { supabaseAdmin } from "../../../../../../../../../lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{ id: string; unitId: string; materialId: string }>;
};

async function ids(context: RouteContext) {
  const { id, unitId, materialId } = await context.params;
  return {
    syllabusId: String(id || "").trim(),
    unitId: String(unitId || "").trim(),
    materialId: String(materialId || "").trim(),
  };
}

function validIds(value: {
  syllabusId: string;
  unitId: string;
  materialId: string;
}) {
  return (
    isSyllabusUuid(value.syllabusId) &&
    isSyllabusUuid(value.unitId) &&
    isSyllabusUuid(value.materialId)
  );
}

async function loadMaterial(routeIds: Awaited<ReturnType<typeof ids>>) {
  const { data, error } = await supabaseAdmin
    .from("syllabus_unit_materials")
    .select("id, material_type, storage_path, unit:syllabus_units!inner(syllabus_id)")
    .eq("id", routeIds.materialId)
    .eq("unit_id", routeIds.unitId)
    .eq("unit.syllabus_id", routeIds.syllabusId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  const routeIds = await ids(context);
  if (!validIds(routeIds)) return syllabusJsonError("Choose a valid syllabus material.", 400);

  try {
    const material = await loadMaterial(routeIds);
    if (!material) return syllabusJsonError("Syllabus material was not found.", 404);

    const validation = validateSyllabusMaterialDetails(
      await request.json().catch(() => null)
    );
    if (validation.error || !validation.value) {
      return syllabusJsonError(validation.error || "Invalid syllabus material.", 422);
    }

    let externalUrl: string | null = null;
    if (material.material_type === "link") {
      const urlValidation = validateTeacherResourceExternalUrl(
        validation.value.externalUrl
      );
      if (urlValidation.error) return syllabusJsonError(urlValidation.error, 422);
      externalUrl = urlValidation.value;
    } else if (validation.value.externalUrl) {
      return syllabusJsonError("Uploaded files cannot have an external link.", 422);
    }

    const { data, error } = await supabaseAdmin
      .from("syllabus_unit_materials")
      .update({
        label: validation.value.label,
        description: validation.value.description,
        external_url: externalUrl,
      })
      .eq("id", routeIds.materialId)
      .eq("unit_id", routeIds.unitId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return syllabusJsonError("Syllabus material was not found.", 404);

    await supabaseAdmin
      .from("syllabuses")
      .update({ updated_by: admin.userId })
      .eq("id", routeIds.syllabusId);
    return NextResponse.json({
      syllabus: await loadSyllabusById(routeIds.syllabusId),
    });
  } catch (error) {
    logSyllabusFailure("admin-material-update", error);
    return syllabusJsonError("Unable to update the syllabus material.", 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  const routeIds = await ids(context);
  if (!validIds(routeIds)) return syllabusJsonError("Choose a valid syllabus material.", 400);

  try {
    const material = await loadMaterial(routeIds);
    if (!material) return syllabusJsonError("Syllabus material was not found.", 404);

    const { data, error } = await supabaseAdmin
      .from("syllabus_unit_materials")
      .delete()
      .eq("id", routeIds.materialId)
      .eq("unit_id", routeIds.unitId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return syllabusJsonError("Syllabus material was not found.", 404);

    await supabaseAdmin
      .from("syllabuses")
      .update({ updated_by: admin.userId })
      .eq("id", routeIds.syllabusId);

    let storageCleanupFailed = false;
    if (material.storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(SYLLABUS_STORAGE_BUCKET)
        .remove([String(material.storage_path)]);
      if (storageError) {
        storageCleanupFailed = true;
        logSyllabusFailure("admin-material-delete-storage-cleanup", storageError);
      }
    }

    return NextResponse.json({
      syllabus: await loadSyllabusById(routeIds.syllabusId),
      storageCleanupFailed,
      ...(storageCleanupFailed
        ? {
            message:
              "The material record was deleted, but its private file requires manual storage cleanup.",
          }
        : {}),
    });
  } catch (error) {
    logSyllabusFailure("admin-material-delete", error);
    return syllabusJsonError("Unable to delete the syllabus material.", 500);
  }
}
