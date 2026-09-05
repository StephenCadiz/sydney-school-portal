import { NextRequest, NextResponse } from "next/server";

import { addCalendarDays, getMadridDate, text } from "../../../../lib/staffTime";
import {
  StaffTimeError,
  addAllowedNetwork,
  authoriseRemoteWork,
  createManualCorrection,
  getTrustedRequestIp,
  loadAdminIncidences,
  loadAdminSettings,
  loadAdminTeacherArea,
  loadAdminToday,
  requireStaffTimeAdmin,
  resolveIncidence,
  reviewCorrection,
  revokeRemoteWork,
  saveCompanySettings,
  saveEmploymentRecord,
  saveWorkSchedule,
  toggleAllowedNetwork,
} from "../../../../lib/staffTimeServer";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function failure(error: unknown) {
  if (error instanceof StaffTimeError) return json({ error: error.message }, error.status);
  console.error("Admin Staff Time request failed:", error);
  return json({ error: "Unable to load or update the Staff Time Register." }, 500);
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireStaffTimeAdmin(request);
    const view = text(request.nextUrl.searchParams.get("view")) || "today";
    const today = getMadridDate();
    if (view === "today") {
      return json(await loadAdminToday(actor, getTrustedRequestIp(request)));
    }
    if (view === "teachers") {
      const data = await loadAdminTeacherArea({
          teacherId: text(request.nextUrl.searchParams.get("teacher")) || undefined,
          startDate: text(request.nextUrl.searchParams.get("start")) || undefined,
          endDate: text(request.nextUrl.searchParams.get("end")) || undefined,
        });
      return json({ ...data, current_admin_id: actor.id });
    }
    if (view === "incidences") {
      return json(
        await loadAdminIncidences(
          actor,
          text(request.nextUrl.searchParams.get("start")) || addCalendarDays(today, -30),
          text(request.nextUrl.searchParams.get("end")) || today
        )
      );
    }
    if (view === "settings") {
      return json(await loadAdminSettings(getTrustedRequestIp(request)));
    }
    throw new StaffTimeError("Unsupported Staff Time view.", 400);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaffTimeAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new StaffTimeError("Invalid Staff Time request.", 400);
    }
    const action = text((body as Record<string, unknown>).action);
    let result: unknown;
    switch (action) {
      case "save_company":
        result = await saveCompanySettings(actor, body);
        break;
      case "save_employment":
        result = await saveEmploymentRecord(actor, body);
        break;
      case "save_schedule":
        result = await saveWorkSchedule(actor, body);
        break;
      case "add_network":
        result = await addAllowedNetwork(actor, body, getTrustedRequestIp(request), false);
        break;
      case "add_current_network":
        result = await addAllowedNetwork(actor, body, getTrustedRequestIp(request), true);
        break;
      case "toggle_network":
        result = await toggleAllowedNetwork(actor, body);
        break;
      case "authorise_remote":
        result = await authoriseRemoteWork(actor, body);
        break;
      case "revoke_remote":
        result = await revokeRemoteWork(actor, body);
        break;
      case "review_correction":
        result = await reviewCorrection(actor, body);
        break;
      case "manual_correction":
        result = await createManualCorrection(actor, body);
        break;
      case "resolve_incidence":
        result = await resolveIncidence(actor, body);
        break;
      default:
        throw new StaffTimeError("Unsupported Staff Time action.", 400);
    }
    return json({ result });
  } catch (error) {
    return failure(error);
  }
}
