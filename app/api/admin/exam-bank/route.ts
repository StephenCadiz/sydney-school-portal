import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  examBankSelect,
  getEligibleExamBankLevel,
  getExamPartsPayload,
  requireExamBankAdmin,
  serializeExamBankRow,
  validateExamBankPayload,
} from "../../../../lib/cambridgeExamBankServer";
import { isEligibleCambridgeExamLevel } from "../../../../lib/cambridgeExamBank";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function isDuplicateError(error: any) {
  return error?.code === "23505";
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const levelFilter = request.nextUrl.searchParams
      .get("level")
      ?.trim()
      .toUpperCase();
    const statusFilter = request.nextUrl.searchParams.get("status")?.trim();

    if (levelFilter && !isEligibleCambridgeExamLevel(levelFilter)) {
      return examBankJsonError("Invalid Cambridge level filter.", 400);
    }

    if (
      statusFilter &&
      statusFilter !== "active" &&
      statusFilter !== "archived" &&
      statusFilter !== "all"
    ) {
      return examBankJsonError("Invalid Exam Bank status filter.", 400);
    }

    let query = supabaseAdmin
      .from("cambridge_exam_sets")
      .select(examBankSelect)
      .order("exam_number", { ascending: true })
      .limit(200);

    if (statusFilter === "active" || !statusFilter) {
      query = query.eq("active", true).is("archived_at", null);
    } else if (statusFilter === "archived") {
      query = query.not("archived_at", "is", null);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Exam Bank list failed:", {
        stage: "list-query",
        actorId: admin.userId,
      });
      return examBankJsonError("Unable to load Cambridge exams.", 500);
    }

    const exams = (data || [])
      .map(serializeExamBankRow)
      .filter((exam) => !levelFilter || exam.level.name === levelFilter)
      .sort(
        (first, second) =>
          first.level.name.localeCompare(second.level.name) ||
          first.exam_number - second.exam_number
      );

    return NextResponse.json({ exams });
  } catch {
    return examBankJsonError("Unable to load Cambridge exams.", 500);
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

    const { data: duplicate, error: duplicateError } = await supabaseAdmin
      .from("cambridge_exam_sets")
      .select("id")
      .eq("level_id", input.levelId)
      .eq("exam_number", input.examNumber)
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

    const { data: examId, error: saveError } = await supabaseAdmin.rpc(
      "save_cambridge_exam_bank_exam",
      {
        p_exam_set_id: null,
        p_level_id: input.levelId,
        p_exam_number: input.examNumber,
        p_title: input.title,
        p_active: true,
        p_parts: getExamPartsPayload(input.parts),
        p_actor_id: admin.userId,
      }
    );

    if (saveError || !examId) {
      if (isDuplicateError(saveError)) {
        return examBankJsonError(
          `An Exam Bank entry already exists for ${level.name} Exam ${input.examNumber}.`,
          409
        );
      }

      console.error("Exam Bank create failed:", {
        stage: "atomic-save",
        actorId: admin.userId,
      });
      return examBankJsonError("Unable to save the Cambridge exam.", 500);
    }

    const { data: savedExam, error: loadError } = await supabaseAdmin
      .from("cambridge_exam_sets")
      .select(examBankSelect)
      .eq("id", examId)
      .single();

    if (loadError || !savedExam) {
      return examBankJsonError(
        "The exam was saved, but its updated details could not be loaded.",
        500
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Cambridge exam saved.",
        exam: serializeExamBankRow(savedExam),
      },
      { status: 201 }
    );
  } catch {
    return examBankJsonError("Unable to save the Cambridge exam.", 500);
  }
}
