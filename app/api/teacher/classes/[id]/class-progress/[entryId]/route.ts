import { NextRequest, NextResponse } from "next/server";

import {
  ClassProgressError,
  getClassProgressContext,
  loadClassProgressSnapshot,
  parseClassProgressInput,
  UUID_PATTERN,
  verifyScheduledLesson,
} from "../../../../../../../lib/classProgressServer";
import { supabaseAdmin } from "../../../../../../../lib/supabaseAdmin";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const { id, entryId } = await routeContext.params;
    if (!UUID_PATTERN.test(entryId)) {
      return fail("Class Progress entry was not found.", 404);
    }
    const context = await getClassProgressContext(request, id);
    const body = await request.json().catch(() => null);
    const entry = parseClassProgressInput(body, !context.isCambridge);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("class_progress_entries")
      .select("id, lesson_date, scheduled_start_time, scheduled_end_time")
      .eq("id", entryId)
      .eq("class_id", context.classId)
      .maybeSingle();
    if (existingError) {
      console.error("Class Progress entry lookup failed:", existingError);
      return fail("Unable to load Class Progress.", 500);
    }
    if (!existing) return fail("Class Progress entry was not found.", 404);
    verifyScheduledLesson(
      context,
      String(existing.lesson_date),
      String(existing.scheduled_start_time),
      String(existing.scheduled_end_time)
    );

    const { data: savedEntry, error: updateError } = await supabaseAdmin
      .from("class_progress_entries")
      .update({
        last_edited_by: context.actorId,
        pupils_book_page: entry.pupilsBookPage,
        activity_book_page: entry.activityBookPage,
        homework: entry.homework,
        extra_activities: entry.extraActivities,
      })
      .eq("id", entryId)
      .eq("class_id", context.classId)
      .select("id, lesson_date, scheduled_start_time")
      .maybeSingle();
    if (updateError || !savedEntry) {
      console.error("Class Progress entry update failed:", updateError);
      return fail("Unable to update Class Progress.", 500);
    }

    return NextResponse.json({
      entry: savedEntry,
      class_progress: await loadClassProgressSnapshot(context),
    });
  } catch (error) {
    if (error instanceof ClassProgressError) {
      return fail(error.message, error.status);
    }
    console.error("Class Progress update failed:", error);
    return fail("Unable to update Class Progress.", 500);
  }
}
