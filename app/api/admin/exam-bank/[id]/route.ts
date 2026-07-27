import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  examBankSelect,
  getEligibleExamBankLevel,
  getExamPartsPayload,
  requireExamBankAdmin,
  serializeExamBankRow,
  validateExamBankPayload,
} from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidExamId(value: string) {
  return UUID_PATTERN.test(value);
}

async function loadExam(examId: string) {
  return supabaseAdmin
    .from("cambridge_exam_sets")
    .select(examBankSelect)
    .eq("id", examId)
    .single();
}

function isDuplicateError(error: any) {
  return error?.code === "23505";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const examId = (await context.params).id;
    if (!isValidExamId(examId)) {
      return examBankJsonError("Invalid Exam Bank identifier.", 400);
    }

    const { data, error } = await loadExam(examId);
    if (error || !data) {
      return examBankJsonError("Cambridge exam not found.", 404);
    }

    return NextResponse.json({ exam: serializeExamBankRow(data) });
  } catch {
    return examBankJsonError("Unable to load the Cambridge exam.", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const examId = (await context.params).id;
    if (!isValidExamId(examId)) {
      return examBankJsonError("Invalid Exam Bank identifier.", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return examBankJsonError("Invalid JSON request body.", 400);
    }

    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      Object.keys(body).length === 1 &&
      ((body as Record<string, unknown>).action === "archive" ||
        (body as Record<string, unknown>).action === "restore")
    ) {
      const archive = (body as Record<string, unknown>).action === "archive";
      const { data, error } = await supabaseAdmin
        .from("cambridge_exam_sets")
        .update({
          active: !archive,
          archived_at: archive ? new Date().toISOString() : null,
          updated_by: admin.userId,
        })
        .eq("id", examId)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("Exam Bank status update failed:", {
          stage: "status-update",
          actorId: admin.userId,
          examId,
        });
        return examBankJsonError("Unable to change the exam status.", 500);
      }

      if (!data) {
        return examBankJsonError("Cambridge exam not found.", 404);
      }

      const { data: updatedExam, error: loadError } = await loadExam(examId);
      if (loadError || !updatedExam) {
        return examBankJsonError(
          "The exam status changed, but its details could not be loaded.",
          500
        );
      }

      return NextResponse.json({
        success: true,
        message: archive ? "Exam archived." : "Exam restored.",
        exam: serializeExamBankRow(updatedExam),
      });
    }

    const validation = validateExamBankPayload(body);
    if (validation.error || !validation.value) {
      return examBankJsonError(
        validation.error || "Invalid Exam Bank payload.",
        422
      );
    }

    const input = validation.value;
    const level = await getEligibleExamBankLevel(input.levelId);
    if (!level) {
      return examBankJsonError("Choose a valid Cambridge level.", 422);
    }

    const { data: currentExam, error: currentError } = await supabaseAdmin
      .from("cambridge_exam_sets")
      .select("id, archived_at")
      .eq("id", examId)
      .single();

    if (currentError || !currentExam) {
      return examBankJsonError("Cambridge exam not found.", 404);
    }

    const { data: duplicate, error: duplicateError } = await supabaseAdmin
      .from("cambridge_exam_sets")
      .select("id")
      .eq("level_id", input.levelId)
      .eq("exam_number", input.examNumber)
      .neq("id", examId)
      .limit(1)
      .maybeSingle();

    if (duplicateError) {
      return examBankJsonError("Unable to validate the exam number.", 500);
    }

    if (duplicate) {
      return examBankJsonError(
        `An Exam Bank entry already exists for ${level.name} Exam ${input.examNumber}.`,
        409
      );
    }

    const { data: savedId, error: saveError } = await supabaseAdmin.rpc(
      "save_cambridge_exam_bank_exam",
      {
        p_exam_set_id: examId,
        p_level_id: input.levelId,
        p_exam_number: input.examNumber,
        p_title: input.title,
        p_active: currentExam.archived_at ? false : true,
        p_parts: getExamPartsPayload(input.parts),
        p_actor_id: admin.userId,
      }
    );

    if (saveError || !savedId) {
      if (isDuplicateError(saveError)) {
        return examBankJsonError(
          `An Exam Bank entry already exists for ${level.name} Exam ${input.examNumber}.`,
          409
        );
      }

      console.error("Exam Bank update failed:", {
        stage: "atomic-save",
        actorId: admin.userId,
        examId,
      });
      return examBankJsonError("Unable to save the Cambridge exam.", 500);
    }

    const { data: updatedExam, error: loadError } = await loadExam(examId);
    if (loadError || !updatedExam) {
      return examBankJsonError(
        "The exam was saved, but its updated details could not be loaded.",
        500
      );
    }

    return NextResponse.json({
      success: true,
      message: "Cambridge exam updated.",
      exam: serializeExamBankRow(updatedExam),
    });
  } catch {
    return examBankJsonError("Unable to update the Cambridge exam.", 500);
  }
}
