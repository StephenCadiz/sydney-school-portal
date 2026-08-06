import { NextRequest, NextResponse } from "next/server";

import {
  CoursePlanningError,
  ensureCoursePlan,
  getCoursePlanningContext,
  loadCoursePlanningSnapshot,
  saveCoursePlanningDay,
  setCoursePlanPublication,
} from "../../../../../../lib/coursePlanningServer";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logFailure(stage: string, error: unknown) {
  console.error("Course Planning request failed:", { stage, error });
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getCoursePlanningContext(request, id);
    return NextResponse.json(await loadCoursePlanningSnapshot(context), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CoursePlanningError) return fail(error.message, error.status);
    logFailure("load", error);
    return fail("Unable to load Course Planning.", 500);
  }
}

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getCoursePlanningContext(request, id);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || (body as { action?: unknown }).action !== "create") {
      return fail("Invalid Course Planning request.", 400);
    }
    await ensureCoursePlan(context, (body as { book_name?: unknown }).book_name);
    return NextResponse.json({
      message: "Course Planning draft created.",
      ...(await loadCoursePlanningSnapshot(context)),
    });
  } catch (error) {
    if (error instanceof CoursePlanningError) return fail(error.message, error.status);
    logFailure("create", error);
    return fail("Unable to create Course Planning.", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getCoursePlanningContext(request, id);
    const body = await request.json().catch(() => null) as { action?: unknown } | null;
    const action = body?.action;
    if (action === "save_day") {
      await saveCoursePlanningDay(context, body);
    } else if (action === "publish" || action === "unpublish") {
      await setCoursePlanPublication(context, action);
    } else {
      return fail("Invalid Course Planning request.", 400);
    }
    return NextResponse.json({
      message:
        action === "publish"
          ? "Course plan published."
          : action === "unpublish"
          ? "Course plan unpublished."
          : "Planned lesson saved.",
      ...(await loadCoursePlanningSnapshot(context)),
    });
  } catch (error) {
    if (error instanceof CoursePlanningError) return fail(error.message, error.status);
    logFailure("update", error);
    return fail("Unable to update Course Planning.", 500);
  }
}
