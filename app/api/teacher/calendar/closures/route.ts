import { NextRequest, NextResponse } from "next/server";

import { getMadridSchoolDate } from "../../../../../lib/schoolClosures";
import { loadSchoolClosures } from "../../../../../lib/schoolClosuresServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export async function GET(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return jsonError("Authentication required.", 401);

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) return jsonError("Authentication required.", 401);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) return jsonError("Unable to verify Teacher access.", 500);
  if (profile?.role !== "teacher") return jsonError("Teacher access required.", 403);

  try {
    const today = getMadridSchoolDate();
    const yesterday = (() => {
      const [year, month, day] = today.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day, 12));
      date.setUTCDate(date.getUTCDate() - 1);
      return date.toISOString().slice(0, 10);
    })();
    const closures = await loadSchoolClosures({ startDate: yesterday });

    return NextResponse.json(
      {
        closures: closures.map(({ id, name, closure_type, start_date, end_date }) => ({
          id,
          name,
          closure_type,
          start_date,
          end_date,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Teacher school closure load failed:", error);
    return jsonError("Unable to load school closures.", 500);
  }
}
