import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import { normalizeCambridgeLevel } from "../../../../../lib/fridayTutorialResults";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  getFridayTutorialSessionTypeForDate,
  isB1FridayTutorialSession,
} from "../../../../../lib/fridayTutorialRotation";
import { loadFridayTutorialRotationContext } from "../../../../../lib/fridayTutorialRotationServer";

function one(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function getMadridDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getTutorialWeekWindow() {
  const today = getMadridDateString();
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();

  if (weekday === 0 || weekday === 6) {
    return null;
  }

  const monday = addDays(today, 1 - weekday);
  return { monday, friday: addDays(monday, 4) };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const window = getTutorialWeekWindow();
    if (!window) {
      return NextResponse.json({ tutorials: [] });
    }
    const rotation = await loadFridayTutorialRotationContext({
      endDate: window.friday,
    });
    const tutorialGroup = getFridayTutorialSessionTypeForDate(
      rotation.settings || {},
      window.friday,
      rotation.closures
    );
    if (!tutorialGroup) {
      return NextResponse.json({ tutorials: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("friday_exam_practice_sessions")
      .select(
        "id, session_date, level_name, activity_type, exam_part, pdf_url, cambridge_exam_part_id"
      )
      .eq("active", true)
      .gte("session_date", window.monday)
      .lte("session_date", window.friday)
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
      .filter(
        (tutorial) =>
          normalizeCambridgeLevel(tutorial.level_name) !== "B1" ||
          isB1FridayTutorialSession(tutorialGroup)
      )
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
          pdf_url: pdfUrl,
        };
      })
      .filter(
        (tutorial) =>
          typeof tutorial.pdf_url === "string" && tutorial.pdf_url.trim()
      );

    return NextResponse.json({ tutorials });
  } catch {
    return examBankJsonError(
      "Unable to load printable Friday Tutorial exams.",
      500
    );
  }
}
