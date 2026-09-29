import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  authorizeTeacherHomeworkClass,
  TeacherHomeworkError,
} from "../../../../../../lib/teacherHomeworkServer";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";
import {
  hasDangerousResourceFilename,
  sanitizeTeacherResourceFilename,
  validateTeacherResourceDescription,
  validateTeacherResourceTitle,
} from "../../../../../../lib/teacherResourceValidation";

const bucket = "class-resources";
const columns =
  "id, title, description, resource_scope, level_id, class_id, created_by, storage_path, original_filename, mime_type, file_size, created_at, updated_at";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function formatError(error: unknown) {
  if (!error || typeof error !== "object") return String(error || "Unknown error.");
  const value = error as { message?: string; details?: string; hint?: string; code?: string };
  return [value.message, value.details, value.hint, value.code]
    .filter(Boolean)
    .join(" | ") || "Unknown error.";
}

function bearerToken(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function contextFor(request: NextRequest, classId: string) {
  if (!bearerToken(request)) throw new TeacherHomeworkError("Authentication required.", 401);
  return authorizeTeacherHomeworkClass(request, classId);
}

async function verifyCambridgeClass(classId: string) {
  const { data, error } = await supabaseAdmin
    .from("classes")
    .select("id, level_id, is_cambridge")
    .eq("id", classId)
    .maybeSingle();
  if (error) throw new Error(formatError(error));
  if (!data || data.is_cambridge !== true) return null;
  return data;
}

function handleAuthError(error: unknown) {
  if (error instanceof TeacherHomeworkError) return fail(error.message, error.status);
  console.error("Class document authorization failed:", formatError(error));
  return fail("Unable to verify class access.", 500);
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  const { id: classId } = await routeContext.params;
  try {
    const context = await contextFor(request, classId);
    const classroom = await verifyCambridgeClass(classId);
    if (!classroom) return fail("Class-scoped documents are only available for Cambridge classes.", 404);

    const { data, error } = await supabaseAdmin
      .from("teacher_resources")
      .select(columns)
      .eq("resource_scope", "cambridge_class")
      .eq("class_id", classId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Class document load failed:", formatError(error));
      return fail("Unable to load class documents.", 500);
    }

    return NextResponse.json({ documents: data || [], role: context.role }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  let uploadedPath = "";
  const { id: classId } = await routeContext.params;
  try {
    const context = await contextFor(request, classId);
    const classroom = await verifyCambridgeClass(classId);
    if (!classroom) return fail("Class-scoped documents are only available for Cambridge classes.", 400);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size <= 0) return fail("Please choose a document to upload.", 400);
    if (hasDangerousResourceFilename(file.name)) return fail("Please choose a file with a safe filename.", 400);

    const safeFilename = sanitizeTeacherResourceFilename(file.name);
    uploadedPath = `classes/${classId}/${context.actorId}/${randomUUID()}-${safeFilename}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(uploadedPath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      console.error("Class document upload failed:", formatError(uploadError));
      return fail("Unable to upload the document.", 500);
    }

    const title = validateTeacherResourceTitle(formData.get("title") || file.name);
    const description = validateTeacherResourceDescription(
      formData.get("description") || "Uploaded class document."
    );
    if (title.error || description.error) {
      await supabaseAdmin.storage.from(bucket).remove([uploadedPath]);
      return fail(title.error || description.error, 400);
    }

    const { data, error } = await supabaseAdmin
      .from("teacher_resources")
      .insert({
        title: title.value,
        description: description.value,
        resource_scope: "cambridge_class",
        level_id: classroom.level_id,
        class_id: classId,
        created_by: context.actorId,
        external_url: null,
        storage_path: uploadedPath,
        original_filename: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
      })
      .select(columns)
      .single();
    if (error || !data) {
      console.error("Class document metadata insert failed:", formatError(error));
      await supabaseAdmin.storage.from(bucket).remove([uploadedPath]);
      return fail("Unable to save the uploaded document.", 500);
    }

    return NextResponse.json({ document: data }, { status: 201 });
  } catch (error) {
    if (uploadedPath) await supabaseAdmin.storage.from(bucket).remove([uploadedPath]);
    return handleAuthError(error);
  }
}
