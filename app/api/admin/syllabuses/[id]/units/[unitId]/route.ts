import { NextRequest, NextResponse } from "next/server";

import {
  loadSyllabusById,
  logSyllabusFailure,
  requireSyllabusAdmin,
  syllabusJsonError,
  SYLLABUS_STORAGE_BUCKET,
} from "../../../../../../../lib/syllabusServer";
import {
  isSyllabusUuid,
  validateSyllabusUnitInput,
} from "../../../../../../../lib/syllabusValidation";
import { supabaseAdmin } from "../../../../../../../lib/supabaseAdmin";

type RouteContext = { params: Promise<{ id: string; unitId: string }> };

async function ids(context: RouteContext) {
  const { id, unitId } = await context.params;
  return {
    syllabusId: String(id || "").trim(),
    unitId: String(unitId || "").trim(),
  };
}

function validIds(value: { syllabusId: string; unitId: string }) {
  return isSyllabusUuid(value.syllabusId) && isSyllabusUuid(value.unitId);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  const routeIds = await ids(context);
  if (!validIds(routeIds)) return syllabusJsonError("Choose a valid syllabus unit.", 400);

  try {
    const validation = validateSyllabusUnitInput(
      await request.json().catch(() => null)
    );
    if (validation.error || !validation.value) {
      return syllabusJsonError(validation.error || "Invalid syllabus unit.", 422);
    }

    const { data, error } = await supabaseAdmin
      .from("syllabus_units")
      .update(validation.value)
      .eq("id", routeIds.unitId)
      .eq("syllabus_id", routeIds.syllabusId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return syllabusJsonError("Syllabus unit was not found.", 404);

    await supabaseAdmin
      .from("syllabuses")
      .update({ updated_by: admin.userId })
      .eq("id", routeIds.syllabusId);
    return NextResponse.json({
      syllabus: await loadSyllabusById(routeIds.syllabusId),
    });
  } catch (error) {
    logSyllabusFailure("admin-unit-update", error);
    return syllabusJsonError("Unable to update the syllabus unit.", 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  const routeIds = await ids(context);
  if (!validIds(routeIds)) return syllabusJsonError("Choose a valid syllabus unit.", 400);

  try {
    const { data: materials, error: materialError } = await supabaseAdmin
      .from("syllabus_unit_materials")
      .select("storage_path")
      .eq("unit_id", routeIds.unitId)
      .not("storage_path", "is", null);
    if (materialError) throw materialError;

    const { data, error } = await supabaseAdmin
      .from("syllabus_units")
      .delete()
      .eq("id", routeIds.unitId)
      .eq("syllabus_id", routeIds.syllabusId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return syllabusJsonError("Syllabus unit was not found.", 404);

    await supabaseAdmin
      .from("syllabuses")
      .update({ updated_by: admin.userId })
      .eq("id", routeIds.syllabusId);

    let storageCleanupFailed = false;
    const storagePaths = (materials || [])
      .map((row) => String(row.storage_path || "").trim())
      .filter(Boolean);
    if (storagePaths.length) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(SYLLABUS_STORAGE_BUCKET)
        .remove(storagePaths);
      if (storageError) {
        storageCleanupFailed = true;
        logSyllabusFailure("admin-unit-delete-storage-cleanup", storageError);
      }
    }

    return NextResponse.json({
      syllabus: await loadSyllabusById(routeIds.syllabusId),
      storageCleanupFailed,
      ...(storageCleanupFailed
        ? {
            message:
              "The unit was deleted, but one or more private files require manual storage cleanup.",
          }
        : {}),
    });
  } catch (error) {
    logSyllabusFailure("admin-unit-delete", error);
    return syllabusJsonError("Unable to delete the syllabus unit.", 500);
  }
}
