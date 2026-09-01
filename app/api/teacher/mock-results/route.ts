import { NextRequest, NextResponse } from "next/server";

import {
  loadTeacherMockResults,
  MockResultWorkflowError,
  removeTeacherMockResult,
  saveTeacherMockResult,
  validateTeacherMockResultInput,
} from "../../../../lib/mockResultWorkflowServer";
import {
  authorizeTeacherHomeworkClass,
  TeacherHomeworkError,
} from "../../../../lib/teacherHomeworkServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function teacherContext(request: NextRequest, classId: string) {
  const context = await authorizeTeacherHomeworkClass(request, classId);
  if (context.role !== "teacher") {
    throw new TeacherHomeworkError("Teacher access required.", 403);
  }
  if (!context.supported) {
    throw new TeacherHomeworkError(
      "Mock Exam Results are only available for Cambridge classes.",
      400
    );
  }
  return context;
}

async function isEnrolled(classId: string, studentId: string) {
  const { data, error } = await supabaseAdmin
    .from("class_enrolments")
    .select("student_id")
    .eq("class_id", classId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function expectedWorkflowError(error: any) {
  const message = String(error?.message || "");
  const allowed = [
    "awaiting Admin review",
    "already exists",
    "not enrolled",
    "was not found",
    "Only Draft or Changes Required",
  ];
  return allowed.find((part) => message.includes(part)) ? message : "";
}

function handleError(error: unknown, action: string) {
  if (error instanceof TeacherHomeworkError) {
    return fail(error.message, error.status);
  }
  if (error instanceof MockResultWorkflowError) {
    return fail(error.message, error.status);
  }

  const expected = expectedWorkflowError(error);
  if (expected) return fail(expected, 409);

  console.error(`Teacher Mock Result ${action} failed:`, error);
  return fail(`Unable to ${action} the Mock Result.`, 500);
}

export async function GET(request: NextRequest) {
  try {
    const classId = String(request.nextUrl.searchParams.get("class_id") || "");
    const studentId = String(
      request.nextUrl.searchParams.get("student_id") || ""
    );
    if (!UUID_PATTERN.test(classId) || !UUID_PATTERN.test(studentId)) {
      return fail("A valid class and student are required.", 400);
    }

    await teacherContext(request, classId);
    if (!(await isEnrolled(classId, studentId))) {
      return fail("The student is not enrolled in this class.", 403);
    }

    const results = await loadTeacherMockResults(classId, studentId);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleError(error, "load");
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = validateTeacherMockResultInput(
      await request.json().catch(() => null)
    );
    const context = await teacherContext(request, input.classId);

    await saveTeacherMockResult(context.actorId, input);
    const results = await loadTeacherMockResults(input.classId, input.studentId);
    return NextResponse.json({
      message:
        input.action === "submit"
          ? "Mock Result submitted for Admin review."
          : "Mock Result draft saved.",
      results,
    });
  } catch (error) {
    return handleError(error, "save");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !["result_id", "class_id", "student_id"].includes(key)
      )
    ) {
      return fail("Invalid Mock Result removal request.", 400);
    }

    const resultId = String(body.result_id || "");
    const classId = String(body.class_id || "");
    const studentId = String(body.student_id || "");
    if (
      !UUID_PATTERN.test(resultId) ||
      !UUID_PATTERN.test(classId) ||
      !UUID_PATTERN.test(studentId)
    ) {
      return fail("A valid Mock Result is required.", 400);
    }

    const context = await teacherContext(request, classId);
    const outcome = await removeTeacherMockResult(context.actorId, resultId);
    const results = await loadTeacherMockResults(classId, studentId);
    return NextResponse.json({ outcome, results });
  } catch (error) {
    return handleError(error, "remove");
  }
}
