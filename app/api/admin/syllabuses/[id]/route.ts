import { NextRequest, NextResponse } from "next/server";

import {
  loadSyllabusById,
  logSyllabusFailure,
  requireSyllabusAdmin,
  syllabusJsonError,
  SYLLABUS_STORAGE_BUCKET,
} from "../../../../../lib/syllabusServer";
import {
  isSyllabusUuid,
  validateSyllabusTitle,
} from "../../../../../lib/syllabusValidation";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

type RouteContext = { params: Promise<{ id: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function routeId(context: RouteContext) {
  const { id } = await context.params;
  return String(id || "").trim();
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  const id = await routeId(context);
  if (!isSyllabusUuid(id)) return syllabusJsonError("Choose a valid syllabus.", 400);

  try {
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) return syllabusJsonError("Invalid syllabus request.", 400);
    const action = String(body.action || "").trim();

    if (action === "update_details") {
      if (Object.keys(body).some((key) => !["action", "title"].includes(key))) {
        return syllabusJsonError("The request contains unsupported syllabus fields.", 400);
      }
      const title = validateSyllabusTitle(body.title);
      if (title.error) return syllabusJsonError(title.error, 422);

      const { data, error } = await supabaseAdmin
        .from("syllabuses")
        .update({ title: title.value, updated_by: admin.userId })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return syllabusJsonError("Syllabus was not found.", 404);
    } else if (action === "publish") {
      if (Object.keys(body).some((key) => key !== "action")) {
        return syllabusJsonError("The request contains unsupported syllabus fields.", 400);
      }
      const [syllabusResult, unitResult] = await Promise.all([
        supabaseAdmin
          .from("syllabuses")
          .select("id")
          .eq("id", id)
          .maybeSingle(),
        supabaseAdmin
          .from("syllabus_units")
          .select("id", { count: "exact", head: true })
          .eq("syllabus_id", id),
      ]);
      if (syllabusResult.error) throw syllabusResult.error;
      if (unitResult.error) throw unitResult.error;
      if (!syllabusResult.data) {
        return syllabusJsonError("Syllabus was not found.", 404);
      }
      const count = unitResult.count;
      if (!count) {
        return syllabusJsonError("Add at least one unit before publishing.", 409);
      }
      const { data, error } = await supabaseAdmin
        .from("syllabuses")
        .update({
          status: "published",
          published_by: admin.userId,
          published_at: new Date().toISOString(),
          updated_by: admin.userId,
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return syllabusJsonError("Syllabus was not found.", 404);
    } else if (action === "unpublish") {
      if (Object.keys(body).some((key) => key !== "action")) {
        return syllabusJsonError("The request contains unsupported syllabus fields.", 400);
      }
      const { data, error } = await supabaseAdmin
        .from("syllabuses")
        .update({
          status: "draft",
          published_by: null,
          published_at: null,
          updated_by: admin.userId,
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return syllabusJsonError("Syllabus was not found.", 404);
    } else {
      return syllabusJsonError("Unsupported syllabus action.", 400);
    }

    return NextResponse.json({ syllabus: await loadSyllabusById(id) });
  } catch (error) {
    logSyllabusFailure("admin-update", error);
    return syllabusJsonError("Unable to update the syllabus.", 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  const id = await routeId(context);
  if (!isSyllabusUuid(id)) return syllabusJsonError("Choose a valid syllabus.", 400);

  try {
    const { data: paths, error: pathError } = await supabaseAdmin
      .from("syllabus_unit_materials")
      .select("storage_path, unit:syllabus_units!inner(syllabus_id)")
      .eq("unit.syllabus_id", id)
      .not("storage_path", "is", null);
    if (pathError) throw pathError;

    const { data, error } = await supabaseAdmin
      .from("syllabuses")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return syllabusJsonError("Syllabus was not found.", 404);

    const storagePaths = (paths || [])
      .map((row) => String(row.storage_path || "").trim())
      .filter(Boolean);
    if (storagePaths.length) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(SYLLABUS_STORAGE_BUCKET)
        .remove(storagePaths);
      if (storageError) {
        logSyllabusFailure("admin-delete-storage-cleanup", storageError);
        return NextResponse.json({
          deleted: true,
          storageCleanupFailed: true,
          message:
            "The syllabus was deleted, but one or more private files require manual storage cleanup.",
        });
      }
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    logSyllabusFailure("admin-delete", error);
    return syllabusJsonError("Unable to delete the syllabus.", 500);
  }
}
