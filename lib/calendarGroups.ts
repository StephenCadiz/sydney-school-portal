export type UpcomingCalendarGroupItem = {
  id: string;
  label: string;
  start_time: string | null;
  end_time: string | null;
};

export type UpcomingCalendarGroup = {
  id: string;
  kind: "friday_tutorial" | "friday_at_6" | "exam_week";
  title: string;
  event_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  description: string;
  items: UpcomingCalendarGroupItem[];
};

export function formatExamWeekLevelLabel(
  levelName: unknown,
  unitNumber: unknown
) {
  const level = String(levelName ?? "").trim() || "Unknown level";
  const numericUnit =
    typeof unitNumber === "number" ? unitNumber : Number(unitNumber);
  const hasConfiguredUnit =
    Number.isInteger(numericUnit) && numericUnit > 0;
  return `${level} — ${hasConfiguredUnit ? `Unit ${numericUnit}` : "Unit not specified"}`;
}
