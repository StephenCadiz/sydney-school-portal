import { NextRequest, NextResponse } from "next/server";

import { getHomeworkSkillLabel } from "../../../../../../../lib/homework";
import { supabaseAdmin } from "../../../../../../../lib/supabaseAdmin";
import {
  authorizeTeacherHomeworkClass,
  loadAuthorizedAssignment,
  loadTeacherClassHomework,
  TeacherHomeworkError,
} from "../../../../../../../lib/teacherHomeworkServer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BODY_KEYS = new Set(["student_id", "assignment_id", "percentage", "comments"]);
const RESULT_COLUMNS =
  "id, student_id, class_id, result_type, title, skill, percentage, comments, cambridge_exam_assignment_id, published_at, exam_date";
const CROSS_CLASS_MESSAGE =
  "This homework result belongs to another class and cannot be moved automatically.";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function contextFor(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  const { id } = await routeContext.params;
  return authorizeTeacherHomeworkClass(request, id);
}

async function enrolled(classId: string, studentId: string) {
  const { data, error } = await supabaseAdmin
    .from("class_enrolments")
    .select("student_id")
    .eq("class_id", classId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const context = await contextFor(request, routeContext);
    const studentId = String(request.nextUrl.searchParams.get("student_id") || "");
    if (!UUID.test(studentId)) return fail("A valid student is required.", 400);
    if (!(await enrolled(context.classId, studentId))) {
      return fail("The student is not enrolled in this class.", 403);
    }
    const homework = await loadTeacherClassHomework(context);
    const assignmentIds = homework.homework
      .filter((item) => item.source === "assignment")
      .map((item) => item.id);
    if (!assignmentIds.length) return NextResponse.json({ results: [] });
    const { data, error } = await supabaseAdmin
      .from("results")
      .select(RESULT_COLUMNS)
      .eq("student_id", studentId)
      .eq("class_id", context.classId)
      .eq("result_type", "homework")
      .in("cambridge_exam_assignment_id", assignmentIds)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("exam_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ results: data || [] });
  } catch (error) {
    if (error instanceof TeacherHomeworkError) return fail(error.message, error.status);
    console.error("Assignment homework results load failed.");
    return fail("Unable to load assignment results.", 500);
  }
}

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const context = await contextFor(request, routeContext);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return fail("Invalid request.", 400);
    if (Object.keys(body).some((key) => !BODY_KEYS.has(key))) {
      return fail("The request contains unsupported fields.", 400);
    }
    const studentId = String(body.student_id || "");
    const assignmentId = String(body.assignment_id || "");
    const percentage = body.percentage;
    if (!UUID.test(studentId) || !UUID.test(assignmentId)) {
      return fail("A valid student and assignment are required.", 400);
    }
    if (
      typeof percentage !== "number" ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      return fail("Percentage must be between 0 and 100.", 400);
    }
    if (
      body.comments !== undefined &&
      body.comments !== null &&
      typeof body.comments !== "string"
    ) {
      return fail("Comments must be text or null.", 400);
    }
    if (
      typeof body.comments === "string" &&
      body.comments.trim().length > 5000
    ) {
      return fail("Comments must be 5000 characters or fewer.", 400);
    }
    if (!(await enrolled(context.classId, studentId))) {
      return fail("The student is not enrolled in this class.", 403);
    }
    const assignment = await loadAuthorizedAssignment(context, assignmentId);
    const title = `Exam ${Number(assignment.exam.exam_number)} · ${getHomeworkSkillLabel(
      context.level,
      assignment.partType
    )}`;
    const comments =
      typeof body.comments === "string" && body.comments.trim()
        ? body.comments.trim()
        : null;
    const updateValues = {
      teacher_id: context.actorId,
      result_type: "homework",
      cambridge_exam_assignment_id: assignmentId,
      skill: assignment.partType,
      percentage,
      title,
      comments,
    };
    const insertValues = {
      student_id: studentId,
      class_id: context.classId,
      ...updateValues,
    };
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("results")
      .select("id, class_id")
      .eq("student_id", studentId)
      .eq("cambridge_exam_assignment_id", assignmentId)
      .eq("result_type", "homework")
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && String(existing.class_id) !== context.classId) {
      return fail(CROSS_CLASS_MESSAGE, 409);
    }
    let saved = existing
      ? await supabaseAdmin
          .from("results")
          .update(updateValues)
          .eq("id", existing.id)
          .eq("student_id", studentId)
          .eq("class_id", context.classId)
          .eq("result_type", "homework")
          .eq("cambridge_exam_assignment_id", assignmentId)
          .select(RESULT_COLUMNS)
          .single()
      : await supabaseAdmin
          .from("results")
          .insert(insertValues)
          .select(RESULT_COLUMNS)
          .single();
    if (saved.error?.code === "23505") {
      const conflict = await supabaseAdmin
        .from("results")
        .select("id, class_id")
        .eq("student_id", studentId)
        .eq("cambridge_exam_assignment_id", assignmentId)
        .eq("result_type", "homework")
        .maybeSingle();
      if (conflict.error) throw conflict.error;
      if (!conflict.data) throw saved.error;
      if (String(conflict.data.class_id) !== context.classId) {
        return fail(CROSS_CLASS_MESSAGE, 409);
      }
      saved = await supabaseAdmin
        .from("results")
        .update(updateValues)
        .eq("id", conflict.data.id)
        .eq("student_id", studentId)
        .eq("class_id", context.classId)
        .eq("result_type", "homework")
        .eq("cambridge_exam_assignment_id", assignmentId)
        .select(RESULT_COLUMNS)
        .single();
    }
    if (saved.error) throw saved.error;
    return NextResponse.json({ result: saved.data });
  } catch (error) {
    if (error instanceof TeacherHomeworkError) return fail(error.message, error.status);
    console.error("Assignment homework result save failed.");
    return fail("Unable to save assignment result.", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const context = await contextFor(request, routeContext);
    const body = await request.json().catch(() => null);
    const studentId = String(body?.student_id || "");
    const assignmentId = String(body?.assignment_id || "");
    if (
      !body ||
      Object.keys(body).some((key) => !["student_id", "assignment_id"].includes(key)) ||
      !UUID.test(studentId) ||
      !UUID.test(assignmentId)
    ) {
      return fail("A valid student and assignment are required.", 400);
    }
    if (!(await enrolled(context.classId, studentId))) {
      return fail("The student is not enrolled in this class.", 403);
    }
    await loadAuthorizedAssignment(context, assignmentId);
    const { data: result, error: loadError } = await supabaseAdmin
      .from("results")
      .select("id, class_id, student_id, cambridge_exam_assignment_id")
      .eq("class_id", context.classId)
      .eq("student_id", studentId)
      .eq("result_type", "homework")
      .eq("cambridge_exam_assignment_id", assignmentId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!result) return fail("Assignment result was not found.", 404);
    const { error } = await supabaseAdmin
      .from("results")
      .delete()
      .eq("id", result.id)
      .eq("class_id", context.classId)
      .eq("student_id", studentId)
      .eq("result_type", "homework")
      .eq("cambridge_exam_assignment_id", assignmentId);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof TeacherHomeworkError) return fail(error.message, error.status);
    console.error("Assignment homework result delete failed.");
    return fail("Unable to delete assignment result.", 500);
  }
}
