import { NextRequest, NextResponse } from "next/server";

import {
  authorizeTeacherHomeworkClass,
  TeacherHomeworkError,
} from "../../../../../../lib/teacherHomeworkServer";
import { loadTeacherCambridgeExamLibrary } from "../../../../../../lib/teacherCambridgeExamsServer";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await authorizeTeacherHomeworkClass(request, id);
    const library = await loadTeacherCambridgeExamLibrary(context);
    return NextResponse.json(library);
  } catch (error) {
    if (error instanceof TeacherHomeworkError) {
      return fail(error.message, error.status);
    }

    console.error("Teacher Cambridge Exam library load failed.");
    return fail("Unable to load Cambridge exams.", 500);
  }
}
