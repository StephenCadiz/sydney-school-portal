import { NextRequest, NextResponse } from "next/server";
import { authenticateMonitoringActor, callMonitoringRpc, loadMonitoringOptions, loadMonitoringRecords } from "../../../../lib/studentMonitoringServer";

export async function GET(request: NextRequest) {
  const auth = await authenticateMonitoringActor(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.actor?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("options") === "1") return NextResponse.json(await loadMonitoringOptions());
    return NextResponse.json({ records: await loadMonitoringRecords(auth.actor.id, "admin") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load monitoring records." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateMonitoringActor(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.actor?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json();
    const record = await callMonitoringRpc("create_student_monitoring", {
      p_actor_id: auth.actor.id,
      p_student_id: String(body.student_id || ""),
      p_class_id: String(body.class_id || ""),
      p_level_id: Number(body.level_id),
      p_reason: String(body.reason || ""),
      p_feedback_due_on: String(body.feedback_due_on || ""),
    });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create monitoring record." }, { status: 400 });
  }
}
