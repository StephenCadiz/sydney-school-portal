import { NextRequest, NextResponse } from "next/server";

import {
  CoursePlanningError,
  getCoursePlanningContext,
} from "../../../../../../../lib/coursePlanningServer";
import {
  loadCoursePlanExamScores,
  saveCoursePlanExamScore,
} from "../../../../../../../lib/coursePlanExamScoresServer";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getCoursePlanningContext(request, id);
    return NextResponse.json(
      await loadCoursePlanExamScores(context, request.nextUrl.searchParams.get("student_id")),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof CoursePlanningError) return fail(error.message, error.status);
    console.error("Course plan exam scores load failed:", error);
    return fail("Unable to load exam scores.", 500);
  }
}

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getCoursePlanningContext(request, id);
    return NextResponse.json(
      await saveCoursePlanExamScore(context, await request.json().catch(() => null)),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof CoursePlanningError) return fail(error.message, error.status);
    console.error("Course plan exam score save failed:", error);
    return fail("Unable to save exam score.", 500);
  }
}
