import { NextRequest, NextResponse } from "next/server";

import {
  FRIDAY_TUTORIAL_SESSION_TYPES,
} from "../../../../../lib/fridayTutorialRotation";
import {
  loadFridayTutorialRotationContext,
  reconcileFutureFridayTutorialSessions,
} from "../../../../../lib/fridayTutorialRotationServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isFriday(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCDay() === 5;
}

function noStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;
    return noStore(await loadFridayTutorialRotationContext());
  } catch (error) {
    console.error("Friday Tutorial rotation load failed:", error);
    return examBankJsonError("Unable to load the Friday Tutorial rotation.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return examBankJsonError("Invalid Friday Tutorial rotation.", 400);
    }
    const record = body as Record<string, unknown>;
    if (
      Object.keys(record).some(
        (key) => !["first_friday_date", "first_session_type"].includes(key)
      )
    ) {
      return examBankJsonError("The request contains unsupported fields.", 400);
    }

    const firstFridayDate = String(record.first_friday_date || "").trim();
    const firstSessionType = String(record.first_session_type || "").trim();
    if (!isFriday(firstFridayDate)) {
      return examBankJsonError("Choose a valid Friday as the series start date.", 422);
    }
    if (!Object.values(FRIDAY_TUTORIAL_SESSION_TYPES).includes(firstSessionType as any)) {
      return examBankJsonError("Choose a valid first tutorial group.", 422);
    }

    const { data: settings, error } = await supabaseAdmin
      .from("friday_tutorial_settings")
      .upsert({
        id: 1,
        first_friday_date: firstFridayDate,
        first_session_type: firstSessionType,
        updated_at: new Date().toISOString(),
      })
      .select("id, first_friday_date, first_session_type, created_at, updated_at")
      .single();
    if (error) throw error;

    const reconciliation = await reconcileFutureFridayTutorialSessions();
    const context = await loadFridayTutorialRotationContext();
    return noStore({ ...context, settings, reconciliation });
  } catch (error) {
    console.error("Friday Tutorial rotation save failed:", error);
    return examBankJsonError("Unable to save the Friday Tutorial rotation.", 500);
  }
}
