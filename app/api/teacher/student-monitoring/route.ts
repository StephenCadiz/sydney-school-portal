import { NextRequest, NextResponse } from "next/server";
import { authenticateMonitoringActor, loadMonitoringRecords } from "../../../../lib/studentMonitoringServer";

export async function GET(request: NextRequest) {
  const auth = await authenticateMonitoringActor(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.actor?.role !== "teacher") return NextResponse.json({ error: "Teacher access required." }, { status: 403 });
  try {
    const url = new URL(request.url);
    const records = await loadMonitoringRecords(auth.actor.id, "teacher", url.searchParams.get("class_id") || undefined);
    const outstanding = records.filter((record) => ["awaiting_teacher_feedback", "monitoring_continued", "overdue"].includes(record.status));
    if (url.searchParams.get("summary") === "1") return NextResponse.json({ count: outstanding.length });
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load monitoring tasks." }, { status: 500 });
  }
}
