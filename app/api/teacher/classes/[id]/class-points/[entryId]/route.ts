import { NextRequest, NextResponse } from "next/server";

import {
  ClassPointsError,
  getClassPointsContext,
  loadClassPointsSnapshot,
} from "../../../../../../../lib/classPointsServer";
import { supabaseAdmin } from "../../../../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logFailure(stage: string, error: unknown) {
  console.error("Class Points deletion failed:", { stage, error });
}

export async function DELETE(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const { id, entryId } = await routeContext.params;
    if (!UUID_PATTERN.test(entryId)) {
      return fail("Unable to remove this points entry.", 404);
    }

    const context = await getClassPointsContext(request, id);
    const { data: entry, error: entryError } = await supabaseAdmin
      .from("young_learner_class_point_entries")
      .select("id, class_id, academic_year, deleted_at")
      .eq("id", entryId)
      .eq("class_id", context.classId)
      .maybeSingle();
    if (entryError) {
      logFailure("entry-verification", entryError);
      return fail("Unable to remove this points entry.", 500);
    }
    if (
      !entry ||
      entry.deleted_at != null ||
      String(entry.academic_year || "") !== context.academicYear
    ) {
      return fail("Unable to remove this points entry.", 404);
    }

    const { data: deletedEntry, error: deleteError } = await supabaseAdmin
      .from("young_learner_class_point_entries")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: context.actorId,
      })
      .eq("id", entryId)
      .eq("class_id", context.classId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (deleteError || !deletedEntry) {
      logFailure("soft-delete", deleteError);
      return fail("Unable to remove this points entry.", 500);
    }

    return NextResponse.json({
      removed: true,
      id: entryId,
      class_points: await loadClassPointsSnapshot(context),
    });
  } catch (error) {
    if (error instanceof ClassPointsError) {
      return fail(error.message, error.status);
    }

    logFailure("unexpected", error);
    return fail("Unable to remove this points entry.", 500);
  }
}
