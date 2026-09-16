import { NextRequest, NextResponse } from "next/server";

import {
  authenticateAccessActor,
  authorizeCambridgeAccess,
  CambridgeAccessError,
  loadStudentAccess,
  saveStudentEmail,
  sendStudentInvitation,
  normalizeStudentEmail,
} from "../../../../../../lib/cambridgeStudentAccessServer";

function failure(error: unknown, fallback = "Unable to update student access.") {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof CambridgeAccessError ? error.status : 500;
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const studentId = String(request.nextUrl.searchParams.get("student_id") || "").trim();
    if (!studentId) return NextResponse.json({ error: "Student is required." }, { status: 400 });
    const actor = await authenticateAccessActor(request);
    await authorizeCambridgeAccess(actor, studentId, id);
    return NextResponse.json(await loadStudentAccess(studentId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "Unable to load student access.");
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const studentId = String(body?.student_id || "").trim();
    if (!studentId) return NextResponse.json({ error: "Student is required." }, { status: 400 });
    const actor = await authenticateAccessActor(request);
    await authorizeCambridgeAccess(actor, studentId, id);
    const action = String(body?.action || "").trim();
    if (action === "save-email") {
      return NextResponse.json(await saveStudentEmail(studentId, normalizeStudentEmail(body?.email)), { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "send-invitation" || action === "resend-invitation") {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      return NextResponse.json(await sendStudentInvitation(studentId, `${siteUrl.replace(/\/$/, "")}/set-password`, { resend: action === "resend-invitation" }), { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Choose a valid access-control action." }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
