import { NextRequest, NextResponse } from "next/server";

import {
  CoursePlanningError,
  deleteCoursePlanResource,
  getCoursePlanningContext,
  loadCoursePlanningSnapshot,
} from "../../../../../../../../lib/coursePlanningServer";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function DELETE(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string; resourceId: string }> }
) {
  try {
    const { id, resourceId } = await routeContext.params;
    const context = await getCoursePlanningContext(request, id);
    await deleteCoursePlanResource(context, resourceId);
    return NextResponse.json({
      message: "Course resource removed.",
      ...(await loadCoursePlanningSnapshot(context)),
    });
  } catch (error) {
    if (error instanceof CoursePlanningError) return fail(error.message, error.status);
    console.error("Course Planning resource delete failed:", error);
    return fail("Unable to remove the course resource.", 500);
  }
}
