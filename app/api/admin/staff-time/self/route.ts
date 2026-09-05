import { NextRequest, NextResponse } from "next/server";

import {
  StaffTimeError,
  adminRequiresTimeRegistration,
  clockTeacher,
  getTrustedRequestIp,
  loadTeacherWorkingDay,
  requireStaffTimeAdmin,
  requireTrackedStaffTimeAdmin,
  submitTeacherCorrection,
} from "../../../../../lib/staffTimeServer";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function failure(error: unknown) {
  if (error instanceof StaffTimeError) {
    return json({ error: error.message }, error.status);
  }
  console.error("Admin self-service Staff Time request failed:", error);
  return json({ error: "Unable to load or update your working-time record." }, 500);
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireStaffTimeAdmin(request);
    if (!(await adminRequiresTimeRegistration(actor))) {
      return new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return json(await loadTeacherWorkingDay(actor, getTrustedRequestIp(request)));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireTrackedStaffTimeAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new StaffTimeError("Invalid Staff Time request.", 400);
    }
    const action = String((body as Record<string, unknown>).action || "");
    if (action === "sign_in" || action === "sign_out") {
      const result = await clockTeacher(actor, action, getTrustedRequestIp(request));
      return json({
        result,
        working_day: await loadTeacherWorkingDay(actor, getTrustedRequestIp(request)),
      });
    }
    if (action === "request_correction") {
      const correction = await submitTeacherCorrection(actor, body);
      return json({ correction }, 201);
    }
    throw new StaffTimeError("Unsupported Staff Time action.", 400);
  } catch (error) {
    return failure(error);
  }
}
