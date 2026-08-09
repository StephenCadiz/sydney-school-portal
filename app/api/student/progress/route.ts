import { NextRequest, NextResponse } from "next/server";

import {
  authenticateStudentHomework,
  resolveStudentHomeworkContext,
} from "../../../../lib/studentHomeworkServer";
import { adjustHomeworkDatesForClassDays } from "../../../../lib/homework";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const METADATA_COLUMNS =
  "id, week_number, homework_skill, release_date, active, level, course_type, homework_order, created_at, updated_at";
const FALLBACK_METADATA_COLUMNS =
  "id, week_number, homework_skill, release_date, active, level, course_type, homework_order";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isMissingHomeworkTimestampColumn(error: any) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .match(/created_at|updated_at/);
}

async function loadLegacyHomeworkMetadata(
  level: string,
  courseType: string,
  classDays: string
) {
  const metadataResult = await supabaseAdmin
    .from("cambridge_homework")
    .select(METADATA_COLUMNS)
    .eq("level", level)
    .eq("course_type", courseType)
    .order("week_number")
    .order("homework_order");
  let data: any[] | null = metadataResult.data;
  let error: any = metadataResult.error;

  if (error && isMissingHomeworkTimestampColumn(error)) {
    const fallbackResult = await supabaseAdmin
      .from("cambridge_homework")
      .select(FALLBACK_METADATA_COLUMNS)
      .eq("level", level)
      .eq("course_type", courseType)
      .order("week_number")
      .order("homework_order");
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) throw error;

  return adjustHomeworkDatesForClassDays(data || [], classDays);
}

export async function GET(request: NextRequest) {
  const auth = await authenticateStudentHomework(request);
  if (auth.error) return jsonError(auth.error, auth.status);

  const resolved = await resolveStudentHomeworkContext(auth.studentId);
  if (resolved.error || !resolved.context) {
    return jsonError(resolved.error || "Unable to load progress.", resolved.status);
  }

  const { context } = resolved;

  try {
    const [resultsResult, homeworkMetadata] = await Promise.all([
      supabaseAdmin
        .from("results")
        .select("*")
        .eq("student_id", context.studentId)
        .eq("class_id", context.classId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("exam_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .limit(500),
      loadLegacyHomeworkMetadata(
        context.level,
        context.courseType,
        context.classDays
      ),
    ]);

    if (resultsResult.error) throw resultsResult.error;

    const results = (resultsResult.data || []).filter(
      (result) =>
        result.result_type !== "mock" ||
        (result.published_at !== null && result.published_at !== undefined)
    );

    return NextResponse.json({
      class: {
        id: context.classId,
        level: context.level,
        course_type: context.courseType,
      },
      results,
      homework_release_metadata: homeworkMetadata,
    });
  } catch (error) {
    console.error("Student progress load failed:", {
      stage: "progress",
      actorId: context.studentId,
      classId: context.classId,
      error,
    });
    return jsonError("Unable to load progress.", 500);
  }
}
