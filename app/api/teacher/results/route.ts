import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import {
  buildAggregateValue,
  buildHomeworkAnalytics,
  deduplicateHomeworkResults,
  getCambridgeTarget,
  type HomeworkClassComparison,
  type HomeworkSourceResult,
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

async function buildCambridgeResponse(classes: TeacherResultClassOption[], view: "class" | "level") {
  const classIds = classes.map((item) => item.id);
  const rosters = await getCambridgeRosters(classIds);
  const { data: resultRows, error: resultError } = await supabaseAdmin
    .from("results")
    .select(
      "id, class_id, student_id, week_number, title, skill, percentage, updated_at, created_at"
    )
    .in("class_id", classIds)
    .eq("result_type", "homework");

  if (resultError) throw resultError;

  const deduplicated = deduplicateHomeworkResults(
    (resultRows || []) as HomeworkSourceResult[],
    rosters
  );
  const rosterCount = uniqueRosterCount(rosters);
  const levelName = classes[0]?.level_name || "";
  const classComparison: HomeworkClassComparison[] = classes.map((item) => {
    const classResults = deduplicated.filter((row) => row.class_id === item.id);
    return {
      class_id: item.id,
      class_name: item.class_name,
      level_name: item.level_name,
      roster_count: rosters.get(item.id)?.size || 0,
      ...buildAggregateValue(classResults),
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
    homework: buildHomeworkAnalytics(deduplicated, levelName, rosterCount),
    class_comparison: view === "level" ? classComparison : [],
    coverage_context: "Coverage against current enrollment",
  };
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
