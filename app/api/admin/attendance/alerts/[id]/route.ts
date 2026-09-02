import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../../lib/cambridgeExamBankServer";
import {
  AdminAttendanceError,
  markAttendanceAlertDealtWith,
} from "../../../../../../lib/adminAttendanceServer";

export async function PATCH(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "action") ||
      String(body.action || "") !== "dealt_with"
    ) {
      return examBankJsonError("Choose a valid attendance alert action.", 400);
    }

    const { id } = await routeContext.params;
    await markAttendanceAlertDealtWith(id, admin.userId);
    return NextResponse.json(
      { success: true, message: "Attendance alert marked as dealt with." },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AdminAttendanceError) {
      return examBankJsonError(error.message, error.status);
    }
    console.error("Admin attendance alert update failed:", error);
    return examBankJsonError("Unable to update the attendance alert.", 500);
  }
}
