import { NextRequest, NextResponse } from "next/server";

import {
  isTeensUnitExamLevel,
  isUnitExamLevel,
} from "../../../../../../lib/unitExamResults";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logWorkspaceError(stage: string, error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  console.error("Young Learner workspace failure:", {
    stage,
    message: value.message,
    code: value.code,
    details: value.details,
    hint: value.hint,
  });
}

function getName(value: any, fallback: string) {
  return `${value?.first_name || ""} ${value?.last_name || ""}`.trim() || fallback;
}

function calculateResultPercentage(result: any) {
  const values = [
    result.reading_writing,
    result.reading,
    result.writing,
    result.listening,
    result.speaking,
  ]
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite);

  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

async function getActor(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token) return { actor: null, response: jsonError("Authentication required.", 401) };

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return { actor: null, response: jsonError("Authentication required.", 401) };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    logWorkspaceError("actor-profile", profileError);
    return { actor: null, response: jsonError("Unable to verify workspace access.", 500) };
  }
  if (profile?.role !== "teacher" && profile?.role !== "admin") {
    return { actor: null, response: jsonError("Teacher access required.", 403) };
  }
  return { actor: profile, response: null };
}

async function getContext(
  request: NextRequest,
  routeContext: { params: Promise<{ studentId: string }> }
) {
  const auth = await getActor(request);
  if (auth.response || !auth.actor) return { ...auth, context: null };

  const studentId = String((await routeContext.params).studentId || "");
  const classId = String(request.nextUrl.searchParams.get("classId") || "");
  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(classId)) {
    return { actor: auth.actor, context: null, response: jsonError("Young Learner workspace not found.", 404) };
  }

  const { data: classRow, error: classError } = await supabaseAdmin
    .from("classes")
    .select("*")
    .eq("id", classId)
    .maybeSingle();
  if (classError) {
    logWorkspaceError("class-load", classError);
    return { actor: auth.actor, context: null, response: jsonError("Unable to load class information.", 500) };
  }
  if (!classRow || (auth.actor.role === "teacher" && classRow.teacher_id !== auth.actor.id)) {
    return { actor: auth.actor, context: null, response: jsonError("Young Learner workspace not found.", 404) };
  }

  const [{ data: level, error: levelError }, { data: learner, error: learnerError }] =
    await Promise.all([
      supabaseAdmin.from("levels").select("id, name").eq("id", classRow.level_id).maybeSingle(),
      supabaseAdmin.from("young_learners").select("*").eq("id", studentId).eq("class_id", classId).maybeSingle(),
    ]);
  if (levelError || learnerError) {
    logWorkspaceError("learner-context", levelError || learnerError);
    return { actor: auth.actor, context: null, response: jsonError("Unable to load Young Learner information.", 500) };
  }
  if (!learner || !level || classRow.is_cambridge === true || !isUnitExamLevel(level.name)) {
    return { actor: auth.actor, context: null, response: jsonError("Young Learner workspace not found.", 404) };
  }

  return { actor: auth.actor, context: { studentId, classId, classRow, level, learner }, response: null };
}

async function loadProfiles(ids: string[]) {
  const validIds = Array.from(new Set(ids.filter((id) => UUID_PATTERN.test(id))));
  if (validIds.length === 0) return new Map<string, any>();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, role")
    .in("id", validIds);
  if (error) throw error;
  return new Map((data || []).map((profile) => [profile.id, profile]));
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ studentId: string }> }
) {
  try {
    const access = await getContext(request, routeContext);
    if (access.response || !access.context) return access.response;
    const { studentId, classId, classRow, level, learner } = access.context;

    const [classroomResult, teacherResult, notesResult, resultsResult, followUpsResult] =
      await Promise.all([
        classRow.classroom_id
          ? supabaseAdmin.from("classrooms").select("id, name").eq("id", classRow.classroom_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        classRow.teacher_id
          ? supabaseAdmin.from("profiles").select("id, first_name, last_name").eq("id", classRow.teacher_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabaseAdmin.from("young_learner_notes").select("*").eq("young_learner_id", studentId).order("created_at", { ascending: false }),
        supabaseAdmin.from("unit_exam_results").select("*").eq("young_learner_id", studentId).order("unit_exam_number", { ascending: false }).order("created_at", { ascending: false }),
        supabaseAdmin.from("follow_up_documents").select("id, category, status, updated_at, created_at").eq("student_type", "young_learner").eq("young_learner_id", studentId).order("updated_at", { ascending: false }),
      ]);

    const failed = [classroomResult, teacherResult, notesResult, resultsResult, followUpsResult].find((result) => result.error);
    if (failed?.error) {
      logWorkspaceError("workspace-data", failed.error);
      return jsonError("Unable to load the Young Learner workspace.", 500);
    }

    const profiles = await loadProfiles((notesResult.data || []).map((note) => note.created_by).filter(Boolean));
    const notes = (notesResult.data || []).map((note) => ({
      ...note,
      created_by_name: getName(profiles.get(note.created_by), "Former staff member"),
      can_edit: note.created_by === access.actor?.id,
    }));
    const requiredScoreFields = isTeensUnitExamLevel(level.name)
      ? ["reading", "writing", "listening", "speaking"]
      : ["reading_writing", "listening", "speaking"];
    const results = (resultsResult.data || []).map((result) => ({
      ...result,
      percentage: calculateResultPercentage(result),
      completed: requiredScoreFields.every(
        (field) => result[field] !== null && result[field] !== undefined
      ),
    }));
    const completedResults = results.filter((result) => result.completed && result.percentage !== null);
    const average = completedResults.length
      ? Math.round((completedResults.reduce((sum, result) => sum + result.percentage, 0) / completedResults.length) * 10) / 10
      : null;

    return NextResponse.json({
      student: { id: learner.id, first_name: learner.first_name, last_name: learner.last_name, active: learner.active !== false },
      class: {
        id: classId,
        name: classRow.class_name || `${level.name} Class`,
        level: level.name,
        days: classRow.days || null,
        start_time: classRow.start_time || null,
        end_time: classRow.end_time || null,
        classroom: classroomResult.data?.name || null,
        teacher: getName(teacherResult.data, "Teacher not assigned"),
        academic_year: classRow.academic_year || classRow.school_year || null,
      },
      notes,
      unit_exam_results: results,
      follow_up_summary: followUpsResult.data || [],
      progress: {
        unit_exam_average: average,
        completed_unit_exams: completedResults.length,
        pending_unit_exams: results.filter((result) => !result.completed).length,
        latest_follow_up_status: followUpsResult.data?.[0]?.status || null,
        note_count: notes.length,
      },
    });
  } catch (error) {
    logWorkspaceError("workspace-get", error);
    return jsonError("Unable to load the Young Learner workspace.", 500);
  }
}

async function readNoteBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest, routeContext: { params: Promise<{ studentId: string }> }) {
  const access = await getContext(request, routeContext);
  if (access.response || !access.context || !access.actor) return access.response;
  const body = await readNoteBody(request);
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note || note.length > 4000) return jsonError("Enter a note of up to 4000 characters.", 422);

  const { data, error } = await supabaseAdmin.from("young_learner_notes").insert({
    young_learner_id: access.context.studentId,
    class_id: access.context.classId,
    note,
    created_by: access.actor.id,
  }).select("*").single();
  if (error) {
    logWorkspaceError("note-create", error);
    return jsonError("Unable to save the note.", 500);
  }
  return NextResponse.json({ note: { ...data, created_by_name: getName(access.actor, "Staff member"), can_edit: true } }, { status: 201 });
}

export async function PATCH(request: NextRequest, routeContext: { params: Promise<{ studentId: string }> }) {
  const access = await getContext(request, routeContext);
  if (access.response || !access.context || !access.actor) return access.response;
  const body = await readNoteBody(request);
  const noteId = String(body?.note_id || "");
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!UUID_PATTERN.test(noteId) || !note || note.length > 4000) return jsonError("Enter a valid note of up to 4000 characters.", 422);

  const { data, error } = await supabaseAdmin.from("young_learner_notes").update({ note, updated_at: new Date().toISOString() })
    .eq("id", noteId).eq("young_learner_id", access.context.studentId).eq("created_by", access.actor.id).select("*").maybeSingle();
  if (error) {
    logWorkspaceError("note-update", error);
    return jsonError("Unable to update the note.", 500);
  }
  if (!data) return jsonError("You can edit only your own notes.", 403);
  return NextResponse.json({ note: { ...data, created_by_name: getName(access.actor, "Staff member"), can_edit: true } });
}

export async function DELETE(request: NextRequest, routeContext: { params: Promise<{ studentId: string }> }) {
  const access = await getContext(request, routeContext);
  if (access.response || !access.context || !access.actor) return access.response;
  const noteId = String(request.nextUrl.searchParams.get("noteId") || "");
  if (!UUID_PATTERN.test(noteId)) return jsonError("Note not found.", 404);
  const { data, error } = await supabaseAdmin.from("young_learner_notes").delete()
    .eq("id", noteId).eq("young_learner_id", access.context.studentId).eq("created_by", access.actor.id).select("id").maybeSingle();
  if (error) {
    logWorkspaceError("note-delete", error);
    return jsonError("Unable to delete the note.", 500);
  }
  if (!data) return jsonError("You can delete only your own notes.", 403);
  return NextResponse.json({ success: true });
}
