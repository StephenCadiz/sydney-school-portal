import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import {
  buildAggregateValue,
  buildFridayAnalytics,
  buildHomeworkAnalytics,
  buildMockAnalytics,
  deduplicateHomeworkResults,
  deduplicateMockResults,
  getCambridgeTarget,
  type FridaySourceRow,
  type HomeworkSourceResult,
  type MockSourceResult,
  type TeacherResultClassOption,
} from "../../../../lib/teacherResults";

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function authenticateTeacher(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) return { teacherId: "", response: jsonError("Authentication required.", 401) };

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !authData.user) {
    return { teacherId: "", response: jsonError("Invalid authentication token.", 401) };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .single();

  if (profileError || profile?.role !== "teacher") {
    return { teacherId: "", response: jsonError("Teacher access required.", 403) };
  }

  return { teacherId: authData.user.id, response: null };
}

async function getTeacherClasses(teacherId: string) {
  const { data: classes, error: classesError } = await supabaseAdmin
    .from("classes")
    .select(
      "id, class_name, level_id, is_cambridge, course_type, days, start_time, end_time"
    )
    .eq("teacher_id", teacherId)
    .order("class_name");

  if (classesError) throw classesError;

  const levelIds = Array.from(new Set((classes || []).map((row) => row.level_id).filter(Boolean)));
  const { data: levels, error: levelsError } = levelIds.length
    ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };

  if (levelsError) throw levelsError;

  const levelNames = new Map((levels || []).map((level) => [String(level.id), level.name]));
  const options: TeacherResultClassOption[] = (classes || []).map((row) => ({
    id: String(row.id),
    class_name: row.class_name || levelNames.get(String(row.level_id)) || "Class",
    level_id: String(row.level_id || ""),
    level_name: levelNames.get(String(row.level_id)) || "Unknown level",
    is_cambridge: row.is_cambridge === true,
    course_type: row.course_type || "",
    days: row.days || "",
    start_time: row.start_time || "",
    end_time: row.end_time || "",
  }));

  return options;
}

function buildLevels(classes: TeacherResultClassOption[]) {
  const levels = new Map<string, { id: string; name: string; is_cambridge: boolean }>();

  for (const item of classes) {
    if (!item.level_id || levels.has(item.level_id)) continue;
    levels.set(item.level_id, {
      id: item.level_id,
      name: item.level_name,
      is_cambridge: item.is_cambridge,
    });
  }

  return Array.from(levels.values()).sort((first, second) => first.name.localeCompare(second.name));
}

async function getCambridgeRosters(classIds: string[]) {
  const { data: enrolments, error: enrolmentError } = await supabaseAdmin
    .from("class_enrolments")
    .select("class_id, student_id")
    .in("class_id", classIds);

  if (enrolmentError) throw enrolmentError;

  const candidateIds = Array.from(
    new Set((enrolments || []).map((row) => String(row.student_id || "")).filter(Boolean))
  );
  const { data: profiles, error: profileError } = candidateIds.length
    ? await supabaseAdmin.from("profiles").select("id").eq("role", "student").in("id", candidateIds)
    : { data: [], error: null };

  if (profileError) throw profileError;

  const validIds = new Set((profiles || []).map((profile) => String(profile.id)));
  const rosterByClass = new Map<string, Set<string>>(classIds.map((id) => [id, new Set()]));

  for (const row of enrolments || []) {
    const classId = String(row.class_id || "");
    const studentId = String(row.student_id || "");
    if (validIds.has(studentId)) rosterByClass.get(classId)?.add(studentId);
  }

  return rosterByClass;
}

async function getYoungLearnerCounts(classIds: string[]) {
  const { data, error } = await supabaseAdmin
    .from("young_learners")
    .select("id, class_id")
    .eq("active", true)
    .in("class_id", classIds);

  if (error) throw error;

  const byClass = new Map<string, Set<string>>(classIds.map((id) => [id, new Set()]));
  for (const row of data || []) byClass.get(String(row.class_id))?.add(String(row.id));
  return byClass;
}

function uniqueRosterCount(rosters: Map<string, Set<string>>) {
  const ids = new Set<string>();
  rosters.forEach((roster) => roster.forEach((id) => ids.add(id)));
  return ids.size;
}

const resultSelectColumns =
  "id, class_id, student_id, result_type, title, skill, percentage, mock_number, reading, writing, listening, speaking, overall, published_at, updated_at, created_at";
const resultSelectColumnsWithoutTimestamps =
  "id, class_id, student_id, result_type, title, skill, percentage, mock_number, reading, writing, listening, speaking, overall, published_at";

function isMissingResultTimestampColumn(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42703" &&
    (message.includes("results.updated_at") ||
      message.includes("results.created_at") ||
      message.includes("column updated_at") ||
      message.includes("column created_at"))
  );
}

async function buildCambridgeResponse(classes: TeacherResultClassOption[], view: "class" | "level") {
  const classIds = classes.map((item) => item.id);
  const rosters = await getCambridgeRosters(classIds);
  const resultQuery = await supabaseAdmin
    .from("results")
    .select(resultSelectColumns)
    .in("class_id", classIds)
    .in("result_type", ["homework", "mock"]);
  let resultRows: any[] | null = resultQuery.data;
  let resultError: any = resultQuery.error;

  if (resultError && isMissingResultTimestampColumn(resultError)) {
    const fallback = await supabaseAdmin
      .from("results")
      .select(resultSelectColumnsWithoutTimestamps)
      .in("class_id", classIds)
      .in("result_type", ["homework", "mock"]);

    resultRows = fallback.data;
    resultError = fallback.error;
  }

  if (resultError) throw resultError;

  const deduplicated = deduplicateHomeworkResults(
    (resultRows || []).filter((row) => row.result_type === "homework") as HomeworkSourceResult[],
    rosters
  );
  const mockResults = deduplicateMockResults(
    (resultRows || []).filter((row) => row.result_type === "mock") as MockSourceResult[],
    rosters
  );
  const fridayRows = await loadFridayRows(classIds);
  const rosterCount = uniqueRosterCount(rosters);
  const levelName = classes[0]?.level_name || "";
  const homework = buildHomeworkAnalytics(deduplicated, levelName, rosterCount);
  const friday = buildFridayAnalytics(fridayRows);
  const mocks = buildMockAnalytics(mockResults, levelName, rosterCount);
  const classComparison = classes.map((item) => {
    const classResults = deduplicated.filter((row) => row.class_id === item.id);
    const classRosterCount = rosters.get(item.id)?.size || 0;
    return {
      class_id: item.id,
      class_name: item.class_name,
      level_name: item.level_name,
      roster_count: classRosterCount,
      homework: buildAggregateValue(classResults),
      friday: buildFridayAnalytics(fridayRows.filter((row) => row.class_id === item.id)).overall,
      mock: buildMockAnalytics(
        mockResults.filter((row) => row.class_id === item.id),
        item.level_name,
        classRosterCount
      ).latest,
    };
  });

  return {
    view,
    type: "cambridge",
    context:
      view === "class"
        ? { ...classes[0], student_count: rosterCount }
        : {
            level_id: classes[0]?.level_id || "",
            level_name: levelName,
            class_count: classes.length,
            student_count: rosterCount,
          },
    target: getCambridgeTarget(levelName),
    homework,
    friday,
    mocks,
    class_comparison: view === "level" ? classComparison : [],
    coverage_context: "Coverage against current enrollment",
  };
}

function getMadridDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function loadFridayRows(classIds: string[]): Promise<FridaySourceRow[]> {
  const { data: sheets, error: sheetError } = await supabaseAdmin
    .from("friday_tutorial_result_sheets")
    .select("id, tutorial_session_id, class_id")
    .in("class_id", classIds);

  if (sheetError) throw sheetError;
  if (!sheets?.length) return [];

  const sessionIds = Array.from(new Set(sheets.map((sheet) => sheet.tutorial_session_id).filter(Boolean)));
  const { data: sessions, error: sessionError } = await supabaseAdmin
    .from("friday_exam_practice_sessions")
    .select("id, session_date, level_name, activity_type, exam_part, active")
    .in("id", sessionIds)
    .eq("active", true)
    .lte("session_date", getMadridDateString());

  if (sessionError) throw sessionError;

  const sessionById = new Map((sessions || []).map((session) => [String(session.id), session]));
  const validSheets = sheets.filter((sheet) => sessionById.has(String(sheet.tutorial_session_id)));
  if (validSheets.length === 0) return [];

  const { data: results, error: resultError } = await supabaseAdmin
    .from("friday_tutorial_results")
    .select("result_sheet_id, student_id, percentage, attended")
    .in("result_sheet_id", validSheets.map((sheet) => sheet.id));

  if (resultError) throw resultError;

  const sheetById = new Map(validSheets.map((sheet) => [String(sheet.id), sheet]));
  return (results || []).flatMap((result) => {
    const sheet = sheetById.get(String(result.result_sheet_id));
    const session = sheet ? sessionById.get(String(sheet.tutorial_session_id)) : null;
    if (!sheet || !session) return [];

    return [{
      sheet_id: String(sheet.id),
      session_id: String(session.id),
      class_id: String(sheet.class_id),
      student_id: String(result.student_id),
      session_date: String(session.session_date || ""),
      level_name: String(session.level_name || ""),
      activity_type: String(session.activity_type || ""),
      exam_part: session.exam_part || null,
      percentage:
        result.percentage === null || result.percentage === undefined
          ? null
          : Number(result.percentage),
      attended: result.attended === true,
    }];
  });
}

async function buildNonCambridgeResponse(
  classes: TeacherResultClassOption[],
  view: "class" | "level"
) {
  const counts = await getYoungLearnerCounts(classes.map((item) => item.id));
  const studentCount = uniqueRosterCount(counts);

  return {
    view,
    type: "young_learner",
    context:
      view === "class"
        ? { ...classes[0], student_count: studentCount }
        : {
            level_id: classes[0]?.level_id || "",
            level_name: classes[0]?.level_name || "",
            class_count: classes.length,
            student_count: studentCount,
          },
    message: "Assessment analytics for this class type will be added in a later phase.",
  };
}

export async function GET(request: NextRequest) {
  try {
    const authentication = await authenticateTeacher(request);
    if (authentication.response) return authentication.response;

    const classes = await getTeacherClasses(authentication.teacherId);
    const { searchParams } = new URL(request.url);

    if (searchParams.get("mode") === "options") {
      return NextResponse.json({ classes, levels: buildLevels(classes) });
    }

    const view = searchParams.get("view");
    if (view !== "class" && view !== "level") {
      return jsonError("Select a valid results view.", 400);
    }

    const selectedClasses =
      view === "class"
        ? classes.filter((item) => item.id === searchParams.get("class_id"))
        : classes.filter((item) => item.level_id === searchParams.get("level_id"));

    if (selectedClasses.length === 0) {
      return jsonError(
        view === "class"
          ? "This class is not assigned to the authenticated teacher."
          : "This level is not represented by the authenticated teacher's classes.",
        403
      );
    }

    const cambridgeClasses = selectedClasses.filter((item) => item.is_cambridge);
    const analyticsClasses = cambridgeClasses.length === selectedClasses.length
      ? selectedClasses
      : selectedClasses.filter((item) => !item.is_cambridge);

    return NextResponse.json(
      cambridgeClasses.length === selectedClasses.length
        ? await buildCambridgeResponse(analyticsClasses, view)
        : await buildNonCambridgeResponse(analyticsClasses, view)
    );
  } catch (error) {
    console.error("Teacher results request failed:", error);
    return jsonError("Unable to load Results & Performance.", 500);
  }
}
