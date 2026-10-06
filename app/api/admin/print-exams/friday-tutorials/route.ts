import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import {
  isFridayTutorialCambridgeLevel,
  normalizeCambridgeLevel,
} from "../../../../../lib/fridayTutorialResults";
import { getFridayTutorialPrintWindow } from "../../../../../lib/printFridayTutorials";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

function one(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const window = getFridayTutorialPrintWindow();
    if (!window) {
      return NextResponse.json({ tutorials: [] });
    }
    const { data, error } = await supabaseAdmin
      .from("friday_exam_practice_sessions")
      .select(
        "id, session_date, level_name, activity_type, exam_part, pdf_url, cambridge_exam_part_id"
      )
      .eq("active", true)
      .eq("session_date", window.friday)
      .order("session_date", { ascending: true })
      .order("level_name", { ascending: true })
      .order("activity_type", { ascending: true });

    if (error) {
      console.error("Friday Tutorial print list failed:", {
        stage: "list-query",
        actorId: admin.userId,
      });
      return examBankJsonError(
        "Unable to load printable Friday Tutorial exams.",
        500
      );
    }

    const partIds = Array.from(
      new Set(
        (data || [])
          .map((tutorial) => tutorial.cambridge_exam_part_id)
          .filter(Boolean)
      )
    );

    const { data: parts, error: partError } = partIds.length
      ? await supabaseAdmin
          .from("cambridge_exam_parts")
          .select(`
            id,
            exam:cambridge_exam_sets!cambridge_exam_parts_exam_set_id_fkey (
              active,
              archived_at,
              level:levels!cambridge_exam_sets_level_id_fkey (
                name
              )
            )
          `)
          .in("id", partIds)
      : { data: [], error: null };

    if (partError) {
      return examBankJsonError(
        "Unable to load printable Friday Tutorial exams.",
        500
      );
    }

    const validPartLevel = new Map<string, string>();
    for (const part of parts || []) {
      const exam = one(part.exam);
      const level = one(exam?.level);
      if (exam?.active === true && !exam?.archived_at) {
        validPartLevel.set(
          String(part.id),
          normalizeCambridgeLevel(level?.name)
        );
      }
    }

    const validPartIds = Array.from(validPartLevel.keys());
    const { data: papers, error: paperError } = validPartIds.length
      ? await supabaseAdmin
          .from("cambridge_exam_part_resources")
          .select("exam_part_id, external_url")
          .in("exam_part_id", validPartIds)
          .eq("resource_type", "paper")
      : { data: [], error: null };

    if (paperError) {
      return examBankJsonError(
        "Unable to load printable Friday Tutorial exams.",
        500
      );
    }

    const paperByPartId = new Map(
      (papers || []).map((paper) => [
        String(paper.exam_part_id),
        paper.external_url,
      ])
    );
    const tutorials = (data || [])
      .filter((tutorial) => isFridayTutorialCambridgeLevel(tutorial.level_name))
      .map((tutorial) => {
        const partId = String(tutorial.cambridge_exam_part_id || "");
        const exactLevel = validPartLevel.get(partId);
        const exactPaper =
          exactLevel === normalizeCambridgeLevel(tutorial.level_name)
            ? paperByPartId.get(partId)
            : null;
        const pdfUrl =
          exactPaper ||
          (!tutorial.cambridge_exam_part_id ? tutorial.pdf_url : null);

        return {
          id: tutorial.id,
          session_date: tutorial.session_date,
          level_name: tutorial.level_name,
          activity_type: tutorial.activity_type,
          exam_part: tutorial.exam_part,
          has_exam_part: Boolean(tutorial.cambridge_exam_part_id),
          pdf_url: pdfUrl,
        };
      });

    return NextResponse.json({ tutorials });
  } catch {
    return examBankJsonError(
      "Unable to load printable Friday Tutorial exams.",
      500
    );
  }
}
