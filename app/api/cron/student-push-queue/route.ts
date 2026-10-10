import { NextRequest, NextResponse } from "next/server";

import { flushQueuedAutomatedStudentPushes } from "../../../../lib/pushNotificationsServer";

function authorized(request: NextRequest) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await flushQueuedAutomatedStudentPushes();
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("Queued Student PWA push flush failed:", {
      message: error?.message || null,
      code: error?.code || null,
      details: error?.details || null,
      hint: error?.hint || null,
    });
    return NextResponse.json({ error: "Unable to flush queued notifications." }, { status: 500 });
  }
}
