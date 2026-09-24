import "server-only";

import { getMadridSchoolDate } from "./schoolClosures";
import { supabaseAdmin } from "./supabaseAdmin";
import {
  formatExamWeekLevelLabel,
  type UpcomingCalendarGroup,
} from "./calendarGroups";
import {
  assignEffectiveFridayTutorialDutyDates,
  getFridayTutorialSessionTypeForDate,
  type FridayTutorialRotationClosure,
  type FridayTutorialRotationSettings,
} from "./fridayTutorialRotation";
import {
  FRIDAY_AT_6_DUTY_TYPES,
  FRIDAY_AT_6_DUTY_LABELS,
  getFridayAt6ResponsibilityLevelLabels,
} from "./fridayTutorials";
import { loadFridayTutorialRotationContext } from "./fridayTutorialRotationServer";

function madridMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function timeMinutes(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isFridayDate(value: string) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return false;
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() === 5;
}

function fridayAtSixHasEnded(date: string, today: string, nowMinutes: number) {
  return date === today && nowMinutes >= 19 * 60;
}

function displayTutorialLabel(value: unknown) {
  const raw = String(value || "").trim();
  if (raw === "kids2_junior3") return "Kids 2–Junior 3 Tutorial";
  if (raw === "junior4_teens_b1") return "Junior 4–Teens 1/B1 Tutorial";
  if (!raw) return "Friday Tutorial";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bB(\d)\b/gi, "B$1")
    .trim();
}

export function selectUpcomingFridayTutorialGroup(
  sessions: readonly {
    id: string;
    session_date: string;
    tutorial_group?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  }[],
  today: string,
  nowMinutes = madridMinutes()
) {
  const byDate = new Map<string, typeof sessions[number][]>();
  for (const session of sessions) {
    if (String(session.session_date) < today || !isFridayDate(String(session.session_date))) continue;
    const rows = byDate.get(String(session.session_date)) || [];
    rows.push(session);
    byDate.set(String(session.session_date), rows);
  }
  for (const date of [...byDate.keys()].sort()) {
    const rows = byDate.get(date) || [];
    const ended = date === today && rows.length > 0 && rows.every((row) => {
      const end = timeMinutes(row.end_time);
      return end !== null && end <= nowMinutes;
    });
    if (ended) continue;
    const sorted = [...rows].sort(
      (a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")) ||
        String(a.id).localeCompare(String(b.id))
    );
    return {
      id: `friday-tutorial-${date}`,
      kind: "friday_tutorial" as const,
      title: "Friday Tutorials",
      event_date: date,
      end_date: date,
      start_time: sorted[0]?.start_time || null,
      end_time: sorted.reduce<string | null>((latest, row) =>
        !latest || String(row.end_time || "") > latest ? row.end_time || null : latest, null),
      description: "Upcoming Friday tutorial and workshop sessions.",
      items: sorted.map((row) => ({
        id: String(row.id),
        label: displayTutorialLabel(row.tutorial_group),
        start_time: row.start_time || null,
        end_time: row.end_time || null,
      })),
    };
  }
  return null;
}

export function selectUpcomingExamWeekGroup(
  rows: readonly {
    id: string;
    level_name: string;
    start_date: string;
    end_date: string;
    unit_number?: number | null;
  }[],
  today: string
) {
  const periods = rows
    .filter((row) => row.start_date && row.end_date && row.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date));
  const first = periods[0];
  if (!first) return null;
  const matching = periods.filter((row) => row.start_date === first.start_date && row.end_date === first.end_date);
  const uniqueLevels = [...new Map(matching.map((row) => [row.level_name.trim().toLocaleLowerCase(), row])).values()]
    .sort((a, b) => a.level_name.localeCompare(b.level_name));
  return {
    id: `exam-week-${first.start_date}-${first.end_date}`,
    kind: "exam_week" as const,
    title: "Exam Week",
    event_date: first.start_date,
    end_date: first.end_date,
    start_time: null,
    end_time: null,
    description: "Syllabus exam week for the scheduled levels.",
    items: uniqueLevels.map((row) => ({
      id: String(row.id),
      label: formatExamWeekLevelLabel(row.level_name, row.unit_number),
      start_time: null,
      end_time: null,
    })),
  };
}

export function selectUpcomingFridayAt6Group(
  duties: readonly {
    id: string;
    effective_session_date: string;
    tutorial_group?: string | null;
    b1_teacher_id?: string | null;
    note?: string | null;
  }[],
  today: string,
  nowMinutes = madridMinutes(),
  activities: readonly {
    id: string;
    session_date: string;
    level_name?: string | null;
    activity_type?: string | null;
  }[] = []
) {
  const activityDates = activities
    .map((activity) => String(activity.session_date || ""))
    .filter((date) => date >= today && isFridayDate(date));
  const dutyDates = duties
    .map((duty) => duty.effective_session_date)
    .filter((date) => date >= today && isFridayDate(date));
  const dates = [...new Set([...activityDates, ...dutyDates])].sort();
  const selectedDate = dates.find((date) => !fridayAtSixHasEnded(date, today, nowMinutes));
  if (!selectedDate) return null;

  const duty = duties.find((row) => row.effective_session_date === selectedDate);
  const namedActivities = activities
    .filter((activity) => String(activity.session_date) === selectedDate)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  if (namedActivities.length > 0) {
    return {
      id: `friday-at-6-${selectedDate}`,
      kind: "friday_at_6" as const,
      title: "Cambridge Workshop",
      event_date: selectedDate,
      end_date: selectedDate,
      start_time: "18:00",
      end_time: "19:00",
      description: "Planned Cambridge exam-practice workshop.",
      items: namedActivities.map((activity) => ({
        id: String(activity.id),
        label: `${String(activity.level_name || "").trim()} ${String(activity.activity_type || "").trim()} Workshop`.trim(),
        start_time: "18:00",
        end_time: "19:00",
      })),
    };
  }

  if (!duty) return null;

  const group = String(duty.tutorial_group || "") as Parameters<typeof getFridayAt6ResponsibilityLevelLabels>[0];
  const items = [
    {
      id: `${duty.id}-general`,
      label: `${FRIDAY_AT_6_DUTY_LABELS[FRIDAY_AT_6_DUTY_TYPES.GENERAL]} — ${getFridayAt6ResponsibilityLevelLabels(group, [FRIDAY_AT_6_DUTY_TYPES.GENERAL]).join(", ") || "scheduled classes"}`,
      start_time: "18:00",
      end_time: "19:00",
    },
  ];
  if (duty.b1_teacher_id) {
    const b1Levels = getFridayAt6ResponsibilityLevelLabels(group, [FRIDAY_AT_6_DUTY_TYPES.B1]);
    if (b1Levels.length) {
      items.push({
        id: `${duty.id}-b1`,
        label: `${FRIDAY_AT_6_DUTY_LABELS[FRIDAY_AT_6_DUTY_TYPES.B1]} — ${b1Levels.join(", ")}`,
        start_time: "18:00",
        end_time: "19:00",
      });
    }
  }
  return {
    id: `friday-at-6-${selectedDate}`,
    kind: "friday_at_6" as const,
    title: "Friday @ 6",
    event_date: selectedDate,
    end_date: selectedDate,
    start_time: "18:00",
    end_time: "19:00",
    description: "Friday @ 6 tutorial and workshop duties.",
    items,
  };
}

export async function loadUpcomingCalendarGroups(today = getMadridSchoolDate()) {
  const [tutorialResult, dutyResult, activityResult, yearResult] = await Promise.all([
    supabaseAdmin
      .from("friday_tutorial_sessions")
      .select("id, session_date, tutorial_group, start_time, end_time")
      .gte("session_date", today)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true }),
    supabaseAdmin
      .from("friday_at_6_duties")
      .select("id, session_date, teacher_id, b1_teacher_id, active")
      .eq("active", true)
      .order("session_date", { ascending: true }),
    supabaseAdmin
      .from("friday_exam_practice_sessions")
      .select("id, session_date, level_name, activity_type, active")
      .eq("active", true)
      .gte("session_date", today)
      .order("session_date", { ascending: true }),
    supabaseAdmin
      .from("academic_years")
      .select("id")
      .lte("start_date", today)
      .gte("end_date", today)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (tutorialResult.error) throw tutorialResult.error;
  if (dutyResult.error) throw dutyResult.error;
  if (activityResult.error) throw activityResult.error;
  if (yearResult.error) throw yearResult.error;

  const tutorial = selectUpcomingFridayTutorialGroup(tutorialResult.data || [], today);
  const rotation = await loadFridayTutorialRotationContext();
  const effectiveDuties = rotation.settings
    ? assignEffectiveFridayTutorialDutyDates(
        rotation.settings as FridayTutorialRotationSettings,
        rotation.closures as FridayTutorialRotationClosure[],
        (dutyResult.data || []).map((row) => ({ ...row, session_date: String(row.session_date) }))
      )
    : [];
  const dutiesWithGroups = effectiveDuties.map((duty) => ({
    ...duty,
    tutorial_group: rotation.settings
      ? getFridayTutorialSessionTypeForDate(
          rotation.settings,
          duty.effective_session_date,
          rotation.closures
        )
      : null,
  }));
  const fridayAt6 = selectUpcomingFridayAt6Group(
    dutiesWithGroups,
    today,
    madridMinutes(),
    activityResult.data || []
  );
  let examWeek: UpcomingCalendarGroup | null = null;
  if (yearResult.data?.id) {
    const { data: syllabuses, error: syllabusError } = await supabaseAdmin
      .from("syllabuses")
      .select("id, level_id")
      .eq("academic_year_id", yearResult.data.id)
      .eq("status", "published");
    if (syllabusError) throw syllabusError;
    const syllabusIds = (syllabuses || []).map((row) => row.id).filter(Boolean);
    if (syllabusIds.length) {
      const { data: units, error: unitsError } = await supabaseAdmin
        .from("syllabus_units")
        .select("id, syllabus_id, sort_order, exam_week_start_date, exam_week_end_date")
        .in("syllabus_id", syllabusIds)
        .not("exam_week_start_date", "is", null)
        .not("exam_week_end_date", "is", null);
      if (unitsError) throw unitsError;
      const levelIds = [...new Set((syllabuses || []).map((row) => row.level_id).filter(Boolean))];
      const { data: levels, error: levelsError } = levelIds.length
        ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
        : { data: [], error: null };
      if (levelsError) throw levelsError;
      const syllabusLevels = new Map((syllabuses || []).map((row) => [String(row.id), row.level_id]));
      const levelNames = new Map((levels || []).map((row) => [String(row.id), String(row.name)]));
      examWeek = selectUpcomingExamWeekGroup(
        (units || []).map((unit) => ({
          id: String(unit.id),
          start_date: String(unit.exam_week_start_date),
          end_date: String(unit.exam_week_end_date),
          unit_number:
            Number.isInteger(Number(unit.sort_order)) && Number(unit.sort_order) > 0
              ? Number(unit.sort_order)
              : null,
          level_name: levelNames.get(String(syllabusLevels.get(String(unit.syllabus_id)))) || "Unknown level",
        })),
        today
      );
    }
  }
  return [tutorial, fridayAt6, examWeek].filter(Boolean) as UpcomingCalendarGroup[];
}
