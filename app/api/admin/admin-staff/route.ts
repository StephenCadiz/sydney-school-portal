import { NextRequest, NextResponse } from "next/server";

import {
  authenticateAdminRequest,
  loadReconciledAdminStaffAccounts,
  logAdminStaffAccountFailure,
} from "../../../../lib/adminStaffAccountsServer";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdminRequest(request);
  if (auth.error) return jsonError(auth.error.message, auth.error.status);

  try {
    const accounts = await loadReconciledAdminStaffAccounts();

    return NextResponse.json(
      {
        accounts,
        current_admin_id: auth.actorId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logAdminStaffAccountFailure("list-and-reconcile", error);
    return jsonError("Unable to load Admin staff accounts.", 500);
  }
}
