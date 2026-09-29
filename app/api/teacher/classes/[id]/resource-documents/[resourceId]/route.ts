import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  authorizeTeacherHomeworkClass,
  TeacherHomeworkError,
} from "../../../../../../../lib/teacherHomeworkServer";
import { supabaseAdmin } from "../../../../../../../lib/supabaseAdmin";
import {
  hasDangerousResourceFilename,
  sanitizeTeacherResourceFilename,
  validateTeacherResourceDescription,
  validateTeacherResourceTitle,
} from "../../../../../../../lib/teacherResourceValidation";

const bucket = "class-resources";
const columns =
  "id, title, description, resource_scope, level_id, class_id, created_by, storage_path, original_filename, mime_type, file_size, created_at, updated_at";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function formatError(error: unknown) {
  if (!error || typeof error !== "object") return String(error || "Unknown error.");
  const value = error as { message?: string; details?: string; hint?: string; code?: string };
  return [value.message, value.details, value.hint, value.code].filter(Boolean).join(" | ") || "Unknown error.";
}

async function loadContext(request: NextRequest, classId: string, resourceId: string) {
  const context = await authorizeTeacherHomeworkClass(request, classId);
  const { data: resource, error } = await supabaseAdmin
    .from("teacher_resources")
    .select(columns)
    .eq("id", resourceId)
    .eq("class_id", classId)
    .eq("resource_scope", "cambridge_class")
    .maybeSingle();
  if (error) throw new Error(formatError(error));
  if (!resource) return { context, resource: null };
  if (context.role === "teacher" && String(resource.created_by || "") !== context.actorId) {
    throw new TeacherHomeworkError("You can only manage documents you uploaded.", 403);
  }
  return { context, resource };
}

function authError(error: unknown) {
  if (error instanceof TeacherHomeworkError) return fail(error.message, error.status);
  console.error("Class document management failed:", formatError(error));
  return fail("Unable to manage the class document.", 500);
}

export async function PATCH(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string; resourceId: string }> }
) {
  let replacementPath = "";
  const { id: classId, resourceId } = await routeContext.params;
  try {
    const { resource, context } = await loadContext(request, classId, resourceId);
    if (!resource) return fail("Document not found.", 404);
    const formData = await request.formData();
    const title = validateTeacherResourceTitle(formData.get("title") || resource.title);
    const description = validateTeacherResourceDescription(
      formData.get("description") || resource.description
    );
    if (title.error || description.error) return fail(title.error || description.error, 400);

    const file = formData.get("file");
    const updates: Record<string, unknown> = {
      title: title.value,
      description: description.value,
    };
    if (file instanceof File && file.size > 0) {
      if (hasDangerousResourceFilename(file.name)) return fail("Please choose a file with a safe filename.", 400);
      const safeFilename = sanitizeTeacherResourceFilename(file.name);
      replacementPath = `classes/${classId}/${context.actorId}/${randomUUID()}-${safeFilename}`;
      const upload = await supabaseAdmin.storage.from(bucket).upload(
        replacementPath,
        Buffer.from(await file.arrayBuffer()),
        { contentType: file.type || "application/octet-stream", upsert: false }
      );
      if (upload.error) return fail("Unable to upload the replacement document.", 500);
      updates.storage_path = replacementPath;
      updates.original_filename = file.name;
      updates.mime_type = file.type || "application/octet-stream";
      updates.file_size = file.size;
    }

    const { data, error } = await supabaseAdmin
      .from("teacher_resources")
      .update(updates)
      .eq("id", resourceId)
      .eq("class_id", classId)
      .select(columns)
      .maybeSingle();
    if (error || !data) {
      if (replacementPath) await supabaseAdmin.storage.from(bucket).remove([replacementPath]);
      return fail("Unable to update the class document.", 500);
    }
    if (replacementPath && resource.storage_path) {
      await supabaseAdmin.storage.from(bucket).remove([String(resource.storage_path)]);
    }
    return NextResponse.json({ document: data });
  } catch (error) {
    if (replacementPath) await supabaseAdmin.storage.from(bucket).remove([replacementPath]);
    return authError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string; resourceId: string }> }
) {
  const { id: classId, resourceId } = await routeContext.params;
  try {
    const { resource } = await loadContext(request, classId, resourceId);
    if (!resource) return fail("Document not found.", 404);
    const { error } = await supabaseAdmin
      .from("teacher_resources")
      .delete()
      .eq("id", resourceId)
      .eq("class_id", classId)
      .eq("resource_scope", "cambridge_class");
    if (error) return fail("Unable to delete the class document.", 500);
    if (resource.storage_path) await supabaseAdmin.storage.from(bucket).remove([String(resource.storage_path)]);
    return NextResponse.json({ deleted: true, id: resourceId });
  } catch (error) {
    return authError(error);
  }
}
