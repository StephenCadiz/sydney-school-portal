import { NextRequest, NextResponse } from "next/server";

import {
  assignmentRpcError,
  assignmentSelect,
  serializeAssignment,
  validateCreateAssignmentPayload,
} from "../../../../../lib/cambridgeExamAssignmentsServer";
import {
  getEligibleExamBankLevel,
  requireExamBankAdmin,
  examBankJsonError,
} from "../../../../../lib/cambridgeExamBankServer";
import {
  CAMBRIDGE_EXAM_ASSIGNMENT_STATUS_LABELS,
  isCambridgeExamCourseType,
  isEligibleCambridgeExamLevel,
} from "../../../../../lib/cambridgeExamBank";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const level = request.nextUrl.searchParams.get("level")?.trim().toUpperCase();
    const course = request.nextUrl.searchParams.get("course")?.trim().toLowerCase();
    const status = request.nextUrl.searchParams.get("status")?.trim().toLowerCase();
    const scope = request.nextUrl.searchParams.get("scope")?.trim().toLowerCase() || "current";
    const page = Number(request.nextUrl.searchParams.get("page") || "1");
    const pageSize = Number(request.nextUrl.searchParams.get("page_size") || "50");

    if (level && !isEligibleCambridgeExamLevel(level)) {
      return examBankJsonError("Invalid level filter.", 400);
    }
    if (course && !isCambridgeExamCourseType(course)) {
      return examBankJsonError("Invalid course filter.", 400);
    }
    if (status && !(status in CAMBRIDGE_EXAM_ASSIGNMENT_STATUS_LABELS)) {
      return examBankJsonError("Invalid assignment status filter.", 400);
    }
    if (!["current", "archived", "all"].includes(scope)) {
      return examBankJsonError("Invalid assignment scope filter.", 400);
    }
    if (!Number.isInteger(page) || page < 1 ||
        !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return examBankJsonError("Invalid pagination parameters.", 400);
    }

    const { data: pageResult, error: pageError } = await supabaseAdmin.rpc(
      "list_cambridge_exam_assignments_admin",
      {
        p_level: level || null,
        p_course_type: course || null,
        p_status: status || null,
        p_scope: scope,
        p_offset: (page - 1) * pageSize,
        p_limit: pageSize,
      }
    );
    if (pageError || !pageResult) {
      console.error("Exam assignment list failed:", { stage: "filtered-page", actorId: admin.userId });
      return examBankJsonError("Unable to load assigned exams.", 500);
    }
    const ids = Array.isArray(pageResult.ids) ? pageResult.ids : [];
    const total = Number(pageResult.total || 0);
    if (ids.length === 0) {
      return NextResponse.json({
        assignments: [],
        pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
      });
    }
    const { data, error } = await supabaseAdmin
      .from("cambridge_exam_assignments")
      .select(assignmentSelect)
      .in("id", ids);
    if (error) {
      console.error("Exam assignment list failed:", { stage: "page-details", actorId: admin.userId });
      return examBankJsonError("Unable to load assigned exams.", 500);
    }
    const byId = new Map((data || []).map((row: any) => [row.id, serializeAssignment(row)]));
    const assignments = ids.map((id: string) => byId.get(id)).filter(Boolean);
    return NextResponse.json({
      assignments,
      pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
    });
  } catch {
    return examBankJsonError("Unable to load assigned exams.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return examBankJsonError("Invalid JSON request body.", 400);
    }
    const validation = validateCreateAssignmentPayload(body);
    if (validation.error || !validation.value) {
      return examBankJsonError(validation.error || "Invalid assignment payload.", 422);
    }
    const input = validation.value;

    const { data: exam, error: examError } = await supabaseAdmin
      .from("cambridge_exam_sets")
      .select("id, exam_number, level_id")
      .eq("id", input.examSetId)
      .eq("active", true)
      .is("archived_at", null)
      .maybeSingle();
    if (examError) {
      console.error("Exam assignment preflight failed:", {
        stage: "exam-preflight",
        actorId: admin.userId,
        examSetId: input.examSetId,
      });
      return examBankJsonError("Unable to verify the selected exam.", 500);
    }
    if (!exam) return examBankJsonError("Active Cambridge exam not found.", 404);
    const level = await getEligibleExamBankLevel(Number(exam.level_id));
    if (!level) return examBankJsonError("Active Cambridge exam not found.", 404);

    const { data: createdIds, error: createError } = await supabaseAdmin.rpc(
      "create_cambridge_exam_assignments",
      {
        p_exam_set_id: input.examSetId,
        p_part_types: input.partTypes,
        p_course_types: input.courseTypes,
        p_release_date: input.releaseDate,
        p_due_date: input.dueDate,
        p_active: input.active,
        p_actor_id: admin.userId,
      }
    );
    if (createError || !createdIds) {
      const mapped = assignmentRpcError(createError, {
        level: level.name,
        examNumber: exam.exam_number,
      });
      if (mapped.status === 500) {
        console.error("Exam assignment create failed:", { stage: "atomic-create", actorId: admin.userId });
      }
      return examBankJsonError(mapped.message, mapped.status);
    }

    const { data: saved, error: loadError } = await supabaseAdmin
      .from("cambridge_exam_assignments")
      .select(assignmentSelect)
      .in("id", createdIds);
    if (loadError) {
      return examBankJsonError("Assignments were created but could not be reloaded.", 500);
    }
    return NextResponse.json(
      {
        success: true,
        message: `${createdIds.length} assignment${createdIds.length === 1 ? "" : "s"} created.`,
        assignments: (saved || []).map(serializeAssignment),
      },
      { status: 201 }
    );
  } catch {
    return examBankJsonError("Unable to create exam assignments.", 500);
  }
}
