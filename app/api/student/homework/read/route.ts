import { NextRequest, NextResponse } from "next/server";

import {
  authenticateStudentHomework,
  loadVisibleAssignmentIds,
  resolveStudentHomeworkContext,
} from "../../../../../lib/studentHomeworkServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ASSIGNMENT_READS = 100;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateStudentHomework(request);
  if (auth.error) return jsonError(auth.error, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "assignment_ids")) {
    return jsonError("Invalid assignment read payload.", 400);
  }
  const assignmentIds = (body as { assignment_ids?: unknown }).assignment_ids;
  if (!Array.isArray(assignmentIds) || assignmentIds.length > MAX_ASSIGNMENT_READS ||
      assignmentIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id)) ||
      new Set(assignmentIds).size !== assignmentIds.length) {
    return jsonError("Assignment IDs must be a unique bounded UUID list.", 400);
  }
  if (assignmentIds.length === 0) {
    return NextResponse.json({ success: true, marked_count: 0 });
  }

  const resolved = await resolveStudentHomeworkContext(auth.studentId);
  if (resolved.error || !resolved.context) {
    return jsonError(resolved.error || "Unable to verify homework access.", resolved.status);
  }

  try {
    const visibleIds = new Set(await loadVisibleAssignmentIds(resolved.context));
    if (assignmentIds.some((id) => !visibleIds.has(id))) {
      return jsonError(
        "One or more assignments are not available for this student.",
        403
      );
    }

    const viewedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("student_assignment_homework_reads")
      .upsert(
        assignmentIds.map((assignmentId) => ({
          student_id: auth.studentId,
          cambridge_exam_assignment_id: assignmentId,
          viewed_at: viewedAt,
        })),
        { onConflict: "student_id,cambridge_exam_assignment_id" }
      );
    if (error) throw error;
    return NextResponse.json({
      success: true,
      marked_count: assignmentIds.length,
    });
  } catch {
    console.error("Student assignment read update failed:", {
      stage: "assignment-read",
      actorId: auth.studentId,
      classId: resolved.context.classId,
    });
    return jsonError("Unable to update homework read state.", 500);
  }
}
