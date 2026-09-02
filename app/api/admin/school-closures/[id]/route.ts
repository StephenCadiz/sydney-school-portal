import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import {
  SchoolClosureError,
  parseSchoolClosureInput,
} from "../../../../../lib/schoolClosuresServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(payload: unknown) {
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}

function databaseError(error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as { code?: string })
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

export async function PATCH(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;
    const { id } = await routeContext.params;
    if (!UUID_PATTERN.test(id)) {
      return examBankJsonError("School Closure was not found.", 404);
    }

    const input = parseSchoolClosureInput(await request.json().catch(() => null));
    const { data, error } = await supabaseAdmin
      .from("school_closures")
      .update(input)
      .eq("id", id)
      .select(
        "id, name, closure_type, start_date, end_date, notes, created_by, created_at, updated_at"
      )
      .maybeSingle();

    if (error) {
      const response = databaseError(error);
      if (response) return response;
      throw error;
    }
    if (!data) return examBankJsonError("School Closure was not found.", 404);
    return noStore({ closure: data });
  } catch (error) {
    if (error instanceof SchoolClosureError) {
      return examBankJsonError(error.message, error.status);
    }
    console.error("School Closure update failed:", error);
    return examBankJsonError("Unable to update the School Closure.", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;
    const { id } = await routeContext.params;
    if (!UUID_PATTERN.test(id)) {
      return examBankJsonError("School Closure was not found.", 404);
    }

    const { data, error } = await supabaseAdmin
      .from("school_closures")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return examBankJsonError("School Closure was not found.", 404);
    return noStore({ deleted: true, id });
  } catch (error) {
    console.error("School Closure delete failed:", error);
    return examBankJsonError("Unable to delete the School Closure.", 500);
  }
}
