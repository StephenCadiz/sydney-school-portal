export const GLOBAL_LEVEL_ORDER = [
  "Pre-Kids 1",
  "Pre-Kids 2",
  "Pre-Kids 3",
  "Kids 1",
  "Kids 2",
  "Junior 1",
  "Junior 2",
  "Junior 3",
  "Junior 4",
  "Teens 1",
  "Support Classes",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;

const normalizedLevelOrder = GLOBAL_LEVEL_ORDER.map((level) => level.toLocaleLowerCase());

export function normalizeClassOrderText(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function getGlobalLevelRank(levelName: unknown) {
  const rank = normalizedLevelOrder.indexOf(normalizeClassOrderText(levelName));
  return rank === -1 ? GLOBAL_LEVEL_ORDER.length : rank;
}

export function getScheduleDayGroup(days: unknown) {
  const value = normalizeClassOrderText(days);
  if (/\b(mon|monday|wed|wednesday|fri|friday)\b/.test(value)) return 0;
  if (/\b(tue|tues|tuesday|thu|thur|thurs|thursday)\b/.test(value)) return 1;
  return 2;
}

function timeRank(value: unknown) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
}

export type ClassOrderingRow = {
  level_name?: unknown;
  levels?: { name?: unknown } | null;
  days?: unknown;
  start_time?: unknown;
  class_name?: unknown;
  className?: unknown;
  class_label?: unknown;
  option_label?: unknown;
  class_id?: unknown;
  id?: unknown;
};

export function getClassOrderingLevelName(row: ClassOrderingRow) {
  return row.level_name ?? row.levels?.name ?? "";
}

export function compareClassesByGlobalOrder(first: ClassOrderingRow, second: ClassOrderingRow) {
  const levelDifference = getGlobalLevelRank(getClassOrderingLevelName(first)) - getGlobalLevelRank(getClassOrderingLevelName(second));
  if (levelDifference) return levelDifference;

  const dayDifference = getScheduleDayGroup(first.days) - getScheduleDayGroup(second.days);
  if (dayDifference) return dayDifference;

  const timeDifference = timeRank(first.start_time) - timeRank(second.start_time);
  if (timeDifference) return timeDifference;

  const nameDifference = normalizeClassOrderText(first.class_name ?? first.className ?? first.class_label ?? first.option_label).localeCompare(
    normalizeClassOrderText(second.class_name ?? second.className ?? second.class_label ?? second.option_label),
    undefined,
    { numeric: true, sensitivity: "base" }
  );
  if (nameDifference) return nameDifference;
  return normalizeClassOrderText(first.id ?? first.class_id).localeCompare(normalizeClassOrderText(second.id ?? second.class_id), undefined, { numeric: true });
}

export function sortClassesByGlobalOrder<T extends ClassOrderingRow>(rows: T[]) {
  return [...rows].sort(compareClassesByGlobalOrder);
}
