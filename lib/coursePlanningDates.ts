export function isCoursePlanningDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    !Number.isNaN(date.valueOf()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normalizeCoursePlanningDate(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateCoursePlanningDateRange(input: {
  startDate: unknown;
  endDate: unknown;
  required: boolean;
}): { startDate: string | null; endDate: string | null; error: string | null } {
  const startDate = normalizeCoursePlanningDate(input.startDate);
  const endDate = normalizeCoursePlanningDate(input.endDate);

  if (!startDate && !endDate) {
    return input.required
      ? {
          startDate: null,
          endDate: null,
          error: "Start date and end date are required for Cambridge Intensive and Express classes.",
        }
      : { startDate: null, endDate: null, error: null };
  }

  if (!startDate || !endDate) {
    return {
      startDate: null,
      endDate: null,
      error: "Enter both a start date and an end date.",
    };
  }

  if (!isCoursePlanningDate(startDate) || !isCoursePlanningDate(endDate)) {
    return {
      startDate: null,
      endDate: null,
      error: "Enter valid course start and end dates.",
    };
  }

  if (endDate < startDate) {
    return {
      startDate: null,
      endDate: null,
      error: "End date must not be before the start date.",
    };
  }

  return { startDate, endDate, error: null };
}
