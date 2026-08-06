import { NextRequest, NextResponse } from "next/server";

import { authenticateStudentHomework } from "../../../../lib/studentHomeworkServer";
import { loadStudentPublishedCoursePlans } from "../../../../lib/studentCoursePlanningServer";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateStudentHomework(request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const plans = await loadStudentPublishedCoursePlans(auth.studentId);
    const summary = request.nextUrl.searchParams.get("summary") === "1";
    if (summary) {
      return NextResponse.json(
        { available: plans.length > 0 },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { available: plans.length > 0, plans },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Student course plan load failed:", error);
    return NextResponse.json(
      { error: "Unable to load your Course Plan." },
      { status: 500 }
    );
  }
}
