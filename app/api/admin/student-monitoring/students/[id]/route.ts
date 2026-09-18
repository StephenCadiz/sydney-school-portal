import { NextRequest, NextResponse } from "next/server";
import { authenticateMonitoringActor, loadMonitoringEnrolments } from "../../../../../../lib/studentMonitoringServer";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMonitoringActor(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.actor?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const { id } = await context.params;
    const studentType = request.nextUrl.searchParams.get("student_type") === "young_learner" ? "young_learner" : "profile";
    return NextResponse.json({ enrolments: await loadMonitoringEnrolments(studentType, id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load active enrolments." }, { status: 500 });
  }
}
