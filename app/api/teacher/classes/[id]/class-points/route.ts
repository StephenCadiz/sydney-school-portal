import { NextRequest, NextResponse } from "next/server";

import {
  calculateClassPointsDelta,
  ClassPointsError,
  getClassPointsContext,
  loadClassPointsSnapshot,
  parseClassPointsEntry,
} from "../../../../../../lib/classPointsServer";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logFailure(stage: string, error: unknown) {
  console.error("Class Points request failed:", { stage, error });
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getClassPointsContext(request, id);
    const classPoints = await loadClassPointsSnapshot(context);

    return NextResponse.json(classPoints, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ClassPointsError) {
      return fail(error.message, error.status);
    }

    logFailure("load", error);
    return fail("Unable to load Class Points.", 500);
  }
}

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getClassPointsContext(request, id);
    const body = await request.json().catch(() => null);
    const entry = parseClassPointsEntry(body);

    const { data: learner, error: learnerError } = await supabaseAdmin
      .from("young_learners")
      .select("id")
      .eq("id", entry.youngLearnerId)
      .eq("class_id", context.classId)
      .eq("active", true)
      .maybeSingle();
    if (learnerError) {
      logFailure("learner-verification", learnerError);
      return fail("Unable to verify this learner.", 500);
    }
    if (!learner) {
      return fail("This learner is not enrolled in the selected class.", 422);
    }

    const pointsDelta = calculateClassPointsDelta(entry);
    const { data: savedEntry, error: insertError } = await supabaseAdmin
      .from("young_learner_class_point_entries")
      .insert({
        class_id: context.classId,
        young_learner_id: entry.youngLearnerId,
        teacher_id: context.actorId,
        academic_year: context.academicYear,
        homework_done: entry.homeworkDone,
        speaking_english: entry.speakingEnglish,
        good_behaviour: entry.goodBehaviour,
        exam_mark: entry.examMark,
        points_delta: pointsDelta,
      })
      .select(
        "id, young_learner_id, teacher_id, homework_done, speaking_english, good_behaviour, exam_mark, points_delta, created_at"
      )
      .maybeSingle();
    if (insertError || !savedEntry) {
      logFailure("entry-insert", insertError);
      return fail("Unable to save this points entry.", 500);
    }

    const classPoints = await loadClassPointsSnapshot(context);
    const updatedLearner = classPoints.learners.find(
      (learner) => learner.id === entry.youngLearnerId
    );
    const updatedEntry = updatedLearner?.history.find(
      (historyEntry) => historyEntry.id === savedEntry.id
    );

    return NextResponse.json({
      entry: updatedEntry || savedEntry,
      learner_total: updatedLearner?.points_total ?? null,
      class_points: classPoints,
    });
  } catch (error) {
    if (error instanceof ClassPointsError) {
      return fail(error.message, error.status);
    }

    logFailure("save", error);
    return fail("Unable to save this points entry.", 500);
  }
}
