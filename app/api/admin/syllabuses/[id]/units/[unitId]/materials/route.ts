import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  loadSyllabusById,
  logSyllabusFailure,
  requireSyllabusAdmin,
  syllabusJsonError,
  SYLLABUS_STORAGE_BUCKET,
} from "../../../../../../../../lib/syllabusServer";
import {
  isSyllabusUuid,
  validateSyllabusMaterialDetails,
  validateSyllabusMaterialType,
  validateSyllabusOrderedIds,
} from "../../../../../../../../lib/syllabusValidation";
import {
  sanitizeTeacherResourceFilename,
  validateTeacherResourceExternalUrl,
  validateTeacherResourceFile,
} from "../../../../../../../../lib/teacherResourceValidation";
import { supabaseAdmin } from "../../../../../../../../lib/supabaseAdmin";

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

async function unitBelongsToSyllabus(unitId: string, syllabusId: string) {
  const { data, error } = await supabaseAdmin
    .from("syllabus_units")
    .select("id")
    .eq("id", unitId)
    .eq("syllabus_id", syllabusId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  const routeIds = await ids(context);
  if (!validIds(routeIds)) return syllabusJsonError("Choose a valid syllabus unit.", 400);

  let uploadedPath = "";
  try {
    if (!(await unitBelongsToSyllabus(routeIds.unitId, routeIds.syllabusId))) {
      return syllabusJsonError("Syllabus unit was not found.", 404);
    }

    const formData = await request.formData();
    const allowed = new Set([
      "materialType",
      "label",
      "description",
      "externalUrl",
      "file",
    ]);
    if (Array.from(formData.keys()).some((key) => !allowed.has(key))) {
      return syllabusJsonError("The request contains unsupported material fields.", 400);
    }

    const typeValidation = validateSyllabusMaterialType(
      formData.get("materialType")
    );
    const detailsValidation = validateSyllabusMaterialDetails({
      label: formData.get("label"),
      description: formData.get("description"),
      external_url: formData.get("externalUrl"),
    });
    const validationError = typeValidation.error || detailsValidation.error;
    if (validationError || !typeValidation.value || !detailsValidation.value) {
      return syllabusJsonError(validationError || "Invalid syllabus material.", 422);
    }

    const { data: lastMaterial, error: orderError } = await supabaseAdmin
      .from("syllabus_unit_materials")
      .select("sort_order")
      .eq("unit_id", routeIds.unitId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orderError) throw orderError;
    const sortOrder = Number(lastMaterial?.sort_order || 0) + 1;

    if (typeValidation.value === "link") {
      const file = formData.get("file");
      if (file instanceof File && file.size > 0) {
        return syllabusJsonError("Choose either a file or an external link, not both.", 422);
      }
      const linkValidation = validateTeacherResourceExternalUrl(
        detailsValidation.value.externalUrl
      );
      if (linkValidation.error) {
        return syllabusJsonError(linkValidation.error, 422);
      }
      const { error } = await supabaseAdmin
        .from("syllabus_unit_materials")
        .insert({
          unit_id: routeIds.unitId,
          material_type: "link",
          label: detailsValidation.value.label,
          description: detailsValidation.value.description,
          external_url: linkValidation.value,
          storage_path: null,
          original_filename: null,
          mime_type: null,
          file_size: null,
          sort_order: sortOrder,
        });
      if (error) throw error;
    } else {
      if (detailsValidation.value.externalUrl) {
        return syllabusJsonError("Choose either a file or an external link, not both.", 422);
      }
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return syllabusJsonError("Please choose a file to upload.", 422);
      }
      const fileValidation = validateTeacherResourceFile({
        name: file.name,
        type: file.type,
        size: file.size,
      });
      if (fileValidation.error) {
        return syllabusJsonError(fileValidation.error, 422);
      }

      uploadedPath = `syllabuses/${routeIds.syllabusId}/${routeIds.unitId}/${randomUUID()}-${sanitizeTeacherResourceFilename(file.name)}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(SYLLABUS_STORAGE_BUCKET)
        .upload(uploadedPath, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { error } = await supabaseAdmin
        .from("syllabus_unit_materials")
        .insert({
          unit_id: routeIds.unitId,
          material_type: "file",
          label: detailsValidation.value.label,
          description: detailsValidation.value.description,
          external_url: null,
          storage_path: uploadedPath,
          original_filename: file.name,
          mime_type: file.type,
          file_size: file.size,
          sort_order: sortOrder,
        });
      if (error) {
        const { error: cleanupError } = await supabaseAdmin.storage
          .from(SYLLABUS_STORAGE_BUCKET)
          .remove([uploadedPath]);
        if (cleanupError) {
          logSyllabusFailure("admin-material-orphan-cleanup", cleanupError);
        }
        uploadedPath = "";
        throw error;
      }
      uploadedPath = "";
    }

    await supabaseAdmin
      .from("syllabuses")
      .update({ updated_by: admin.userId })
      .eq("id", routeIds.syllabusId);
    return NextResponse.json(
      { syllabus: await loadSyllabusById(routeIds.syllabusId) },
      { status: 201 }
    );
  } catch (error) {
    if (uploadedPath) {
      const { error: cleanupError } = await supabaseAdmin.storage
        .from(SYLLABUS_STORAGE_BUCKET)
        .remove([uploadedPath]);
      if (cleanupError) {
        logSyllabusFailure("admin-material-unexpected-cleanup", cleanupError);
      }
    }
    logSyllabusFailure("admin-material-create", error);
    return syllabusJsonError("Unable to add the syllabus material.", 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  const routeIds = await ids(context);
  if (!validIds(routeIds)) return syllabusJsonError("Choose a valid syllabus unit.", 400);

  try {
    if (!(await unitBelongsToSyllabus(routeIds.unitId, routeIds.syllabusId))) {
      return syllabusJsonError("Syllabus unit was not found.", 404);
    }
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "material_ids")
    ) {
      return syllabusJsonError("The request contains unsupported material fields.", 400);
    }
    const orderedIds = validateSyllabusOrderedIds(
      (body as Record<string, unknown>).material_ids,
      "material"
    );
    if (orderedIds.error || !orderedIds.value) {
      return syllabusJsonError(orderedIds.error || "Invalid material order.", 422);
    }

    const { error } = await supabaseAdmin.rpc("reorder_syllabus_materials", {
      p_actor_id: admin.userId,
      p_syllabus_id: routeIds.syllabusId,
      p_unit_id: routeIds.unitId,
      p_material_ids: orderedIds.value,
    });
    if (error) {
      if (error.code === "42501") {
        return syllabusJsonError("Admin access required.", 403);
      }
      if (error.code === "P0002") {
        return syllabusJsonError("Syllabus unit was not found.", 404);
      }
      if (error.code === "22023") return syllabusJsonError(error.message, 422);
      throw error;
    }
    return NextResponse.json({
      syllabus: await loadSyllabusById(routeIds.syllabusId),
    });
  } catch (error) {
    logSyllabusFailure("admin-material-reorder", error);
    return syllabusJsonError("Unable to reorder syllabus materials.", 500);
  }
}
