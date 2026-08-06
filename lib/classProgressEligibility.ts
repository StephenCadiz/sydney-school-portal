export const CLASS_PROGRESS_YOUNG_LEARNER_LEVELS = new Set([
  "KIDS 1",
  "KIDS 2",
  "JUNIOR 1",
  "JUNIOR 2",
  "JUNIOR 3",
  "JUNIOR 4",
  "TEENS 1",
]);

export const CLASS_PROGRESS_CAMBRIDGE_LEVELS = new Set([
  "B1",
  "B2",
  "C1",
  "C2",
]);

export const CLASS_PROGRESS_CAMBRIDGE_COURSE_TYPES = new Set([
  "regular",
  "online",
]);

export function normalizeClassProgressLevel(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function normalizeClassProgressCourseType(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isClassProgressEligible(input: {
  isCambridge: unknown;
  levelName: unknown;
  courseType?: unknown;
}) {
  const level = normalizeClassProgressLevel(input.levelName);

  if (input.isCambridge === true) {
    return (
      CLASS_PROGRESS_CAMBRIDGE_LEVELS.has(level) &&
      CLASS_PROGRESS_CAMBRIDGE_COURSE_TYPES.has(
        normalizeClassProgressCourseType(input.courseType)
      )
    );
  }

  return input.isCambridge === false && CLASS_PROGRESS_YOUNG_LEARNER_LEVELS.has(level);
}
