import { NextRequest, NextResponse } from "next/server";

import {
  authorizeTeacherHomeworkClass,
  loadTeacherClassHomework,
  TeacherHomeworkError,
} from "../../../../../../lib/teacherHomeworkServer";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const authorized = await authorizeTeacherHomeworkClass(request, id);
    return NextResponse.json(await loadTeacherClassHomework(authorized));
  } catch (error) {
    if (error instanceof TeacherHomeworkError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Teacher class homework load failed.");
    return NextResponse.json({ error: "Unable to load class homework." }, { status: 500 });
  }
}
