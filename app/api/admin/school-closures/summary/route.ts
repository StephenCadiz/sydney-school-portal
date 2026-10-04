import { NextRequest, NextResponse } from "next/server";

import { requireExamBankAdmin } from "../../../../../lib/cambridgeExamBankServer";
import { isRocioRestrictedAdmin } from "../../../../../lib/adminAccess";
import { getMadridSchoolDate, getNextSchoolClosure } from "../../../../../lib/schoolClosures";
import { loadSchoolClosures } from "../../../../../lib/schoolClosuresServer";

export async function GET(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  try {
    const today = getMadridSchoolDate();
    const closures = await loadSchoolClosures();
    return NextResponse.json(
      {
        // Restricted Admins receive only the dashboard summary; the full
        // closure list remains available to unrestricted Admins.
        closures: isRocioRestrictedAdmin(admin.userId) ? [] : closures,
        next_closure: getNextSchoolClosure(closures, today),
        today_madrid: today,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("School Closure summary failed:", error);
    return NextResponse.json(
      { error: "Unable to load the School Calendar summary." },
      { status: 500 }
    );
  }
}
