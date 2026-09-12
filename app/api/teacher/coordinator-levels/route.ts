import { NextRequest, NextResponse } from "next/server";

import {
  getTeacherCoordinatorLevelIds,
  syllabusJsonError,
} from "../../../../lib/syllabusServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token) return syllabusJsonError("Authentication required.", 401);

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) return syllabusJsonError("Authentication required.", 401);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) return syllabusJsonError("Unable to verify account access.", 500);
  if (profile?.role !== "teacher") return syllabusJsonError("Teacher access required.", 403);

  try {
    const levelIds = await getTeacherCoordinatorLevelIds(authData.user.id);
    if (!levelIds.length) return NextResponse.json({ levels: [] });
    const { data, error } = await supabaseAdmin
      .from("levels")
      .select("id, name")
      .in("id", levelIds)
      .order("name");
    if (error) throw error;
    return NextResponse.json({ levels: data || [] });
  } catch {
    return syllabusJsonError("Unable to load coordinator levels.", 500);
  }
}
