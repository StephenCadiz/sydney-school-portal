import "server-only";

import {
  CAMBRIDGE_EXAM_COURSE_LABELS,
  CAMBRIDGE_EXAM_PARTS,
  CambridgeExamCourseType,
  CambridgeExamPartType,
  createEmptyExamParts,
  getCambridgeExamAssignmentStatus,
  getExamCompleteness,
  getExamPartLabel,
  isCambridgeExamCourseType,
  isDateOnly,
} from "./cambridgeExamBank";

export const assignmentSelect = `
  id,
  course_type,
  release_date,
  due_date,
  active,
  archived_at,
  created_at,
  updated_at,
  part:cambridge_exam_parts!cambridge_exam_assignments_exam_part_id_fkey (
    id,
    part_type,
    exam:cambridge_exam_sets!cambridge_exam_parts_exam_set_id_fkey (
      id,
      exam_number,
      title,
      level:levels!cambridge_exam_sets_level_id_fkey (
        id,
        name
      )
    ),
    resources:cambridge_exam_part_resources (
      resource_type
    )
  )
`;

function one(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

export function serializeAssignment(row: any) {
  const part = one(row?.part);
  const exam = one(part?.exam);
  const level = one(exam?.level);
  const formParts = createEmptyExamParts();
  for (const resource of part?.resources || []) {
    formParts[part.part_type as CambridgeExamPartType][
      resource.resource_type as keyof (typeof formParts)[CambridgeExamPartType]
    ] = "stored";
  }
  const completeness = getExamCompleteness(level?.name, formParts);
  const partCompleteness = completeness.parts.find(
    (item) => item.part_type === part?.part_type
  );

  return {
    id: row.id,
    level: { id: Number(level?.id), name: String(level?.name || "").trim().toUpperCase() },
    exam: {
      id: exam?.id,
      exam_number: exam?.exam_number,
      title: exam?.title || null,
    },
    part: {
      id: part?.id,
      part_type: part?.part_type as CambridgeExamPartType,
      display_label: getExamPartLabel(level?.name, part?.part_type),
      complete: Boolean(partCompleteness?.complete),
      missing_resources: partCompleteness?.missing_resources || [],
    },
    course_type: row.course_type as CambridgeExamCourseType,
    release_date: row.release_date,
    due_date: row.due_date,
    active: row.active,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: getCambridgeExamAssignmentStatus(row),
  };
}

type CreateAssignmentInput = {
  examSetId: string;
  partTypes: CambridgeExamPartType[];
  courseTypes: CambridgeExamCourseType[];
  releaseDate: string | null;
  dueDate: string | null;
  active: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAssignmentUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  return isDateOnly(value) ? value : undefined;
}

export function validateCreateAssignmentPayload(input: unknown):
  | { value: CreateAssignmentInput; error: null }
  | { value: null; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { value: null, error: "Invalid assignment payload." };
  }
  const body = input as Record<string, unknown>;
  const allowed = new Set([
    "exam_set_id", "part_types", "course_types", "release_date", "due_date", "active",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { value: null, error: "The request contains unsupported fields." };
  }
  if (!isAssignmentUuid(body.exam_set_id)) {
    return { value: null, error: "Choose a valid Cambridge exam." };
  }
  if (!Array.isArray(body.part_types) || body.part_types.length === 0 ||
      new Set(body.part_types).size !== body.part_types.length ||
      body.part_types.some((part) => !CAMBRIDGE_EXAM_PARTS.includes(part as CambridgeExamPartType))) {
    return { value: null, error: "Choose at least one valid exam part without duplicates." };
  }
  if (!Array.isArray(body.course_types) || body.course_types.length === 0 ||
      new Set(body.course_types).size !== body.course_types.length ||
      body.course_types.some((course) => !isCambridgeExamCourseType(course))) {
    return { value: null, error: "Choose at least one valid course type without duplicates." };
  }
  if (typeof body.active !== "boolean") {
    return { value: null, error: "Choose Draft or Active." };
  }
  const releaseDate = parseOptionalDate(body.release_date);
  const dueDate = parseOptionalDate(body.due_date);
  if (releaseDate === undefined || dueDate === undefined) {
    return { value: null, error: "Enter valid release and due dates." };
  }
  if (releaseDate && dueDate && dueDate < releaseDate) {
    return { value: null, error: "Due date cannot be earlier than release date." };
  }
  return {
    value: {
      examSetId: body.exam_set_id,
      partTypes: body.part_types as CambridgeExamPartType[],
      courseTypes: body.course_types as CambridgeExamCourseType[],
      releaseDate,
      dueDate,
      active: body.active,
    },
    error: null,
  };
}

export function validateUpdateAssignmentPayload(input: unknown):
  | { value: { releaseDate: string | null; dueDate: string | null; active: boolean }; error: null }
  | { value: null; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { value: null, error: "Invalid assignment payload." };
  }
  const body = input as Record<string, unknown>;
  const allowed = new Set(["release_date", "due_date", "active"]);
  if (Object.keys(body).some((key) => !allowed.has(key)) ||
      !Object.prototype.hasOwnProperty.call(body, "active")) {
    return { value: null, error: "Only dates and Draft/Active status may be edited." };
  }
  if (typeof body.active !== "boolean") {
    return { value: null, error: "Choose Draft or Active." };
  }
  const releaseDate = parseOptionalDate(body.release_date);
  const dueDate = parseOptionalDate(body.due_date);
  if (releaseDate === undefined || dueDate === undefined) {
    return { value: null, error: "Enter valid release and due dates." };
  }
  if (releaseDate && dueDate && dueDate < releaseDate) {
    return { value: null, error: "Due date cannot be earlier than release date." };
  }
  return { value: { releaseDate, dueDate, active: body.active }, error: null };
}

export function assignmentRpcError(error: any, context?: {
  level?: string;
  examNumber?: number;
}) {
  const message = String(error?.message || "");
  if (message.includes("EXAM_NOT_FOUND") || message.includes("PART_NOT_FOUND")) {
    return { status: 404, message: "The selected active exam or part was not found." };
  }
  if (message.includes("EXAM_NOT_ACTIVE")) {
    return { status: 409, message: "The selected exam is inactive or archived." };
  }
  if (message.includes("INCOMPLETE_PART:")) {
    const [, part, resource] = message.match(/INCOMPLETE_PART:([^:]+):([a-z_]+)/) || [];
    const label = part ? getExamPartLabel(context?.level, part as CambridgeExamPartType) : "Selected part";
    const resourceLabel = resource === "sample_writing" ? "writing sample" : resource;
    return { status: 409, message: `${label} cannot be assigned because its ${resourceLabel || "required resource"} is missing.` };
  }
  if (error?.code === "23505" || message.includes("DUPLICATE_ASSIGNMENT:")) {
    const [, part, course] = message.match(/DUPLICATE_ASSIGNMENT:([^:]+):([a-z]+)/) || [];
    const partLabel = part ? getExamPartLabel(context?.level, part as CambridgeExamPartType) : "Selected part";
    const courseLabel = course && isCambridgeExamCourseType(course)
      ? CAMBRIDGE_EXAM_COURSE_LABELS[course] : "that course";
    return {
      status: 409,
      message: `${context?.level || "This"} Exam ${context?.examNumber || ""} ${partLabel} is already assigned to ${courseLabel}.`.replace(/\s+/g, " ").trim(),
    };
  }
  if (error?.code === "23514" || error?.code === "22023") {
    return { status: 422, message: "The assignment details are invalid." };
  }
  return { status: 500, message: "Unable to save Cambridge exam assignments." };
}

export function restoreAssignmentRpcError(error: any) {
  const message = String(error?.message || "");
  if (message.includes("ASSIGNMENT_NOT_FOUND")) {
    return { status: 404, message: "Assignment not found." };
  }
  if (message.includes("ASSIGNMENT_NOT_ARCHIVED")) {
    return { status: 409, message: "This assignment is not archived." };
  }
  if (message.includes("RESTORE_EXAM_UNAVAILABLE")) {
    return {
      status: 409,
      message: "Restore the parent exam before restoring this assignment.",
    };
  }
  if (message.includes("RESTORE_PART_INCOMPLETE")) {
    return {
      status: 409,
      message: "This assignment cannot be restored because its master exam part is incomplete.",
    };
  }
  if (message.includes("RESTORE_DUPLICATE") || error?.code === "23505") {
    return {
      status: 409,
      message: "Another current assignment already uses this exam part and course type.",
    };
  }
  return { status: 500, message: "Unable to restore the assignment." };
}
