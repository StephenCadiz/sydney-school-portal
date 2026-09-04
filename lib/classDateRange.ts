const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type EffectiveClassDateRange = {
  startDate: string;
  endDate: string;
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
  const hasAcademicRange = Boolean(academicStart && academicEnd);
  const hasClassRange = Boolean(classStart && classEnd);
  const starts = [
    hasAcademicRange ? academicStart : "",
    hasClassRange ? classStart : "",
  ].filter(Boolean);
  const ends = [
    hasAcademicRange ? academicEnd : "",
    hasClassRange ? classEnd : "",
  ].filter(Boolean);
  if (!starts.length || !ends.length) return null;

  const startDate = starts.reduce((latest, date) =>
    date > latest ? date : latest
  );
  const endDate = ends.reduce((earliest, date) =>
    date < earliest ? date : earliest
  );
  return endDate >= startDate ? { startDate, endDate } : null;
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
