export type FridayTutorialPrintWindow = {
  monday: string;
  friday: string;
};

export function getMadridDateString(date = new Date()) {
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

function getMadridWeekday(date = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
  }).format(date);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    weekday
  );
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Returns the Madrid-local Monday-to-Friday print window for the current week. */
export function getFridayTutorialPrintWindow(date = new Date()) {
  const today = getMadridDateString(date);
  const weekday = getMadridWeekday(date);

  if (weekday === 0 || weekday === 6 || weekday < 0) return null;

  const monday = addDays(today, 1 - weekday);
  return { monday, friday: addDays(monday, 4) } satisfies FridayTutorialPrintWindow;
}
