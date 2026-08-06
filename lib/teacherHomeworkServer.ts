import "server-only";

import { NextRequest } from "next/server";

import {
  adjustHomeworkDatesForClassDays,
  getExamNumberFromWeek,
  getHomeworkSkillLabel,
  getMadridDateString,
  normalizeCambridgeLevel,
  normalizeHomeworkSkill,
} from "./homework";
import { supabaseAdmin } from "./supabaseAdmin";

export const TEACHER_HOMEWORK_CUTOVER_DATE = "2026-07-28";
const ELIGIBLE_LEVELS = new Set(["B1", "B2", "C1", "C2"]);
const ELIGIBLE_COURSES = new Set(["regular", "intensive", "express", "online"]);
const PARTS = new Set(["reading", "listening", "writing", "speaking"]);
const RESOURCE_ORDER = ["paper", "audio", "key", "sample_writing"];

export class TeacherHomeworkError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type TeacherHomeworkContext = {
  actorId: string;
  role: "teacher" | "admin";
  classId: string;
  classDays: string;
  levelId: number;
  level: string;
  courseType: string;
  supported: boolean;
};

function one(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export async function authorizeTeacherHomeworkClass(
  request: NextRequest,
  classId: string
): Promise<TeacherHomeworkContext> {
  const token = bearerToken(request);
  if (!token) throw new TeacherHomeworkError("Authentication required.", 401);

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    throw new TeacherHomeworkError("Authentication required.", 401);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    throw new TeacherHomeworkError("Unable to verify account access.", 500);
  }
  const role = String(profile?.role || "").trim().toLowerCase();
  if (role !== "teacher" && role !== "admin") {
    throw new TeacherHomeworkError("Teacher or admin access required.", 403);
  }

  const { data: classroom, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, teacher_id, level_id, course_type, days, is_cambridge")
    .eq("id", classId)
    .maybeSingle();
  if (classError) {
    throw new TeacherHomeworkError("Unable to load the requested class.", 500);
  }
  if (!classroom) {
    throw new TeacherHomeworkError("Class was not found.", 404);
  }
  if (
    role === "teacher" &&
    String(classroom.teacher_id || "") !== authData.user.id
  ) {
    throw new TeacherHomeworkError(
      "You can only access homework for your own classes.",
      403
    );
  }

  const { data: levelRow, error: levelError } = await supabaseAdmin
    .from("levels")
    .select("id, name")
    .eq("id", classroom.level_id)
    .maybeSingle();
  if (levelError || !levelRow) {
    throw new TeacherHomeworkError("Unable to verify the class level.", 500);
  }

  const level = normalizeCambridgeLevel(levelRow.name);
  const courseType = String(classroom.course_type || "").trim().toLowerCase();
  return {
    actorId: authData.user.id,
    role,
    classId: String(classroom.id),
    classDays: String(classroom.days || ""),
    levelId: Number(classroom.level_id),
    level,
    courseType,
    supported:
      classroom.is_cambridge === true &&
      ELIGIBLE_LEVELS.has(level) &&
      ELIGIBLE_COURSES.has(courseType),
  };
}

function examNumber(value: unknown, week: unknown = null) {
  const stored = Number(value);
  if (Number.isInteger(stored) && stored > 0) return stored;
  const derived = getExamNumberFromWeek(Number(week));
  return derived && Number.isInteger(derived) ? derived : null;
}

function overlapKey(number: number | null, part: string, date: string | null) {
  return number && PARTS.has(part) && date ? `${number}:${part}:${date}` : "";
}

export async function loadTeacherClassHomework(
  context: TeacherHomeworkContext
) {
  if (!context.supported) {
    return {
      class: {
        id: context.classId,
        level: context.level,
        course_type: context.courseType,
        supported: false,
      },
      homework: [],
      today: getMadridDateString(),
    };
  }

  const today = getMadridDateString();
  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from("cambridge_exam_assignments")
    .select(`
      id,
      release_date,
      due_date,
      part:cambridge_exam_parts!cambridge_exam_assignments_exam_part_id_fkey!inner (
        id,
        part_type,
        exam:cambridge_exam_sets!cambridge_exam_parts_exam_set_id_fkey!inner (
          id,
          level_id,
          exam_number,
          title,
          active,
          archived_at
        )
      )
    `)
    .eq("course_type", context.courseType)
    .eq("active", true)
    .is("archived_at", null)
    .eq("part.exam.level_id", context.levelId)
    .eq("part.exam.active", true)
    .is("part.exam.archived_at", null)
    .or(
      "course_plan_class_id.is.null,course_plan_class_id.eq." + context.classId
    )
    .or(`release_date.is.null,release_date.lte.${today}`)
    .order("release_date", { ascending: false, nullsFirst: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("id")
    .limit(100);
  if (assignmentError) throw assignmentError;

  const assignmentRows = assignments || [];
  const partIds = assignmentRows
    .map((row: any) => String(one(row.part)?.id || ""))
    .filter(Boolean);
  const [resourceResult, legacyResult] = await Promise.all([
    partIds.length
      ? supabaseAdmin
          .from("cambridge_exam_part_resources")
          .select("exam_part_id, resource_type, external_url")
          .in("exam_part_id", partIds)
          .in("resource_type", RESOURCE_ORDER)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("cambridge_homework")
      .select("*")
      .eq("level", context.level)
      .eq("course_type", context.courseType)
      .eq("active", true)
      .lt("release_date", TEACHER_HOMEWORK_CUTOVER_DATE)
      .order("release_date", { ascending: false })
      .order("week_number", { ascending: false })
      .limit(100),
  ]);
  if (resourceResult.error) throw resourceResult.error;
  if (legacyResult.error) throw legacyResult.error;

  const resourcesByPart = new Map<string, any[]>();
  for (const resource of resourceResult.data || []) {
    const id = String(resource.exam_part_id);
    resourcesByPart.set(id, [...(resourcesByPart.get(id) || []), resource]);
  }
  const assignmentKeys = new Set(
    assignmentRows
      .map((row: any) => {
        const part = one(row.part);
        const exam = one(part?.exam);
        return overlapKey(
          examNumber(exam?.exam_number),
          normalizeHomeworkSkill(part?.part_type),
          row.release_date || null
        );
      })
      .filter(Boolean)
  );

  const assignmentHomework = assignmentRows.map((row: any) => {
    const part = one(row.part);
    const exam = one(part?.exam);
    const partType = normalizeHomeworkSkill(part?.part_type);
    const allowedResources =
      partType === "reading"
        ? new Set(["paper", "key"])
        : partType === "listening"
        ? new Set(["paper", "audio", "key"])
        : partType === "writing"
        ? new Set(["paper", "sample_writing"])
        : new Set(["paper"]);
    return {
      id: String(row.id),
      source: "assignment" as const,
      exam: {
        id: String(exam?.id || ""),
        number: Number(exam?.exam_number),
        title: exam?.title ? String(exam.title) : null,
      },
      part: {
        id: String(part?.id || ""),
        type: partType,
        label: getHomeworkSkillLabel(context.level, partType),
      },
      release_date: row.release_date || null,
      due_date: row.due_date || null,
      status:
        row.due_date && row.due_date < today ? ("Overdue" as const) : ("Current" as const),
      resources: (resourcesByPart.get(String(part?.id)) || [])
        .filter((resource) =>
          allowedResources.has(String(resource.resource_type))
        )
        .sort(
          (a, b) =>
            RESOURCE_ORDER.indexOf(String(a.resource_type)) -
            RESOURCE_ORDER.indexOf(String(b.resource_type))
        )
        .map((resource) => ({
          type: String(resource.resource_type),
          audience:
            resource.resource_type === "key" ||
            resource.resource_type === "sample_writing"
              ? ("teacher" as const)
              : ("student" as const),
          label:
            resource.resource_type === "paper"
              ? "Question Paper"
              : resource.resource_type === "audio"
              ? "Audio"
              : resource.resource_type === "key"
              ? "Key"
              : "Sample Writing",
          url: String(resource.external_url),
        })),
    };
  });

  const legacyHomework = adjustHomeworkDatesForClassDays(
    legacyResult.data || [],
    context.classDays
  )
    .filter(
      (row) =>
        row.release_date &&
        row.release_date < TEACHER_HOMEWORK_CUTOVER_DATE &&
        row.release_date <= today
    )
    .filter(
      (row) =>
        !assignmentKeys.has(
          overlapKey(
            examNumber(row.exam_number, row.week_number),
            normalizeHomeworkSkill(row.homework_skill),
            row.release_date || null
          )
        )
    )
    .map((row) => ({
      id: String(row.id),
      source: "legacy" as const,
      week_number: row.week_number,
      title: row.title || null,
      description: row.description || null,
      skill: normalizeHomeworkSkill(row.homework_skill),
      release_date: row.release_date || null,
      due_date: row.due_date || null,
      status:
        row.due_date && row.due_date < today ? ("Overdue" as const) : ("Current" as const),
      resources: [
        row.resource_url
          ? {
              type: "paper",
              audience: "student" as const,
              label: "Question Paper",
              url: String(row.resource_url),
            }
          : null,
        row.audio_url
          ? {
              type: "audio",
              audience: "student" as const,
              label: "Audio",
              url: String(row.audio_url),
            }
          : null,
      ].filter(Boolean),
    }));

  return {
    class: {
      id: context.classId,
      level: context.level,
      course_type: context.courseType,
      supported: true,
    },
    homework: [...assignmentHomework, ...legacyHomework],
    today,
  };
}

export async function loadAuthorizedAssignment(
  context: TeacherHomeworkContext,
  assignmentId: string
) {
  if (!context.supported) {
    throw new TeacherHomeworkError("This class does not support Cambridge homework.", 400);
  }
  const today = getMadridDateString();
  const { data: row, error } = await supabaseAdmin
    .from("cambridge_exam_assignments")
    .select(`
      id,
      release_date,
      due_date,
      course_type,
      course_plan_class_id,
      active,
      archived_at,
      part:cambridge_exam_parts!cambridge_exam_assignments_exam_part_id_fkey!inner (
        id,
        part_type,
        exam:cambridge_exam_sets!cambridge_exam_parts_exam_set_id_fkey!inner (
          id,
          level_id,
          exam_number,
          title,
          active,
          archived_at
        )
      )
    `)
    .eq("id", assignmentId)
    .maybeSingle();
  if (error || !row) throw new TeacherHomeworkError("Assignment was not found.", 404);
  const part = one(row.part);
  const exam = one(part?.exam);
  const partType = normalizeHomeworkSkill(part?.part_type);
  if (
    row.active !== true ||
    row.archived_at ||
    (row.release_date && row.release_date > today) ||
    exam?.active !== true ||
    exam?.archived_at ||
    Number(exam?.level_id) !== context.levelId ||
    String(row.course_type || "").toLowerCase() !== context.courseType ||
    (row.course_plan_class_id &&
      String(row.course_plan_class_id) !== context.classId) ||
    !PARTS.has(partType)
  ) {
    throw new TeacherHomeworkError("Assignment is not available for this class.", 403);
  }
  return { row, part, exam, partType, today };
}
