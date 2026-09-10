export type ClassEnrolmentPeriod = {
  class_id: string;
  student_type: "profile" | "young_learner";
  student_id: string;
  starts_on: string;
  ends_before: string | null;
  cancelled_at?: string | null;
};

export function madridEnrolmentDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isEnrolmentDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function eligibleForClassDate(
  periods: readonly ClassEnrolmentPeriod[],
  classId: string,
  studentType: ClassEnrolmentPeriod["student_type"],
  studentId: string,
  lessonDate: string
) {
  return (
    isEnrolmentDate(lessonDate) &&
    periods.some(
      (period) =>
        !period.cancelled_at && period.class_id === classId &&
        period.student_type === studentType &&
        period.student_id === studentId &&
        period.starts_on <= lessonDate &&
        (period.ends_before === null || lessonDate < period.ends_before)
    )
  );
}
