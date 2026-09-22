import { NextRequest, NextResponse } from "next/server";

import { loadUpcomingCalendarGroups } from "../../../../lib/calendarGroupsServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return errorResponse("Authentication required.", 401);

  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !auth.user) return errorResponse("Authentication required.", 401);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError) return errorResponse("Unable to verify calendar access.", 500);
  if (profile?.role !== "admin" && profile?.role !== "teacher") {
    return errorResponse("Calendar access required.", 403);
  }

  try {
    return NextResponse.json(
      { groups: await loadUpcomingCalendarGroups() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Upcoming calendar groups load failed:", error);
    return errorResponse("Unable to load upcoming calendar groups.", 500);
  }
}
