import { normalizeAcademicCourseType } from "./academicYearRules";

export const SYLLABUS_TITLE_MAX_LENGTH = 160;
export const SYLLABUS_UNIT_TITLE_MAX_LENGTH = 160;
export const SYLLABUS_PAGES_MAX_LENGTH = 1000;
export const SYLLABUS_CONTENT_MAX_LENGTH = 6000;
export const SYLLABUS_EXAM_INFORMATION_MAX_LENGTH = 3000;
export const SYLLABUS_MATERIAL_LABEL_MAX_LENGTH = 160;
export const SYLLABUS_MATERIAL_DESCRIPTION_MAX_LENGTH = 1000;

export type SyllabusStatus = "draft" | "published";
export type SyllabusMaterialType = "file" | "link";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ELIGIBLE_COURSE_TYPES = new Set(["regular", "online"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(record).every((key) => allowed.has(key));
}

export function isSyllabusUuid(value: unknown) {
  return UUID_PATTERN.test(text(value));
}

export function isSyllabusDate(value: unknown) {
  const normalized = text(value);
  if (!DATE_PATTERN.test(normalized)) return false;

  const [year, month, day] = normalized.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function normalizeSyllabusCourseType(value: unknown) {
  return normalizeAcademicCourseType(value);
}

export function isSyllabusCourseTypeEligible(value: unknown) {
  return ELIGIBLE_COURSE_TYPES.has(normalizeSyllabusCourseType(value));
}

export function classCanReceiveSyllabus(input: {
  academicYearId: unknown;
  levelId: unknown;
  courseType: unknown;
}) {
  const levelId = Number(input.levelId);
  return (
    isSyllabusUuid(input.academicYearId) &&
    Number.isInteger(levelId) &&
    levelId > 0 &&
    isSyllabusCourseTypeEligible(input.courseType)
  );
}

export function validateSyllabusTitle(value: unknown) {
  const title = text(value);
  if (!title) return { value: title, error: "Syllabus title is required." };
  if (title.length > SYLLABUS_TITLE_MAX_LENGTH) {
    return {
      value: title,
      error: `Syllabus title must be ${SYLLABUS_TITLE_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { value: title, error: "" };
}

export function validateSyllabusCreateInput(value: unknown) {
  if (!isRecord(value)) {
    return { value: null, error: "Invalid syllabus details." };
  }
  const allowed = new Set(["academic_year_id", "level_id", "title"]);
  if (!hasOnlyKeys(value, allowed)) {
    return { value: null, error: "The request contains unsupported syllabus fields." };
  }

  const academicYearId = text(value.academic_year_id);
  const levelId = Number(value.level_id);
  const suppliedTitle = text(value.title);
  if (!isSyllabusUuid(academicYearId)) {
    return { value: null, error: "Choose a valid academic year." };
  }
  if (!Number.isInteger(levelId) || levelId <= 0) {
    return { value: null, error: "Choose a valid level." };
  }
  if (suppliedTitle.length > SYLLABUS_TITLE_MAX_LENGTH) {
    return {
      value: null,
      error: `Syllabus title must be ${SYLLABUS_TITLE_MAX_LENGTH} characters or fewer.`,
    };
  }
  return {
    value: {
      academicYearId,
      levelId,
      title: suppliedTitle || null,
    },
    error: "",
  };
}

export function validateSyllabusUnitInput(value: unknown) {
  if (!isRecord(value)) {
    return { value: null, error: "Invalid syllabus unit." };
  }
  const allowed = new Set([
    "title",
    "pages_text",
    "content_text",
    "target_completion_date",
    "exam_week_start_date",
    "exam_week_end_date",
    "exam_information",
  ]);
  if (!hasOnlyKeys(value, allowed)) {
    return { value: null, error: "The request contains unsupported unit fields." };
  }

  const title = text(value.title);
  const pagesText = text(value.pages_text);
  const contentText = text(value.content_text);
  const targetCompletionDate = text(value.target_completion_date);
  const examWeekStartDate = text(value.exam_week_start_date) || null;
  const examWeekEndDate = text(value.exam_week_end_date) || null;
  const examInformation = text(value.exam_information);

  if (!title) return { value: null, error: "Unit title is required." };
  if (title.length > SYLLABUS_UNIT_TITLE_MAX_LENGTH) {
    return { value: null, error: "Unit title is too long." };
  }
  if (pagesText.length > SYLLABUS_PAGES_MAX_LENGTH) {
    return { value: null, error: "Pages to be covered is too long." };
  }
  if (!contentText) {
    return { value: null, error: "Unit content/topics are required." };
  }
  if (contentText.length > SYLLABUS_CONTENT_MAX_LENGTH) {
    return { value: null, error: "Unit content/topics are too long." };
  }
  if (!isSyllabusDate(targetCompletionDate)) {
    return { value: null, error: "Choose a valid target completion date." };
  }
  if (examWeekStartDate && !isSyllabusDate(examWeekStartDate)) {
    return { value: null, error: "Choose a valid exam-week start date." };
  }
  if (examWeekEndDate && !isSyllabusDate(examWeekEndDate)) {
    return { value: null, error: "Choose a valid exam-week end date." };
  }
  if (
    examWeekStartDate &&
    examWeekEndDate &&
    examWeekEndDate < examWeekStartDate
  ) {
    return {
      value: null,
      error: "Exam-week end date cannot be before the start date.",
    };
  }
  if (examInformation.length > SYLLABUS_EXAM_INFORMATION_MAX_LENGTH) {
    return { value: null, error: "Exam information is too long." };
  }

  return {
    value: {
      title,
      pages_text: pagesText,
      content_text: contentText,
      target_completion_date: targetCompletionDate,
      exam_week_start_date: examWeekStartDate,
      exam_week_end_date: examWeekEndDate,
      exam_information: examInformation,
    },
    error: "",
  };
}

export function validateSyllabusMaterialDetails(value: unknown) {
  if (!isRecord(value)) {
    return { value: null, error: "Invalid syllabus material." };
  }
  const allowed = new Set(["label", "description", "external_url"]);
  if (!hasOnlyKeys(value, allowed)) {
    return { value: null, error: "The request contains unsupported material fields." };
  }
  const label = text(value.label);
  const description = text(value.description);
  const externalUrl = text(value.external_url);
  if (!label) return { value: null, error: "Material label is required." };
  if (label.length > SYLLABUS_MATERIAL_LABEL_MAX_LENGTH) {
    return { value: null, error: "Material label is too long." };
  }
  if (description.length > SYLLABUS_MATERIAL_DESCRIPTION_MAX_LENGTH) {
    return { value: null, error: "Material description is too long." };
  }
  return { value: { label, description, externalUrl }, error: "" };
}

export function validateSyllabusMaterialType(value: unknown) {
  const materialType = text(value);
  if (materialType !== "file" && materialType !== "link") {
    return { value: null, error: "Choose a file upload or external link." };
  }
  return { value: materialType as SyllabusMaterialType, error: "" };
}

export function validateSyllabusOrderedIds(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length === 0) {
    return { value: null, error: `Provide the complete ${label} order.` };
  }
  const ids = value.map((item) => text(item));
  if (ids.some((id) => !isSyllabusUuid(id)) || new Set(ids).size !== ids.length) {
    return { value: null, error: `Provide a valid ${label} order.` };
  }
  return { value: ids, error: "" };
}
