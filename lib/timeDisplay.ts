/**
 * Return a portal-facing clock value without database seconds.
 *
 * Supabase time columns may arrive as either HH:mm or HH:mm:ss. Some clients
 * also serialize fractional seconds or an offset. All user-facing
 * portal screens should use this helper so schedules consistently display as
 * 18:00 rather than 18:00:00.
 */
export function formatClockTime(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(text);
  if (!match) return text || fallback;

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function formatClockRange(
  start: unknown,
  end: unknown,
  separator = "–"
) {
  const first = formatClockTime(start);
  const last = formatClockTime(end);
  if (first && last) return `${first}${separator}${last}`;
  return first || last;
}
