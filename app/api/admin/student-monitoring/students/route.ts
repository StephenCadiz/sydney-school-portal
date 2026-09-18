import { NextRequest, NextResponse } from "next/server";
import { authenticateMonitoringActor, searchMonitoringStudents } from "../../../../../lib/studentMonitoringServer";

export async function GET(request: NextRequest) {
  const auth = await authenticateMonitoringActor(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.actor?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    return NextResponse.json({ students: await searchMonitoringStudents(new URL(request.url).searchParams.get("q") || "") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to search students." }, { status: 500 });
  }
}
