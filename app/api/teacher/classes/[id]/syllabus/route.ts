import { NextRequest, NextResponse } from "next/server";

import {
  logSyllabusFailure,
  requireTeacherSyllabusClass,
  serializeSyllabus,
  syllabusJsonError,
  SYLLABUS_SELECT,
} from "../../../../../../lib/syllabusServer";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { id } = await routeContext.params;
  const access = await requireTeacherSyllabusClass(request, String(id || ""));
  if (access.response || !access.context) return access.response;

  try {
    const { data, error } = await supabaseAdmin
      .from("syllabuses")
      .select(SYLLABUS_SELECT)
      .eq("academic_year_id", access.context.academicYearId)
      .eq("level_id", access.context.levelId)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      syllabus: data ? serializeSyllabus(data, true) : null,
    });
  } catch (error) {
    logSyllabusFailure("teacher-view", error);
    return syllabusJsonError("Unable to load the class syllabus.", 500);
  }
}
