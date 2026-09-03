import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../lib/cambridgeExamBankServer";
import { getMadridSchoolDate } from "../../../../lib/schoolClosures";
import {
  SchoolClosureError,
  loadSchoolClosures,
  parseSchoolClosureInput,
} from "../../../../lib/schoolClosuresServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { reconcileFutureFridayTutorialSessions } from "../../../../lib/fridayTutorialRotationServer";

function noStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function databaseError(error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as { code?: string; message?: string })
      : {};
  if (value.code === "23P01") {
    return examBankJsonError(
      "These dates overlap an existing School Closure. Edit the existing closure or choose different dates.",
      409
    );
  }
  if (value.code === "23514") {
    return examBankJsonError(
      "The School Closure details do not meet the calendar rules.",
      422
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    return noStore({
      closures: await loadSchoolClosures(),
      today_madrid: getMadridSchoolDate(),
    });
  } catch (error) {
    console.error("School Closure list failed:", error);
    return examBankJsonError("Unable to load the School Calendar.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const body = await request.json().catch(() => null);
    const input = parseSchoolClosureInput(body);
    const { data, error } = await supabaseAdmin
      .from("school_closures")
      .insert({ ...input, created_by: admin.userId })
      .select(
        "id, name, closure_type, start_date, end_date, notes, created_by, created_at, updated_at"
      )
      .single();

    if (error) {
      const response = databaseError(error);
      if (response) return response;
      throw error;
    }

    const fridayTutorialReconciliation =
      await reconcileFutureFridayTutorialSessions();
    return noStore({ closure: data, friday_tutorial_reconciliation: fridayTutorialReconciliation }, 201);
  } catch (error) {
    if (error instanceof SchoolClosureError) {
      return examBankJsonError(error.message, error.status);
    }
    console.error("School Closure create failed:", error);
    return examBankJsonError("Unable to create the School Closure.", 500);
  }
}
