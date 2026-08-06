export const COURSE_PLANNING_CAMBRIDGE_LEVELS = new Set([
  "B1",
  "B2",
  "C1",
  "C2",
]);

export const COURSE_PLANNING_COURSE_TYPES = new Set(["intensive", "express"]);

export function normalizeCoursePlanningLevel(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function normalizeCoursePlanningCourseType(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isCoursePlanningEligible(input: {
  isCambridge: unknown;
  levelName: unknown;
  courseType: unknown;
}) {
  return (
    input.isCambridge === true &&
    COURSE_PLANNING_COURSE_TYPES.has(
      normalizeCoursePlanningCourseType(input.courseType)
    )
  );
}
