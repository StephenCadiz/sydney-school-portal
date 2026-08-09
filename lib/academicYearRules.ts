export type AcademicYearStatus = "current" | "future" | "archived";

export type AcademicYear = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: AcademicYearStatus;
  created_at?: string;
  updated_at?: string;
  class_count?: number;
};

export type AcademicYearClass = {
  id: string | number;
  course_type?: string | null;
  academic_year_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  [key: string]: unknown;
};

export const NO_CURRENT_ACADEMIC_YEAR_CLASS_MESSAGE =
  "No current academic-year class has been assigned yet.";

const DATE_BASED_COURSE_TYPES = new Set(["intensive", "express"]);

export function normalizeAcademicCourseType(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function classUsesAcademicYear(courseType: unknown) {
  return !DATE_BASED_COURSE_TYPES.has(normalizeAcademicCourseType(courseType));
}

export function getMadridDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year || ""}-${values.month || ""}-${values.day || ""}`;
}

function hasCompleteCourseDates(classroom: AcademicYearClass) {
  return Boolean(classroom.start_date && classroom.end_date);
}

function isActiveDateBasedClass(
  classroom: AcademicYearClass,
  madridDate: string
) {
  return (
    !classUsesAcademicYear(classroom.course_type) &&
    hasCompleteCourseDates(classroom) &&
    String(classroom.start_date) <= madridDate &&
    String(classroom.end_date) >= madridDate
  );
}

export type CurrentClassResolution<T extends AcademicYearClass> =
  | { classroom: T; error: null }
  | { classroom: null; error: string };

export function resolveCurrentStudentClass<T extends AcademicYearClass>(
  classes: T[],
  currentAcademicYearId: string | null | undefined,
  madridDate = getMadridDateString()
): CurrentClassResolution<T> {
  const activeDateBased = classes.filter((classroom) =>
    isActiveDateBasedClass(classroom, madridDate)
  );

  if (activeDateBased.length > 1) {
    return {
      classroom: null,
      error: "More than one active Intensive or Express class was found.",
    };
  }

  if (activeDateBased.length === 1) {
    return { classroom: activeDateBased[0], error: null };
  }

  const currentAnnualClasses = currentAcademicYearId
    ? classes.filter(
        (classroom) =>
          classUsesAcademicYear(classroom.course_type) &&
          String(classroom.academic_year_id || "") ===
            String(currentAcademicYearId)
      )
    : [];

  if (currentAnnualClasses.length > 1) {
    return {
      classroom: null,
      error: "More than one current academic-year class was found.",
    };
  }

  if (currentAnnualClasses.length === 1) {
    return { classroom: currentAnnualClasses[0], error: null };
  }

  const legacyUndatedDateBased = classes.filter(
    (classroom) =>
      !classUsesAcademicYear(classroom.course_type) &&
      !hasCompleteCourseDates(classroom)
  );

  if (legacyUndatedDateBased.length === 1) {
    return { classroom: legacyUndatedDateBased[0], error: null };
  }

  return {
    classroom: null,
    error: NO_CURRENT_ACADEMIC_YEAR_CLASS_MESSAGE,
  };
}

export function filterClassesForCurrentTeaching<T extends AcademicYearClass>(
  classes: T[],
  currentAcademicYearId: string | null | undefined
) {
  return classes.filter(
    (classroom) =>
      !classUsesAcademicYear(classroom.course_type) ||
      (Boolean(currentAcademicYearId) &&
        String(classroom.academic_year_id || "") ===
          String(currentAcademicYearId))
  );
}
