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

  // Syllabus units can have slightly different exam-week end dates while
  // sharing the same start date. They still belong to one calendar entry.
  const matching = periods.filter((row) => row.start_date === first.start_date);
  const groupEndDate = matching.reduce(
    (latest, row) => (row.end_date > latest ? row.end_date : latest),
    first.end_date
  );
  const uniqueLevels = [...new Map(matching.map((row) => [row.level_name.trim().toLocaleLowerCase(), row])).values()]
    .sort((a, b) => a.level_name.localeCompare(b.level_name));
  return {
    id: `exam-week-${first.start_date}-${groupEndDate}`,
    kind: "exam_week" as const,
    title: "Exam Week",
    event_date: first.start_date,
    end_date: groupEndDate,
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
