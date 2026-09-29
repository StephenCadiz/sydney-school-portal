const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type EffectiveClassDateRange = {
  startDate: string;
  endDate: string;
};

export type ClassDateOverride = {
  startDate: string | null;
  endDate: string | null;
};

function validDate(value: unknown) {
  const text = String(value || "").trim();
  if (!DATE_PATTERN.test(text)) return "";
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? text
    : "";
}

export function getEffectiveClassDateRange(input: {
  academicYearStart?: unknown;
  academicYearEnd?: unknown;
  classStart?: unknown;
  classEnd?: unknown;
}): EffectiveClassDateRange | null {
  const academicStart = validDate(input.academicYearStart);
  const academicEnd = validDate(input.academicYearEnd);
  const classStart = validDate(input.classStart);
  const classEnd = validDate(input.classEnd);
  // Class dates are optional overrides.  A missing side inherits that side
  // from the academic term; an explicit side is authoritative even when it
  // falls outside the term.
  const startDate = classStart || academicStart;
  const endDate = classEnd || academicEnd;
  if (!startDate || !endDate) return null;
  return endDate >= startDate ? { startDate, endDate } : null;
}

export function validateClassDateOverrides(input: {
  startDate?: unknown;
  endDate?: unknown;
  academicYearStart?: unknown;
  academicYearEnd?: unknown;
  requireBoth?: boolean;
}): { value: ClassDateOverride | null; error: string | null } {
  const startDate = validDate(input.startDate) || null;
  const endDate = validDate(input.endDate) || null;
  const hasInvalidStart = input.startDate != null && String(input.startDate).trim() !== "" && !startDate;
  const hasInvalidEnd = input.endDate != null && String(input.endDate).trim() !== "" && !endDate;
  if (hasInvalidStart || hasInvalidEnd) {
    return { value: null, error: "Enter valid class dates." };
  }
  if (input.requireBoth && (!startDate || !endDate)) {
    return { value: null, error: "Start date and end date are required for this class type." };
  }
  const academicStart = validDate(input.academicYearStart);
  const academicEnd = validDate(input.academicYearEnd);
  const effectiveStart = startDate || academicStart;
  const effectiveEnd = endDate || academicEnd;
  if (!effectiveStart || !effectiveEnd) {
    return { value: null, error: "Configure an academic term or both effective class dates." };
  }
  if (effectiveEnd < effectiveStart) {
    return { value: null, error: "The effective class start date must not be after the effective end date." };
  }
  return { value: { startDate, endDate }, error: null };
}

export function isDateWithinEffectiveClassRange(
  date: unknown,
  range: EffectiveClassDateRange | null
) {
  const value = validDate(date);
  return Boolean(
    value && range && value >= range.startDate && value <= range.endDate
  );
}
