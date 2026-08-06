import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  addCoursePlanUploadedResource,
  CoursePlanningError,
  getCoursePlanningContext,
  loadCoursePlanningSnapshot,
} from "../../../../../../../lib/coursePlanningServer";
import {
  sanitizeTeacherResourceFilename,
  validateTeacherResourceFile,
} from "../../../../../../../lib/teacherResourceValidation";
import { supabaseAdmin } from "../../../../../../../lib/supabaseAdmin";

const COURSE_PLAN_BUCKET = "teacher-resources";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function fileResourceType(mimeType: string): "pdf" | "audio" | null {
  if (mimeType === "application/pdf") return "pdf";
  return mimeType.startsWith("audio/") ? "audio" : null;
}

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  let storagePath = "";
  try {
    const { id } = await routeContext.params;
    const context = await getCoursePlanningContext(request, id);
    const formData = await request.formData();
    const dayId = String(formData.get("day_id") || "").trim();
    const file = formData.get("file");
    if (!(file instanceof File)) return fail("Choose a PDF or audio file to upload.", 422);
    const validation = validateTeacherResourceFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (validation.error) return fail(validation.error, 422);
    const resourceType = fileResourceType(file.type);
    if (!resourceType) return fail("Only PDF and audio files can be added to a course plan.", 422);

    const label = String(formData.get("label") || file.name).trim();
    if (!label || label.length > 160) {
      return fail("Resource label is required and must be 160 characters or fewer.", 422);
    }
    storagePath = `course-planning/${context.classId}/${randomUUID()}-${sanitizeTeacherResourceFilename(
      file.name
    )}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(COURSE_PLAN_BUCKET)
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      storagePath = "";
      return fail("Unable to upload the course resource.", 500);
    }
    await addCoursePlanUploadedResource({
      context,
      dayId,
      resourceType,
      label,
      storagePath,
      mimeType: file.type,
      originalFilename: file.name,
      fileSize: file.size,
    });
    storagePath = "";
    return NextResponse.json({
      message: "Course resource uploaded.",
      ...(await loadCoursePlanningSnapshot(context)),
    });
  } catch (error) {
    if (storagePath) {
      await supabaseAdmin.storage.from(COURSE_PLAN_BUCKET).remove([storagePath]);
    }
    if (error instanceof CoursePlanningError) return fail(error.message, error.status);
    console.error("Course Planning resource upload failed:", error);
    return fail("Unable to upload the course resource.", 500);
  }
}
