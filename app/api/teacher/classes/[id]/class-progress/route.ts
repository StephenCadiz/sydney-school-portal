import { NextRequest, NextResponse } from "next/server";

import {
  ClassProgressError,
  getClassProgressContext,
  loadClassProgressSnapshot,
  loadSameLevelProgress,
  parseClassProgressInput,
  verifyScheduledLesson,
} from "../../../../../../lib/classProgressServer";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logFailure(stage: string, error: unknown) {
  console.error("Class Progress request failed:", { stage, error });
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getClassProgressContext(request, id);
    const [snapshot, sameLevelProgress] = await Promise.all([
      loadClassProgressSnapshot(context),
      loadSameLevelProgress(context),
    ]);
    return NextResponse.json(
      { ...snapshot, same_level_progress: sameLevelProgress },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ClassProgressError) {
      return fail(error.message, error.status);
    }
    logFailure("load", error);
    return fail("Unable to load Class Progress.", 500);
  }
}

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getClassProgressContext(request, id);
    const body = await request.json().catch(() => null);
    const entry = parseClassProgressInput(body, !context.isCambridge, {
      allowSchedule: true,
    });
    verifyScheduledLesson(
      context,
      String(entry.lesson_date),
      String(entry.scheduled_start_time),
      String(entry.scheduled_end_time)
    );

    const { data: savedEntry, error: insertError } = await supabaseAdmin
      .from("class_progress_entries")
      .insert({
        class_id: context.classId,
        teacher_id: context.actorId,
        last_edited_by: context.actorId,
        lesson_date: entry.lesson_date,
        scheduled_start_time: entry.scheduled_start_time,
        scheduled_end_time: entry.scheduled_end_time,
        pupils_book_page: entry.pupilsBookPage,
        activity_book_page: entry.activityBookPage,
        homework: entry.homework,
        extra_activities: entry.extraActivities,
      })
      .select("id, lesson_date, scheduled_start_time")
      .maybeSingle();
    if (insertError?.code === "23505") {
      return fail(
        "Class Progress has already been completed for this scheduled lesson. Open it to edit.",
        409
      );
    }
    if (insertError || !savedEntry) {
      logFailure("entry-insert", insertError);
      return fail("Unable to save Class Progress.", 500);
    }

    return NextResponse.json({
      entry: savedEntry,
      class_progress: await loadClassProgressSnapshot(context),
    });
  } catch (error) {
    if (error instanceof ClassProgressError) {
      return fail(error.message, error.status);
    }
    logFailure("save", error);
    return fail("Unable to save Class Progress.", 500);
  }
}
