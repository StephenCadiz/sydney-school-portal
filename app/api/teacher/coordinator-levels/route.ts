import { NextRequest, NextResponse } from "next/server";

import {
  getTeacherCoordinatorLevelIds,
  resolveAuthenticatedProfile,
  syllabusJsonError,
} from "../../../../lib/syllabusServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const profile = await resolveAuthenticatedProfile(request);
  if (profile.error) {
    return syllabusJsonError(profile.error, profile.userId ? 500 : 401);
  }
  if (profile.role !== "teacher") return syllabusJsonError("Teacher access required.", 403);

  try {
    const levelIds = await getTeacherCoordinatorLevelIds(profile.userId);
    if (!levelIds.length) {
      return NextResponse.json(
        { levels: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const { data, error } = await supabaseAdmin
      .from("levels")
      .select("id, name")
      .in("id", levelIds)
      .order("name");
    if (error) throw error;
    return NextResponse.json(
      { levels: data || [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return syllabusJsonError("Unable to load coordinator levels.", 500);
  }
}
