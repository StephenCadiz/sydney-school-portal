import { NextRequest, NextResponse } from "next/server";

import { resolveProfileIdForAuthUser } from "../../../../lib/cambridgeStudentAccessServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token) return errorResponse("Authentication required.", 401);

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return errorResponse("Authentication required.", 401);
  }

  const profileId = await resolveProfileIdForAuthUser(authData.user.id);
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, first_name, last_name")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) return errorResponse("Unable to verify student access.", 500);
  if (profile?.role !== "student") {
    return errorResponse("Student record cannot be accessed in the portal.", 403);
  }

  return NextResponse.json(
    {
      id: profile.id,
      email: profile.email || authData.user.email || null,
      first_name: profile.first_name || null,
      last_name: profile.last_name || null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
