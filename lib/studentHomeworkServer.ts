import "server-only";

import { NextRequest } from "next/server";

import {
  adjustHomeworkDatesForClassDays,
  getExamNumberFromWeek,
  getHomeworkSkillLabel,
  getHomeworkTimingStatus,
  getMadridDateString,
  normalizeCambridgeLevel,
  normalizeHomeworkSkill,
} from "./homework";
import { buildHomeworkResultMap } from "./progress";
import { supabaseAdmin } from "./supabaseAdmin";

export const CAMBRIDGE_ASSIGNMENT_HOMEWORK_CUTOVER_DATE = "2026-07-28";
export const STUDENT_HOMEWORK_LIMIT = 100;

const ELIGIBLE_LEVELS = new Set(["B1", "B2", "C1", "C2"]);
const ELIGIBLE_COURSES = new Set(["regular", "intensive", "express", "online"]);
const PART_ORDER = new Map([
  ["reading", 1],
  ["listening", 2],
  ["writing", 3],
  ["speaking", 4],
]);

type StudentContext = {
  studentId: string;
  classId: string;
  classDays: string;
  levelId: number;
  level: string;
  courseType: string;
};

export type StudentAssignmentHomework = {
  id: string;
  source: "assignment";
  exam: { id: string; number: number; title: string | null };
  part: { id: string; type: string; label: string };
  release_date: string | null;
  due_date: string | null;
  resources: Array<{
    type: "paper" | "audio";
    label: "Question Paper" | "Audio";
    url: string;
  }>;
  viewed: boolean;
  result: { id: string; percentage: number | null; title: string | null } | null;
  status: "Current" | "Overdue" | "Complete";
};

export type StudentLegacyHomework = {
  id: string;
  source: "legacy";
  week_number: string | number;
  homework_order?: string | number | null;
  title: string | null;
  description: string | null;
  skill: string;
  release_date: string | null;
  due_date: string | null;
  resources: Array<{
    type: "paper" | "audio";
    label: "Question Paper" | "Audio";
    url: string;
  }>;
  viewed: boolean;
  result: { id: string; percentage: number | null; title: string | null } | null;
  status: "Current" | "Past" | "Complete";
};

export type StudentHomeworkItem =
  | StudentAssignmentHomework
  | StudentLegacyHomework;

function one(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export async function authenticateStudentHomework(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    return { studentId: "", error: "Authentication required.", status: 401 };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { studentId: "", error: "Authentication required.", status: 401 };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Student homework authorization failed:", {
      stage: "profile",
      actorId: data.user.id,
    });
    return { studentId: "", error: "Unable to verify student access.", status: 500 };
  }
  if (profile?.role !== "student") {
    return { studentId: "", error: "Student access required.", status: 403 };
  }
  return { studentId: data.user.id, error: null, status: 200 };
}

export async function resolveStudentHomeworkContext(studentId: string):
  Promise<
    | { context: StudentContext; error: null; status: 200 }
    | { context: null; error: string; status: number }
  > {
  const { data: enrolments, error: enrolmentError } = await supabaseAdmin
    .from("class_enrolments")
    .select("class_id")
    .eq("student_id", studentId)
    .limit(2);
  if (enrolmentError) {
    console.error("Student homework context failed:", {
      stage: "enrolment",
      actorId: studentId,
    });
    return { context: null, error: "Unable to load your class.", status: 500 };
  }
  if (!enrolments?.length) {
    return { context: null, error: "No class enrolment was found.", status: 404 };
  }
  if (enrolments.length > 1) {
    return {
      context: null,
      error: "More than one class enrolment was found.",
      status: 409,
    };
  }

  const { data: classroom, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, level_id, course_type, days")
    .eq("id", enrolments[0].class_id)
    .maybeSingle();
  if (classError) {
    console.error("Student homework context failed:", {
      stage: "class",
      actorId: studentId,
      classId: enrolments[0].class_id,
    });
    return { context: null, error: "Unable to load your class.", status: 500 };
  }
  if (!classroom?.level_id) {
    return { context: null, error: "Your class is not available.", status: 404 };
  }

  const { data: levelRow, error: levelError } = await supabaseAdmin
    .from("levels")
    .select("id, name")
    .eq("id", classroom.level_id)
    .maybeSingle();
  if (levelError) {
    console.error("Student homework context failed:", {
      stage: "level",
      actorId: studentId,
      classId: classroom.id,
    });
    return { context: null, error: "Unable to load your class level.", status: 500 };
  }

  const level = normalizeCambridgeLevel(levelRow?.name);
  const courseType = String(classroom.course_type || "").trim().toLowerCase();
  if (!ELIGIBLE_LEVELS.has(level) || !ELIGIBLE_COURSES.has(courseType)) {
    return {
      context: null,
      error: "Cambridge homework is not available for this class.",
      status: 404,
    };
  }

  return {
    context: {
      studentId,
      classId: String(classroom.id),
      classDays: String(classroom.days || ""),
      levelId: Number(classroom.level_id),
      level,
      courseType,
    },
    error: null,
    status: 200,
  };
}

async function loadVisibleAssignmentRows(context: StudentContext) {
  const today = getMadridDateString();
  const { data, error } = await supabaseAdmin
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
    .or(`release_date.is.null,release_date.lte.${today}`)
    .order("release_date", { ascending: false, nullsFirst: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(STUDENT_HOMEWORK_LIMIT);
  if (error) throw error;
  return data || [];
}

export async function loadVisibleAssignmentIds(context: StudentContext) {
  return (await loadVisibleAssignmentRows(context)).map((row: any) => String(row.id));
}

function assignmentStatus(
  dueDate: string | null,
  hasResult: boolean,
  today: string
): StudentAssignmentHomework["status"] {
  if (hasResult) return "Complete";
  return dueDate && dueDate < today ? "Overdue" : "Current";
}

function sortCombinedHomework(items: StudentHomeworkItem[]) {
  const statusOrder = (item: StudentHomeworkItem) =>
    item.status === "Current" ? 0 : item.status === "Complete" ? 1 : 2;
  return items.sort((first, second) => {
    const statusDifference = statusOrder(first) - statusOrder(second);
    if (statusDifference) return statusDifference;
    const dueDifference = String(first.due_date || "9999-12-31").localeCompare(
      String(second.due_date || "9999-12-31")
    );
    if (dueDifference) return dueDifference;
    const releaseDifference = String(first.release_date || "0000-01-01").localeCompare(
      String(second.release_date || "0000-01-01")
    );
    if (releaseDifference) return releaseDifference;
    const firstExam = first.source === "assignment" ? first.exam.number : 0;
    const secondExam = second.source === "assignment" ? second.exam.number : 0;
    if (firstExam !== secondExam) return firstExam - secondExam;
    const firstPart =
      first.source === "assignment" ? first.part.type : first.skill;
    const secondPart =
      second.source === "assignment" ? second.part.type : second.skill;
    const partDifference =
      (PART_ORDER.get(firstPart) || 99) - (PART_ORDER.get(secondPart) || 99);
    if (partDifference) return partDifference;
    const sourceDifference = first.source.localeCompare(second.source);
    return sourceDifference || first.id.localeCompare(second.id);
  });
}

function normalizedExamNumber(value: unknown, weekNumber?: unknown) {
  const stored = Number(value);
  if (Number.isInteger(stored) && stored > 0) return stored;
  const derived = getExamNumberFromWeek(Number(weekNumber));
  return derived && Number.isInteger(derived) ? derived : null;
}

function overlapKey(
  examNumber: number | null,
  partType: string,
  releaseDate: string | null
) {
  if (!examNumber || !PART_ORDER.has(partType) || !releaseDate) return "";
  return `${examNumber}:${partType}:${releaseDate}`;
}

export async function loadStudentHomework(
  context: StudentContext,
  includeResources = true
) {
  const today = getMadridDateString();
  const assignmentRows = await loadVisibleAssignmentRows(context);
  const assignmentIds = assignmentRows.map((row: any) => String(row.id));
  const partIds = assignmentRows
    .map((row: any) => String(one(row.part)?.id || ""))
    .filter(Boolean);

  const legacyQuery = supabaseAdmin
    .from("cambridge_homework")
    .select("*")
    .eq("level", context.level)
    .eq("course_type", context.courseType)
    .eq("active", true)
    .lt("release_date", CAMBRIDGE_ASSIGNMENT_HOMEWORK_CUTOVER_DATE)
    .order("release_date", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(STUDENT_HOMEWORK_LIMIT);

  const legacyResult = await legacyQuery;
  if (legacyResult.error) throw legacyResult.error;
  const assignmentOverlapKeys = new Set(
    assignmentRows
      .map((row: any) => {
        const part = one(row.part);
        const exam = one(part?.exam);
        return overlapKey(
          normalizedExamNumber(exam?.exam_number),
          normalizeHomeworkSkill(part?.part_type),
          row.release_date || null
        );
      })
      .filter(Boolean)
  );
  const adjustedLegacy = adjustHomeworkDatesForClassDays(
    legacyResult.data || [],
    context.classDays
  ).filter(
    (row) =>
      row.release_date &&
      row.release_date < CAMBRIDGE_ASSIGNMENT_HOMEWORK_CUTOVER_DATE &&
      row.release_date <= today
  ).filter(
    (row) =>
      !assignmentOverlapKeys.has(
        overlapKey(
          normalizedExamNumber(row.exam_number, row.week_number),
          normalizeHomeworkSkill(row.homework_skill),
          row.release_date || null
        )
      )
  );
  const legacyIds = adjustedLegacy.map((row) => String(row.id));

  const [resourceResult, assignmentResult, legacyResultRows, assignmentReadResult, legacyReadResult] =
    await Promise.all([
      includeResources && partIds.length
        ? supabaseAdmin
            .from("cambridge_exam_part_resources")
            .select("exam_part_id, resource_type, external_url")
            .in("exam_part_id", partIds)
            .in("resource_type", ["paper", "audio"])
        : Promise.resolve({ data: [], error: null }),
      assignmentIds.length
        ? supabaseAdmin
            .from("results")
            .select("id, percentage, title, cambridge_exam_assignment_id")
            .eq("student_id", context.studentId)
            .eq("result_type", "homework")
            .in("cambridge_exam_assignment_id", assignmentIds)
            .order("published_at", { ascending: false, nullsFirst: false })
            .order("exam_date", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false })
            .limit(STUDENT_HOMEWORK_LIMIT)
        : Promise.resolve({ data: [], error: null }),
      supabaseAdmin
        .from("results")
        .select("id, percentage, title, result_type, skill, cambridge_exam_assignment_id")
        .eq("student_id", context.studentId)
        .eq("result_type", "homework")
        .is("cambridge_exam_assignment_id", null)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("exam_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .limit(500),
      assignmentIds.length
        ? supabaseAdmin
            .from("student_assignment_homework_reads")
            .select("cambridge_exam_assignment_id")
            .eq("student_id", context.studentId)
            .in("cambridge_exam_assignment_id", assignmentIds)
        : Promise.resolve({ data: [], error: null }),
      legacyIds.length
        ? supabaseAdmin
            .from("student_homework_reads")
            .select("homework_id")
            .eq("student_id", context.studentId)
            .in("homework_id", legacyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const loadError =
    resourceResult.error ||
    assignmentResult.error ||
    legacyResultRows.error ||
    assignmentReadResult.error ||
    legacyReadResult.error;
  if (loadError) throw loadError;

  const assignmentResults = assignmentResult.data || [];
  const legacyResults = legacyResultRows.data || [];
  const resultByAssignment = new Map(
    assignmentResults
      .map((row: any) => [String(row.cambridge_exam_assignment_id), row])
  );
  const viewedAssignments = new Set(
    (assignmentReadResult.data || []).map((row: any) =>
      String(row.cambridge_exam_assignment_id)
    )
  );
  const resourcesByPart = new Map<string, any[]>();
  for (const resource of resourceResult.data || []) {
    const key = String(resource.exam_part_id);
    resourcesByPart.set(key, [...(resourcesByPart.get(key) || []), resource]);
  }

  const assignmentHomework: StudentAssignmentHomework[] = assignmentRows.map(
    (row: any) => {
      const part = one(row.part);
      const exam = one(part?.exam);
      const partType = String(part?.part_type || "");
      const allowedTypes =
        partType === "listening" ? new Set(["paper", "audio"]) : new Set(["paper"]);
      const result = resultByAssignment.get(String(row.id));
      return {
        id: String(row.id),
        source: "assignment",
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
        resources: (resourcesByPart.get(String(part?.id)) || [])
          .filter((resource) => allowedTypes.has(String(resource.resource_type)))
          .sort(
            (first, second) =>
              (first.resource_type === "paper" ? 0 : 1) -
              (second.resource_type === "paper" ? 0 : 1)
          )
          .map((resource) => ({
            type: resource.resource_type as "paper" | "audio",
            label:
              resource.resource_type === "audio"
                ? ("Audio" as const)
                : ("Question Paper" as const),
            url: String(resource.external_url),
          })),
        viewed: viewedAssignments.has(String(row.id)),
        result: result
          ? {
              id: String(result.id),
              percentage:
                result.percentage === null ? null : Number(result.percentage),
              title: result.title ? String(result.title) : null,
            }
          : null,
        status: assignmentStatus(row.due_date || null, Boolean(result), today),
      };
    }
  );

  const legacyResultMap = buildHomeworkResultMap(legacyResults, adjustedLegacy);
  const viewedLegacy = new Set(
    (legacyReadResult.data || []).map((row: any) => String(row.homework_id))
  );
  const legacyHomework: StudentLegacyHomework[] = adjustedLegacy.map((row: any) => {
    const skill = normalizeHomeworkSkill(row.homework_skill);
    const result = legacyResultMap.get(`${Number(row.week_number)}:${skill}`);
    const resources: StudentLegacyHomework["resources"] = [];
    if (includeResources && row.resource_url) {
      resources.push({
        type: "paper",
        label: "Question Paper",
        url: String(row.resource_url),
      });
    }
    if (includeResources && skill === "listening" && row.audio_url) {
      resources.push({
        type: "audio",
        label: "Audio",
        url: String(row.audio_url),
      });
    }
    return {
      id: String(row.id),
      source: "legacy",
      week_number: row.week_number,
      homework_order: row.homework_order,
      title: row.title || null,
      description: row.description || null,
      skill,
      release_date: row.release_date || null,
      due_date: row.due_date || null,
      resources,
      viewed: viewedLegacy.has(String(row.id)),
      result: result
        ? {
            id: String(result.id),
            percentage: result.percentage === null ? null : Number(result.percentage),
            title: result.title || null,
          }
        : null,
      status: getHomeworkTimingStatus(row, today, Boolean(result)),
    };
  });

  const homework = sortCombinedHomework([
    ...assignmentHomework,
    ...legacyHomework,
  ]).slice(0, STUDENT_HOMEWORK_LIMIT * 2);

  return {
    class: {
      id: context.classId,
      level: context.level,
      course_type: context.courseType,
    },
    homework,
    unread_count: homework.filter(
      (item) =>
        !item.viewed && item.status === "Current"
    ).length,
    today,
  };
}
