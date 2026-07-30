import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

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

    const { data, error } = await supabaseAdmin
      .from("friday_exam_practice_sessions")
      .select(
        "id, session_date, level_name, activity_type, exam_part, pdf_url"
      )
      .eq("active", true)
      .gte("session_date", window.monday)
      .lte("session_date", window.friday)
      .not("pdf_url", "is", null)
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

    const tutorials = (data || []).filter(
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
