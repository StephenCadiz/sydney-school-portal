export const SCHOOL_CLOSURE_TYPES = [
  "public_holiday",
  "school_holiday",
  "other",
] as const;

export type SchoolClosureType = (typeof SCHOOL_CLOSURE_TYPES)[number];

export type SchoolClosure = {
  id: string;
  name: string;
  closure_type: SchoolClosureType;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SchoolClosureSummary = Pick<
  SchoolClosure,
  "id" | "name" | "closure_type" | "start_date" | "end_date" | "notes"
>;

export const SCHOOL_CLOSURE_TYPE_LABELS: Record<SchoolClosureType, string> = {
  public_holiday: "Public holiday",
  school_holiday: "School holiday",
  other: "Other",
};

export function getMadridSchoolDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function findSchoolClosure<T extends Pick<SchoolClosure, "start_date" | "end_date">>(
  date: string,
  closures: readonly T[]
) {
  return (
    closures.find(
      (closure) => closure.start_date <= date && closure.end_date >= date
    ) || null
  );
}

export function isDateSchoolClosed(
  date: string,
  closures: readonly Pick<SchoolClosure, "start_date" | "end_date">[]
) {
  return Boolean(findSchoolClosure(date, closures));
}
