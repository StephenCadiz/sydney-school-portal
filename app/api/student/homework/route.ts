import { NextRequest, NextResponse } from "next/server";

import {
  authenticateStudentHomework,
  loadStudentHomework,
  resolveStudentHomeworkContext,
} from "../../../../lib/studentHomeworkServer";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateStudentHomework(request);
  if (auth.error) return jsonError(auth.error, auth.status);

  const resolved = await resolveStudentHomeworkContext(auth.studentId);
  if (resolved.error || !resolved.context) {
    if (resolved.status === 404 && resolved.error === "No class enrolment was found.") {
      return NextResponse.json({
        class: null,
        homework: [],
        unread_count: 0,
        message: resolved.error,
      });
    }
    return jsonError(resolved.error || "Unable to load homework.", resolved.status);
  }

  try {
    const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";
    return NextResponse.json(
      await loadStudentHomework(resolved.context, !summaryOnly)
    );
  } catch {
    console.error("Student homework load failed:", {
      stage: "homework",
      actorId: auth.studentId,
      classId: resolved.context.classId,
    });
    return jsonError("Unable to load homework.", 500);
  }
}
