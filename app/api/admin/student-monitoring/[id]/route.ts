import { NextRequest, NextResponse } from "next/server";
import { authenticateMonitoringActor, callMonitoringRpc, loadMonitoringRecords } from "../../../../../lib/studentMonitoringServer";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMonitoringActor(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.actor?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { id } = await context.params;
  const records = await loadMonitoringRecords(auth.actor.id, "admin");
  const record = records.find((item) => item.id === id);
  return record ? NextResponse.json({ record }) : NextResponse.json({ error: "Monitoring record not found." }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMonitoringActor(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.actor?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { id } = await context.params;
  try {
    const body = await request.json();
    const record = await callMonitoringRpc("decide_student_monitoring", { p_actor_id: auth.actor.id, p_monitoring_id: id, p_decision: String(body.decision || ""), p_admin_notes: body.admin_notes || null, p_new_deadline: body.new_deadline || null, p_new_class_id: body.new_class_id || null, p_new_level_id: body.new_level_id ? Number(body.new_level_id) : null });
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save monitoring decision." }, { status: 400 });
  }
}
