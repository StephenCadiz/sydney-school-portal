import { NextRequest, NextResponse } from "next/server";

import {
  authorizeTeacherHomeworkClass,
  TeacherHomeworkError,
} from "../../../../../../lib/teacherHomeworkServer";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logDeleteFailure(stage: string, error: unknown) {
  console.error("Teacher class announcement delete failed:", { stage, error });
}

export async function DELETE(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classId } = await routeContext.params;
    const context = await authorizeTeacherHomeworkClass(request, classId);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("Invalid announcement delete request.", 400);
    }

    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== "announcement_id")) {
      return fail("The request contains unsupported fields.", 400);
    }

    const announcementId = String(record.announcement_id || "").trim();
    if (!UUID_PATTERN.test(announcementId)) {
      return fail("Choose a valid announcement.", 400);
    }

    const { data: announcement, error: announcementError } = await supabaseAdmin
      .from("announcements")
      .select("id, classes_id, created_by, audience_type, target_level")
      .eq("id", announcementId)
      .maybeSingle();

    if (announcementError) {
      logDeleteFailure("announcement-load", announcementError);
      return fail("Unable to verify the announcement.", 500);
    }
    if (!announcement) {
      return fail("Announcement not found.", 404);
    }

    const audienceType = String(announcement.audience_type || "")
      .trim()
      .toLowerCase();
    const targetLevel = String(announcement.target_level || "").trim();
    const isClassSpecific =
      String(announcement.classes_id || "") === context.classId &&
      (audienceType === "" || audienceType === "class") &&
      !targetLevel;

    if (
      !isClassSpecific ||
      String(announcement.created_by || "") !== context.actorId
    ) {
      return fail("You are not allowed to delete this announcement.", 403);
    }

    const { error: readsError } = await supabaseAdmin
      .from("announcement_reads")
      .delete()
      .eq("announcement_id", announcementId);

    if (readsError) {
      logDeleteFailure("read-delete", readsError);
      return fail("Unable to delete the announcement.", 500);
    }

    const { data: deletedAnnouncement, error: deleteError } =
      await supabaseAdmin
        .from("announcements")
        .delete()
        .eq("id", announcementId)
        .eq("classes_id", context.classId)
        .eq("created_by", context.actorId)
        .select("id")
        .maybeSingle();

    if (deleteError) {
      logDeleteFailure("announcement-delete", deleteError);
      return fail("Unable to delete the announcement.", 500);
    }
    if (!deletedAnnouncement) {
      return fail("Announcement not found.", 404);
    }

    return NextResponse.json({ deleted: true, id: announcementId });
  } catch (error) {
    if (error instanceof TeacherHomeworkError) {
      return fail(error.message, error.status);
    }

    logDeleteFailure("unexpected", error);
    return fail("Unable to delete the announcement.", 500);
  }
}
