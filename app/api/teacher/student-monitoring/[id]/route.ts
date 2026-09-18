import { NextRequest, NextResponse } from "next/server";
import { authenticateMonitoringActor, callMonitoringRpc } from "../../../../../lib/studentMonitoringServer";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMonitoringActor(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.actor?.role !== "teacher") return NextResponse.json({ error: "Teacher access required." }, { status: 403 });
  const { id } = await context.params;
  try {
    const body = await request.json();
    if (body.action === "continue") {
      return NextResponse.json({ record: await callMonitoringRpc("continue_student_monitoring", { p_actor_id: auth.actor.id, p_monitoring_id: id, p_new_deadline: String(body.new_deadline || "") }) });
    }
    if (body.action === "feedback") {
      return NextResponse.json({ record: await callMonitoringRpc("submit_student_monitoring_feedback", { p_actor_id: auth.actor.id, p_monitoring_id: id, p_observations: String(body.observations || ""), p_strengths: String(body.strengths || ""), p_difficulties: String(body.difficulties || ""), p_level_suitability: String(body.level_suitability || ""), p_recommendation: String(body.recommendation || "") }) });
    }
    return NextResponse.json({ error: "Unsupported monitoring action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update monitoring task." }, { status: 400 });
  }
}
