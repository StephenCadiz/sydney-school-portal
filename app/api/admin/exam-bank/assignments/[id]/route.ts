import { NextRequest, NextResponse } from "next/server";

import {
  assignmentSelect,
  isAssignmentUuid,
  restoreAssignmentRpcError,
  serializeAssignment,
  validateUpdateAssignmentPayload,
} from "../../../../../../lib/cambridgeExamAssignmentsServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

async function loadAssignment(id: string) {
  return supabaseAdmin
    .from("cambridge_exam_assignments")
    .select(assignmentSelect)
    .eq("id", id)
    .maybeSingle();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;
    const id = (await context.params).id;
    if (!isAssignmentUuid(id)) return examBankJsonError("Invalid assignment identifier.", 400);
    const { data, error } = await loadAssignment(id);
    if (error) return examBankJsonError("Unable to load the assignment.", 500);
    if (!data) return examBankJsonError("Assignment not found.", 404);
    return NextResponse.json({ assignment: serializeAssignment(data) });
  } catch {
    return examBankJsonError("Unable to load the assignment.", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;
    const id = (await context.params).id;
    if (!isAssignmentUuid(id)) return examBankJsonError("Invalid assignment identifier.", 400);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return examBankJsonError("Invalid JSON request body.", 400);
    }

    if (body && typeof body === "object" && !Array.isArray(body) &&
        Object.keys(body).length === 1 &&
        ((body as any).action === "archive" || (body as any).action === "restore")) {
      const restore = (body as any).action === "restore";
      if (restore) {
        const { data: restoredId, error: restoreError } = await supabaseAdmin.rpc(
          "restore_cambridge_exam_assignment",
          { p_assignment_id: id, p_actor_id: admin.userId }
        );
        if (restoreError || !restoredId) {
          const mapped = restoreAssignmentRpcError(restoreError);
          if (mapped.status === 500) {
            console.error("Assignment restore failed:", {
              stage: "atomic-restore",
              actorId: admin.userId,
              assignmentId: id,
            });
          }
          return examBankJsonError(mapped.message, mapped.status);
        }
      } else {
        const { data, error } = await supabaseAdmin
          .from("cambridge_exam_assignments")
          .update({
            active: false,
            archived_at: new Date().toISOString(),
            updated_by: admin.userId,
          })
          .eq("id", id)
          .select("id")
          .maybeSingle();
        if (error) {
          console.error("Assignment status update failed:", { stage: "archive", actorId: admin.userId, assignmentId: id });
          return examBankJsonError("Unable to archive the assignment.", 500);
        }
        if (!data) return examBankJsonError("Assignment not found.", 404);
      }
    } else {
      const validation = validateUpdateAssignmentPayload(body);
      if (validation.error || !validation.value) {
        return examBankJsonError(validation.error || "Invalid assignment payload.", 422);
      }
      const input = validation.value;
      const { data: current, error: currentError } = await supabaseAdmin
        .from("cambridge_exam_assignments")
        .select("id, archived_at")
        .eq("id", id)
        .maybeSingle();
      if (currentError) return examBankJsonError("Unable to verify the assignment.", 500);
      if (!current) return examBankJsonError("Assignment not found.", 404);
      if (current.archived_at) {
        return examBankJsonError("Restore this assignment before editing it.", 409);
      }
      const { data, error } = await supabaseAdmin
        .from("cambridge_exam_assignments")
        .update({
          release_date: input.releaseDate,
          due_date: input.dueDate,
          active: input.active,
          updated_by: admin.userId,
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("Assignment update failed:", { stage: "update", actorId: admin.userId, assignmentId: id });
        return examBankJsonError("Unable to update the assignment.", 500);
      }
      if (!data) return examBankJsonError("Assignment not found.", 404);
    }

    const { data: updated, error: loadError } = await loadAssignment(id);
    if (loadError || !updated) return examBankJsonError("Unable to reload the assignment.", 500);
    return NextResponse.json({ success: true, assignment: serializeAssignment(updated) });
  } catch {
    return examBankJsonError("Unable to update the assignment.", 500);
  }
}
