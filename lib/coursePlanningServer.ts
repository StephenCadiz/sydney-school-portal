import "server-only";

import { NextRequest } from "next/server";

import { isValidExternalUrl, normalizeExternalUrl } from "./cambridgeExamBank";
import { getHomeworkSkillLabel } from "./homework";
import { isCoursePlanningDate } from "./coursePlanningDates";
import { isCoursePlanningEligible, normalizeCoursePlanningCourseType } from "./coursePlanningEligibility";
import {
  addMadridCalendarDays,
  isScheduledOnClassDays,
  madridWeekdayForDate,
  normalizeScheduledTime,
} from "./classProgressServer";
import { supabaseAdmin } from "./supabaseAdmin";
import {
  authorizeTeacherHomeworkClass,
  TeacherHomeworkError,
  type TeacherHomeworkContext,
} from "./teacherHomeworkServer";
import { loadTeacherCambridgeExamLibrary } from "./teacherCambridgeExamsServer";
import {
  findSchoolClosure,
  type SchoolClosureSummary,
} from "./schoolClosures";
import { loadSchoolClosures } from "./schoolClosuresServer";
import {
  expandSelections,
  flattenExamParts,
  isEligibleExamPart,
  type CoursePlanExam,
} from "./coursePlanExamScoring";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 4000;
const MAX_RESOURCE_LABEL_LENGTH = 160;
const COURSE_PLAN_BUCKET = "teacher-resources";

type CoursePlanningClosure = Pick<
  SchoolClosureSummary,
  "id" | "name" | "closure_type" | "start_date" | "end_date"
>;

export const COURSE_PLANNING_CHANGED_EVENT = "teacher-course-planning-updated";

export class CoursePlanningError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type CoursePlanningContext = {
  actorId: string;
  role: "teacher" | "admin";
  classId: string;
  className: string;
  teacherName: string;
  levelId: number;
  levelName: string;
  courseType: string;
  classDays: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  startDate: string | null;
  endDate: string | null;
  hasCourseDates: boolean;
  homeworkContext: TeacherHomeworkContext;
};

type ParsedExamItem = {
  examSetId: string;
  examPartId: string | null;
  examSubpartId: string | null;
  purpose: "class_practice" | "homework";
  selectionScope: "full_exam" | "skill" | "part";
  sortOrder: number;
};

type ParsedResource = {
  resourceType: "external_link" | "class_resource";
  label: string;
  externalUrl: string | null;
  classResourceId: string | null;
  sortOrder: number;
};

function validId(value: unknown) {
  return UUID_PATTERN.test(String(value || ""));
}

function cleanText(value: unknown, label: string, maximum = MAX_TEXT_LENGTH) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new CoursePlanningError(`${label} must be text.`, 422);
  }
  const trimmed = value.trim();
  if (trimmed.length > maximum) {
    throw new CoursePlanningError(`${label} is too long.`, 422);
  }
  return trimmed || null;
}

function requireText(value: unknown, label: string, maximum = MAX_TEXT_LENGTH) {
  const text = cleanText(value, label, maximum);
  if (!text) throw new CoursePlanningError(`${label} is required.`, 422);
  return text;
}

function checkObject(value: unknown, message: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CoursePlanningError(message, 400);
  }
  return value as Record<string, unknown>;
}

export async function getCoursePlanningContext(
  request: NextRequest,
  requestedClassId: string
): Promise<CoursePlanningContext> {
  if (!validId(requestedClassId)) {
    throw new CoursePlanningError("Course Planning is not available for this class.", 404);
  }

  let access: TeacherHomeworkContext;
  try {
    access = await authorizeTeacherHomeworkClass(request, requestedClassId);
  } catch (error) {
    if (error instanceof TeacherHomeworkError) {
      throw new CoursePlanningError(error.message, error.status);
    }
    throw error;
  }

  const { data: classroom, error: classError } = await supabaseAdmin
    .from("classes")
    .select(
      "id, class_name, teacher_id, level_id, is_cambridge, course_type, days, start_time, end_time, start_date, end_date"
    )
    .eq("id", access.classId)
    .maybeSingle();
  if (classError) throw classError;
  if (!classroom) throw new CoursePlanningError("Class was not found.", 404);

  const { data: level, error: levelError } = await supabaseAdmin
    .from("levels")
    .select("id, name")
    .eq("id", classroom.level_id)
    .maybeSingle();
  if (levelError || !level) {
    throw new CoursePlanningError("Unable to verify the class level.", 500);
  }

  const levelName = String(level.name || "").trim();
  const courseType = normalizeCoursePlanningCourseType(classroom.course_type);
  if (
    !isCoursePlanningEligible({
      isCambridge: classroom.is_cambridge === true,
      levelName,
      courseType,
    })
  ) {
    throw new CoursePlanningError(
      "Course Planning is only available for Cambridge Intensive and Express classes.",
      404
    );
  }

  const scheduledStartTime = normalizeScheduledTime(classroom.start_time);
  const scheduledEndTime = normalizeScheduledTime(classroom.end_time);
  if (!scheduledStartTime || !scheduledEndTime || scheduledStartTime >= scheduledEndTime) {
    throw new CoursePlanningError(
      "Course Planning requires a valid class start and end time.",
      422
    );
  }
  const startDate = String(classroom.start_date || "").trim() || null;
  const endDate = String(classroom.end_date || "").trim() || null;
  const hasCourseDates = Boolean(
    startDate &&
      endDate &&
      isCoursePlanningDate(startDate) &&
      isCoursePlanningDate(endDate) &&
      endDate >= startDate
  );

  const { data: teacher, error: teacherError } = classroom.teacher_id
    ? await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", classroom.teacher_id)
        .maybeSingle()
    : { data: null, error: null };
  if (teacherError) throw teacherError;

  return {
    actorId: access.actorId,
    role: access.role,
    classId: access.classId,
    className: String(classroom.class_name || "").trim() || levelName || "Class",
    teacherName:
      (String(teacher?.first_name || "") + " " + String(teacher?.last_name || "")).trim() ||
      "Assigned teacher",
    levelId: Number(level.id),
    levelName,
    courseType,
    classDays: String(classroom.days || ""),
    scheduledStartTime,
    scheduledEndTime,
    startDate,
    endDate,
    hasCourseDates,
    homeworkContext: {
      ...access,
      level: levelName.toUpperCase(),
      courseType,
      supported: true,
    },
  };
}

export function getScheduledCourseDays(context: CoursePlanningContext) {
  if (!context.hasCourseDates || !context.startDate || !context.endDate) {
    return [];
  }

  const lessons: Array<{
    lesson_date: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    weekday: string;
  }> = [];
  for (
    let date = context.startDate, steps = 0;
    date <= context.endDate && steps <= 550;
    date = addMadridCalendarDays(date, 1), steps += 1
  ) {
    const weekday = madridWeekdayForDate(date);
    if (!isScheduledOnClassDays(context.classDays, weekday)) continue;
    lessons.push({
      lesson_date: date,
      scheduled_start_time: context.scheduledStartTime,
      scheduled_end_time: context.scheduledEndTime,
      weekday,
    });
  }
  return lessons;
}

async function getExistingPlan(classId: string) {
  const { data, error } = await supabaseAdmin
    .from("course_plans")
    .select("id, class_id, book_name, status, created_by, updated_by, published_by, published_at, created_at, updated_at")
    .eq("class_id", classId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureCoursePlan(
  context: CoursePlanningContext,
  bookName?: unknown
) {
  if (!context.hasCourseDates) {
    throw new CoursePlanningError(
      "Course start and end dates must be added by Admin before Course Planning can be created.",
      422
    );
  }

  let plan = await getExistingPlan(context.classId);
  if (!plan) {
    const normalizedBookName = requireText(bookName, "Book used", 160);
    const { data, error } = await supabaseAdmin
      .from("course_plans")
      .insert({
        class_id: context.classId,
        book_name: normalizedBookName,
        status: "draft",
        created_by: context.actorId,
        updated_by: context.actorId,
      })
      .select("id, class_id, book_name, status, created_by, updated_by, published_by, published_at, created_at, updated_at")
      .maybeSingle();
    if (error && error.code !== "23505") throw error;
    plan = data || (await getExistingPlan(context.classId));
  }
  if (!plan) throw new CoursePlanningError("Unable to create the course plan.", 500);

  const scheduledDays = getScheduledCourseDays(context);
  if (scheduledDays.length === 0) {
    throw new CoursePlanningError(
      "No teaching days fall between the configured course dates.",
      422
    );
  }

  const { error: daysError } = await supabaseAdmin
    .from("course_plan_days")
    .upsert(
      scheduledDays.map((day) => ({
        course_plan_id: plan.id,
        lesson_date: day.lesson_date,
        scheduled_start_time: day.scheduled_start_time,
        scheduled_end_time: day.scheduled_end_time,
      })),
      { onConflict: "course_plan_id,lesson_date", ignoreDuplicates: true }
    );
  if (daysError) throw daysError;
  return plan;
}

async function signedStorageUrl(path: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(COURSE_PLAN_BUCKET)
    .createSignedUrl(path, 60 * 20);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function sortByOrder(left: any, right: any) {
  return Number(left.sort_order || 0) - Number(right.sort_order || 0);
}

export async function loadCoursePlanDays(
  planId: string,
  options: { includeExamResources?: boolean; studentId?: string; levelName?: string } = {}
) {
  const { data: days, error: dayError } = await supabaseAdmin
    .from("course_plan_days")
    .select(
      "id, course_plan_id, lesson_date, scheduled_start_time, scheduled_end_time, pages_to_cover, other_activities, homework_instructions, homework_due_date, created_at, updated_at"
    )
    .eq("course_plan_id", planId)
    .order("lesson_date", { ascending: true });
  if (dayError) throw dayError;

  const dayIds = (days || []).map((day) => String(day.id));
  const [itemsResult, resourcesResult, scoresResult] = await Promise.all([
    dayIds.length
      ? supabaseAdmin
          .from("course_plan_exam_items")
          .select(
            "id, course_plan_day_id, exam_set_id, exam_part_id, exam_subpart_id, purpose, selection_scope, sort_order"
          )
          .in("course_plan_day_id", dayIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    dayIds.length
      ? supabaseAdmin
          .from("course_plan_resources")
          .select(
            "id, course_plan_day_id, resource_type, label, external_url, storage_path, class_resource_id, sort_order"
          )
          .in("course_plan_day_id", dayIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    options.studentId && dayIds.length
      ? supabaseAdmin
          .from("course_plan_exam_scores")
          .select("course_plan_day_id, exam_set_id, exam_part_id, exam_subpart_id, purpose, percentage, updated_at")
          .in("course_plan_day_id", dayIds)
          .eq("student_id", options.studentId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (resourcesResult.error) throw resourcesResult.error;
  if (scoresResult.error && !["42P01", "PGRST205"].includes(String(scoresResult.error.code || ""))) {
    throw scoresResult.error;
  }

  const firstLessonDate = String(days?.[0]?.lesson_date || "");
  const lastLessonDate = String(days?.[days.length - 1]?.lesson_date || "");
  const closures =
    firstLessonDate && lastLessonDate
      ? await loadSchoolClosures({
          startDate: firstLessonDate,
          endDate: lastLessonDate,
        })
      : [];

  const items = itemsResult.data || [];
  const resources = resourcesResult.data || [];
  const examSetIds = Array.from(new Set(items.map((item) => String(item.exam_set_id))));
  const fullExamSetIds = Array.from(
    new Set(
      items
        .filter((item) => item.selection_scope === "full_exam")
        .map((item) => String(item.exam_set_id))
    )
  );
  const partIds = Array.from(
    new Set(items.map((item) => String(item.exam_part_id || "")).filter(Boolean))
  );
  const classResourceIds = Array.from(
    new Set(resources.map((item) => String(item.class_resource_id || "")).filter(Boolean))
  );
  const [examSetsResult, partsResult, fullExamPartsResult, classResourcesResult] = await Promise.all([
    examSetIds.length
      ? supabaseAdmin
          .from("cambridge_exam_sets")
          .select("id, exam_number, title")
          .in("id", examSetIds)
      : Promise.resolve({ data: [], error: null }),
    partIds.length
      ? supabaseAdmin
          .from("cambridge_exam_parts")
          .select("id, exam_set_id, part_type")
          .in("id", partIds)
      : Promise.resolve({ data: [], error: null }),
    fullExamSetIds.length
      ? supabaseAdmin
          .from("cambridge_exam_parts")
          .select("id, exam_set_id, part_type")
          .in("exam_set_id", fullExamSetIds)
      : Promise.resolve({ data: [], error: null }),
    classResourceIds.length
      ? supabaseAdmin
          .from("resources")
          .select("id, title, resource_url, active")
          .in("id", classResourceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (examSetsResult.error) throw examSetsResult.error;
  if (partsResult.error) throw partsResult.error;
  if (fullExamPartsResult.error) throw fullExamPartsResult.error;
  if (classResourcesResult.error) throw classResourcesResult.error;

  const examSets = new Map(
    (examSetsResult.data || []).map((exam) => [String(exam.id), exam])
  );
  const parts = new Map(
    [...(partsResult.data || []), ...(fullExamPartsResult.data || [])].map((part) => [
      String(part.id),
      part,
    ])
  );
  const partsByExam = new Map<string, any[]>();
  for (const part of parts.values()) {
    const examId = String(part.exam_set_id);
    partsByExam.set(examId, [...(partsByExam.get(examId) || []), part]);
  }
  const parentPartIds = Array.from(parts.keys());
  const subpartsResult = parentPartIds.length
    ? await supabaseAdmin
        .from("cambridge_exam_subparts")
        .select("id, exam_part_id, part_number, label, sort_order")
        .in("exam_part_id", parentPartIds)
    : { data: [], error: null };
  if (subpartsResult.error && !["42P01", "PGRST205"].includes(String(subpartsResult.error.code || ""))) {
    throw subpartsResult.error;
  }
  const subpartsByParent = new Map<string, any[]>();
  for (const subpart of subpartsResult.data || []) {
    const key = String(subpart.exam_part_id);
    subpartsByParent.set(key, [...(subpartsByParent.get(key) || []), subpart]);
  }
  for (const [examId, examParts] of partsByExam) {
    partsByExam.set(examId, flattenExamParts(examParts.map((part) => ({
      ...part,
      subparts: subpartsByParent.get(String(part.id)) || [],
    }))));
  }
  const examPartIds = Array.from(parts.keys());
  const examResourcesResult =
    options.includeExamResources && examPartIds.length
      ? await supabaseAdmin
          .from("cambridge_exam_part_resources")
          .select("exam_part_id, resource_type, external_url")
          .in("exam_part_id", examPartIds)
          .in("resource_type", ["paper", "audio"])
      : { data: [], error: null };
  if (examResourcesResult.error) throw examResourcesResult.error;
  const examResourcesByPart = new Map<string, any[]>();
  for (const resource of examResourcesResult.data || []) {
    const id = String(resource.exam_part_id);
    examResourcesByPart.set(id, [...(examResourcesByPart.get(id) || []), resource]);
  }
  const classResources = new Map(
    (classResourcesResult.data || []).map((resource) => [String(resource.id), resource])
  );
  const signedUrls = new Map<string, string>();
  await Promise.all(
    resources
      .filter((resource) => resource.storage_path)
      .map(async (resource) => {
        const url = await signedStorageUrl(String(resource.storage_path));
        if (url) signedUrls.set(String(resource.id), url);
      })
  );

  const itemsByDay = new Map<string, any[]>();
  for (const item of items) {
    const exam = examSets.get(String(item.exam_set_id));
    const part = (item as any).exam_subpart_id
      ? (partsByExam.get(String(item.exam_set_id)) || []).find((candidate) => String(candidate.id) === String((item as any).exam_subpart_id))
      : item.exam_part_id ? parts.get(String(item.exam_part_id)) : null;
    const selectedParts =
      item.selection_scope === "full_exam"
        ? (partsByExam.get(String(item.exam_set_id)) || []).filter(isEligibleExamPart)
        : item.selection_scope === "skill"
        ? (partsByExam.get(String(item.exam_set_id)) || []).filter((candidate) => String(candidate.parent_part_id || "") === String(item.exam_part_id))
        : part
        ? isEligibleExamPart(part) ? [part] : []
        : [];
    if (!selectedParts.length) continue;
    const value = {
      id: String(item.id),
      exam_set_id: String(item.exam_set_id),
      exam_part_id: item.exam_part_id ? String(item.exam_part_id) : null,
      exam_subpart_id: (item as any).exam_subpart_id ? String((item as any).exam_subpart_id) : null,
      purpose: String(item.purpose),
      selection_scope: String(item.selection_scope),
      sort_order: Number(item.sort_order || 0),
      exam: exam
        ? {
            id: String(exam.id),
            exam_number: Number(exam.exam_number),
            title: exam.title ? String(exam.title) : null,
          }
        : null,
      part: part
        ? { id: String(part.id), type: String(part.part_type), label: String(part.label || getHomeworkSkillLabel(options.levelName || "", part.part_type)), part_number: (part as any).part_number || null }
        : null,
      available_parts: selectedParts.map((selectedPart) => ({
        id: String(selectedPart.id),
        type: String(selectedPart.part_type),
        label: String(selectedPart.label || getHomeworkSkillLabel(options.levelName || "", selectedPart.part_type)),
        part_number: (selectedPart as any).part_number || null,
        resources: (examResourcesByPart.get(String((selectedPart as any).parent_part_id || selectedPart.id)) || [])
          .filter((resource) => isValidExternalUrl(resource.external_url))
          .map((resource) => ({
            type: String(resource.resource_type),
            label:
              String(resource.resource_type) === "audio"
                ? "Audio"
                : "Question Paper",
            url: String(resource.external_url),
          })),
      })),
    };
    const key = String(item.course_plan_day_id);
    itemsByDay.set(key, [...(itemsByDay.get(key) || []), value]);
  }

  const resourcesByDay = new Map<string, any[]>();
  for (const resource of resources) {
    const classResource = resource.class_resource_id
      ? classResources.get(String(resource.class_resource_id))
      : null;
    const directUrl = String(resource.external_url || "").trim();
    const classUrl = String(classResource?.resource_url || "").trim();
    const url =
      signedUrls.get(String(resource.id)) ||
      (String(resource.resource_type) === "external_link" ? directUrl : classUrl) ||
      null;
    const value = {
      id: String(resource.id),
      resource_type: String(resource.resource_type),
      label: String(resource.label),
      external_url: directUrl || null,
      class_resource_id: resource.class_resource_id
        ? String(resource.class_resource_id)
        : null,
      sort_order: Number(resource.sort_order || 0),
      url,
      class_resource_title: classResource?.title ? String(classResource.title) : null,
    };
    const key = String(resource.course_plan_day_id);
    resourcesByDay.set(key, [...(resourcesByDay.get(key) || []), value]);
  }

  const scoresByDay = new Map<string, any[]>();
  for (const score of scoresResult.data || []) {
    const key = String(score.course_plan_day_id);
    scoresByDay.set(key, [...(scoresByDay.get(key) || []), {
      exam_set_id: String(score.exam_set_id),
      exam_part_id: String(score.exam_part_id),
      exam_subpart_id: score.exam_subpart_id ? String(score.exam_subpart_id) : null,
      purpose: String(score.purpose),
      percentage: Number(score.percentage),
      updated_at: score.updated_at || null,
    }]);
  }

  return (days || []).map((day) => ({
    ...day,
    scheduled_start_time: normalizeScheduledTime(day.scheduled_start_time),
    scheduled_end_time: normalizeScheduledTime(day.scheduled_end_time),
    weekday: madridWeekdayForDate(String(day.lesson_date)),
    exam_items: (itemsByDay.get(String(day.id)) || []).sort(sortByOrder),
    resources: (resourcesByDay.get(String(day.id)) || []).sort(sortByOrder),
    scores: (scoresByDay.get(String(day.id)) || []).sort((left, right) =>
      String(left.exam_part_id).localeCompare(String(right.exam_part_id))
    ),
    closure: (() => {
      const match = findSchoolClosure(String(day.lesson_date), closures);
      if (!match) return null;
      return {
        id: String(match.id),
        name: String(match.name),
        closure_type: match.closure_type,
        start_date: String(match.start_date),
        end_date: String(match.end_date),
      } satisfies CoursePlanningClosure;
    })(),
  }));
}

export async function loadCoursePlanningSnapshot(
  context: CoursePlanningContext
) {
  const plan = await getExistingPlan(context.classId);
  const [library, classResources] = await Promise.all([
    loadTeacherCambridgeExamLibrary(context.homeworkContext),
    supabaseAdmin
      .from("resources")
      .select("id, title, resource_url")
      .eq("class_id", context.classId)
      .eq("active", true)
      .order("title", { ascending: true }),
  ]);
  if (classResources.error) throw classResources.error;

  const days = plan ? await loadCoursePlanDays(String(plan.id), { levelName: context.levelName }) : [];
  return {
    class: {
      id: context.classId,
      name: context.className,
      teacher: context.teacherName,
      level: context.levelName,
      level_id: context.levelId,
      course_type: context.courseType,
      days: context.classDays,
      scheduled_start_time: context.scheduledStartTime,
      scheduled_end_time: context.scheduledEndTime,
      start_date: context.startDate,
      end_date: context.endDate,
      has_course_dates: context.hasCourseDates,
    },
    blocked: !context.hasCourseDates,
    blocked_message: context.hasCourseDates
      ? null
      : "Course start and end dates must be added by Admin before Course Planning can be created.",
    plan: plan
      ? {
          ...plan,
          days,
        }
      : null,
    exams: library.exams,
    class_resources: (classResources.data || []).map((resource) => ({
      id: String(resource.id),
      title: String(resource.title || "Class resource"),
      resource_url: String(resource.resource_url || ""),
    })),
  };
}

function parseExamItems(value: unknown): ParsedExamItem[] {
  if (!Array.isArray(value)) {
    throw new CoursePlanningError("Exam activities must be a list.", 422);
  }
  if (value.length > 32) {
    throw new CoursePlanningError("Too many exam activities were supplied.", 422);
  }
  const seen = new Set<string>();
  const wholeExamByPurpose = new Set<string>();
  return value.map((item, index) => {
    const record = checkObject(item, "Invalid exam activity.");
    const allowed = new Set([
      "exam_set_id",
      "exam_part_id",
      "exam_subpart_id",
      "purpose",
      "selection_scope",
    ]);
    if (Object.keys(record).some((key) => !allowed.has(key))) {
      throw new CoursePlanningError("An exam activity contains unsupported fields.", 422);
    }
    const examSetId = String(record.exam_set_id || "").trim();
    const examPartId = String(record.exam_part_id || "").trim() || null;
    const examSubpartId = String(record.exam_subpart_id || "").trim() || null;
    const purpose = String(record.purpose || "");
    const selectionScope = String(record.selection_scope || "");
    if (!validId(examSetId)) {
      throw new CoursePlanningError("Choose a valid Cambridge exam.", 422);
    }
    if (purpose !== "class_practice" && purpose !== "homework") {
      throw new CoursePlanningError("Choose a valid exam activity type.", 422);
    }
    if (selectionScope !== "full_exam" && selectionScope !== "skill" && selectionScope !== "part") {
      throw new CoursePlanningError("Choose a full exam, skill, or exam part.", 422);
    }
    if ((selectionScope === "full_exam" && (examPartId || examSubpartId)) ||
      (selectionScope === "skill" && (!validId(examPartId) || examSubpartId)) ||
      (selectionScope === "part" && (!validId(examPartId) || (examSubpartId && !validId(examSubpartId))))) {
      throw new CoursePlanningError("The selected exam activity is not valid.", 422);
    }
    const selectionKey =
      purpose + "|" + selectionScope + "|" + examSetId + "|" + (examPartId || "") + "|" + (examSubpartId || "");
    if (seen.has(selectionKey)) {
      throw new CoursePlanningError("The same exam activity can only be selected once per lesson.", 422);
    }
    const purposeExamKey = purpose + "|" + examSetId;
    if (selectionScope === "full_exam") {
      if (wholeExamByPurpose.has(purposeExamKey)) {
        throw new CoursePlanningError("The same whole exam can only be selected once per lesson.", 422);
      }
      if (seen.has(purpose + "|part|" + examSetId)) {
        throw new CoursePlanningError("Choose Whole exam or individual parts for the same exam, not both.", 422);
      }
      wholeExamByPurpose.add(purposeExamKey);
    } else if (wholeExamByPurpose.has(purposeExamKey)) {
      throw new CoursePlanningError("Choose Whole exam or individual parts for the same exam, not both.", 422);
    }
    seen.add(selectionKey);
    if (selectionScope === "part" || selectionScope === "skill") seen.add(purpose + "|part|" + examSetId);
    return {
      examSetId,
      examPartId,
      examSubpartId,
      purpose: purpose as ParsedExamItem["purpose"],
      selectionScope: selectionScope as ParsedExamItem["selectionScope"],
      sortOrder: index,
    };
  });
}

function parseResources(value: unknown): ParsedResource[] {
  if (!Array.isArray(value)) {
    throw new CoursePlanningError("Course resources must be a list.", 422);
  }
  if (value.length > 24) {
    throw new CoursePlanningError("Too many course resources were supplied.", 422);
  }
  return value.map((resource, index) => {
    const record = checkObject(resource, "Invalid course resource.");
    const allowed = new Set(["resource_type", "label", "external_url", "class_resource_id"]);
    if (Object.keys(record).some((key) => !allowed.has(key))) {
      throw new CoursePlanningError("A resource contains unsupported fields.", 422);
    }
    const resourceType = String(record.resource_type || "");
    const label = requireText(record.label, "Resource label", MAX_RESOURCE_LABEL_LENGTH);
    if (resourceType === "external_link") {
      const url = normalizeExternalUrl(record.external_url);
      if (!isValidExternalUrl(url)) {
        throw new CoursePlanningError("Enter a valid HTTP or HTTPS resource link.", 422);
      }
      return {
        resourceType,
        label,
        externalUrl: url,
        classResourceId: null,
        sortOrder: index,
      };
    }
    const classResourceId = String(record.class_resource_id || "").trim();
    if (resourceType !== "class_resource" || !validId(classResourceId)) {
      throw new CoursePlanningError("Choose a valid class resource.", 422);
    }
    return {
      resourceType,
      label,
      externalUrl: null,
      classResourceId,
      sortOrder: index,
    };
  });
}

async function verifyExamItems(context: CoursePlanningContext, items: ParsedExamItem[]) {
  const examSetIds = Array.from(new Set(items.map((item) => item.examSetId)));
  const partIds = Array.from(
    new Set(items.map((item) => item.examPartId).filter((item): item is string => Boolean(item)))
  );
  const subpartIds = Array.from(
    new Set(items.map((item) => item.examSubpartId).filter((item): item is string => Boolean(item)))
  );
  const [examsResult, partsResult] = await Promise.all([
    examSetIds.length
      ? supabaseAdmin
          .from("cambridge_exam_sets")
          .select("id, level_id, active, archived_at")
          .in("id", examSetIds)
          .eq("level_id", context.levelId)
          .eq("active", true)
          .is("archived_at", null)
      : Promise.resolve({ data: [], error: null }),
    partIds.length
      ? supabaseAdmin
          .from("cambridge_exam_parts")
          .select("id, exam_set_id, part_type")
          .in("id", partIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (examsResult.error) throw examsResult.error;
  if (partsResult.error) throw partsResult.error;
  const subpartsResult = subpartIds.length
    ? await supabaseAdmin
        .from("cambridge_exam_subparts")
        .select("id, exam_part_id, part_number, label")
        .in("id", subpartIds)
    : { data: [], error: null };
  if (subpartsResult.error && !["42P01", "PGRST205"].includes(String(subpartsResult.error.code || ""))) {
    throw subpartsResult.error;
  }
  const availableExamIds = new Set((examsResult.data || []).map((exam) => String(exam.id)));
  if (availableExamIds.size !== examSetIds.length) {
    throw new CoursePlanningError("One or more selected Cambridge exams are unavailable.", 422);
  }
  const parts = new Map(
    (partsResult.data || []).map((part) => [String(part.id), part])
  );
  for (const item of items) {
    const part = item.examPartId ? parts.get(item.examPartId) : null;
    if (item.examPartId && String(part?.exam_set_id || "") !== item.examSetId) {
      throw new CoursePlanningError("An exam part does not belong to the selected exam.", 422);
    }
    if (item.examPartId && !isEligibleExamPart(part || { part_type: "" })) {
      throw new CoursePlanningError("Speaking cannot be assigned in Express or Intensive Course Planning.", 422);
    }
    if (item.examSubpartId) {
      const subpart = (subpartsResult.data || []).find((row) => String(row.id) === item.examSubpartId);
      if (!subpart || String(subpart.exam_part_id) !== String(item.examPartId)) {
        throw new CoursePlanningError("An exam part does not belong to the selected exam skill.", 422);
      }
    }
  }

  const allPartRows = examSetIds.length
    ? await supabaseAdmin
        .from("cambridge_exam_parts")
        .select("id, exam_set_id, part_type")
        .in("exam_set_id", examSetIds)
    : { data: [], error: null };
  if (allPartRows.error) throw allPartRows.error;
  const allParentIds = (allPartRows.data || []).map((part) => String(part.id));
  const allSubpartsResult = allParentIds.length
    ? await supabaseAdmin
        .from("cambridge_exam_subparts")
        .select("id, exam_part_id, part_number, label")
        .in("exam_part_id", allParentIds)
    : { data: [], error: null };
  if (allSubpartsResult.error && !["42P01", "PGRST205"].includes(String(allSubpartsResult.error.code || ""))) throw allSubpartsResult.error;
  const subpartsByParent = new Map<string, any[]>();
  for (const row of allSubpartsResult.data || []) {
    const key = String(row.exam_part_id);
    subpartsByParent.set(key, [...(subpartsByParent.get(key) || []), row]);
  }
  const exams: CoursePlanExam[] = examSetIds.map((examSetId) => ({
    id: examSetId,
    exam_number: 0,
    parts: flattenExamParts((allPartRows.data || [])
      .filter((part) => String(part.exam_set_id) === examSetId)
      .map((part) => ({
        id: String(part.id),
        exam_set_id: String(part.exam_set_id),
        part_type: String(part.part_type),
        subparts: subpartsByParent.get(String(part.id)) || [],
      }))),
  }));
  const expanded = expandSelections(
    items.map((item) => ({
      exam_set_id: item.examSetId,
      exam_part_id: item.examPartId,
      exam_subpart_id: item.examSubpartId,
      purpose: item.purpose,
      selection_scope: item.selectionScope,
    })),
    exams
  );
  const assigned = new Map<string, string>();
  for (const part of expanded) {
    const key = `${part.exam_set_id}:${part.id}`;
    const existingPurpose = assigned.get(key);
    if (existingPurpose && existingPurpose === part.purpose) {
      throw new CoursePlanningError("The same exam part can only be selected once per activity.", 422);
    }
    if (existingPurpose && existingPurpose !== part.purpose) {
      throw new CoursePlanningError(
        "Each exam part can be assigned to Homework or Classwork once, not both.",
        422
      );
    }
    assigned.set(key, part.purpose);
  }
}

async function verifyResources(
  classId: string,
  resources: ParsedResource[]
) {
  const ids = Array.from(
    new Set(
      resources
        .map((resource) => resource.classResourceId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (!ids.length) return;
  const { data, error } = await supabaseAdmin
    .from("resources")
    .select("id")
    .eq("class_id", classId)
    .eq("active", true)
    .in("id", ids);
  if (error) throw error;
  if ((data || []).length !== ids.length) {
    throw new CoursePlanningError("One or more selected class resources are unavailable.", 422);
  }
}

async function getPlanDay(context: CoursePlanningContext, dayId: string) {
  if (!validId(dayId)) throw new CoursePlanningError("Invalid planned lesson.", 400);
  const { data, error } = await supabaseAdmin
    .from("course_plan_days")
    .select(
      "id, course_plan_id, lesson_date, scheduled_start_time, scheduled_end_time, course_plans!inner (id, class_id, status)"
    )
    .eq("id", dayId)
    .eq("course_plans.class_id", context.classId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CoursePlanningError("Planned lesson was not found.", 404);
  return data;
}

async function getCoursePlanningClosure(lessonDate: string) {
  const closures = await loadSchoolClosures({
    startDate: lessonDate,
    endDate: lessonDate,
  });
  return findSchoolClosure(lessonDate, closures);
}

async function rejectClosedLesson(lessonDate: string) {
  if (!isCoursePlanningDate(lessonDate)) {
    throw new CoursePlanningError("Unable to verify the planned lesson date.", 422);
  }
  const closure = await getCoursePlanningClosure(lessonDate);
  if (!closure) return;
  throw new CoursePlanningError(
    `School is closed on ${lessonDate} for ${String(closure.name)}. This lesson is read-only.`,
    422
  );
}

async function deactivateHomeworkForDay(dayId: string) {
  const { error } = await supabaseAdmin
    .from("cambridge_exam_assignments")
    .update({ active: false })
    .eq("course_plan_day_id", dayId)
    .is("archived_at", null);
  if (error) throw error;
}

async function syncHomeworkForDay(
  context: CoursePlanningContext,
  day: any,
  planStatus: string
) {
  if (await getCoursePlanningClosure(String(day.lesson_date))) {
    await deactivateHomeworkForDay(String(day.id));
    return;
  }
  const { data: homeworkItems, error: itemError } = await supabaseAdmin
    .from("course_plan_exam_items")
    .select("id, exam_set_id, exam_part_id, exam_subpart_id, selection_scope")
    .eq("course_plan_day_id", day.id)
    .eq("purpose", "homework")
    .order("sort_order", { ascending: true });
  if (itemError) throw itemError;
  if (!(homeworkItems || []).length) return;

  const dueDate = String(day.homework_due_date || "").trim();
  if (!isCoursePlanningDate(dueDate) || dueDate < String(day.lesson_date)) {
    throw new CoursePlanningError("Homework needs a valid due date on or after the lesson date.", 422);
  }

  const examSetIds = Array.from(
    new Set((homeworkItems || []).map((item) => String(item.exam_set_id)))
  );
  const { data: allParts, error: partError } = await supabaseAdmin
    .from("cambridge_exam_parts")
    .select("id, exam_set_id, part_type")
    .in("exam_set_id", examSetIds);
  if (partError) throw partError;
  const partsByExam = new Map<string, Array<{ parentId: string; id: string; subpartId: string | null }>>();
  const parentRows = allParts || [];
  const subpartsForHomework = parentRows.length
    ? await supabaseAdmin.from("cambridge_exam_subparts").select("id, exam_part_id").in("exam_part_id", parentRows.map((part) => String(part.id)))
    : { data: [], error: null };
  if (subpartsForHomework.error && !["42P01", "PGRST205"].includes(String(subpartsForHomework.error.code || ""))) throw subpartsForHomework.error;
  const childrenByParent = new Map<string, string[]>();
  for (const child of subpartsForHomework.data || []) childrenByParent.set(String(child.exam_part_id), [...(childrenByParent.get(String(child.exam_part_id)) || []), String(child.id)]);
  for (const part of parentRows) {
    if (!isEligibleExamPart(part)) continue;
    const examId = String(part.exam_set_id);
    const children = childrenByParent.get(String(part.id)) || [];
    const values = children.length
      ? children.map((childId) => ({ parentId: String(part.id), id: childId, subpartId: childId }))
      : [{ parentId: String(part.id), id: String(part.id), subpartId: null }];
    partsByExam.set(examId, [...(partsByExam.get(examId) || []), ...values]);
  }

  for (const item of homeworkItems || []) {
    const selections =
      item.selection_scope === "full_exam"
        ? partsByExam.get(String(item.exam_set_id)) || []
        : [{ parentId: String(item.exam_part_id || ""), id: String(item.exam_subpart_id || item.exam_part_id || ""), subpartId: item.exam_subpart_id ? String(item.exam_subpart_id) : null }].filter((entry) => Boolean(entry.id));
    if (!selections.length) {
      throw new CoursePlanningError("A homework exam selection is no longer available.", 422);
    }
    for (const selection of selections) {
      let existingQuery = supabaseAdmin
        .from("cambridge_exam_assignments")
        .select("id")
        .eq("course_plan_day_id", day.id)
        .eq("exam_part_id", selection.parentId)
        .is("archived_at", null);
      existingQuery = selection.subpartId
        ? existingQuery.eq("exam_subpart_id", selection.subpartId)
        : existingQuery.is("exam_subpart_id", null);
      const { data: existing, error: existingError } = await existingQuery.maybeSingle();
      if (existingError) throw existingError;
      const assignmentValues = {
        course_type: context.courseType,
        release_date: day.lesson_date,
        due_date: dueDate,
        active: planStatus === "published",
        course_plan_day_id: day.id,
        course_plan_class_id: context.classId,
        updated_by: context.actorId,
      };
      let assignmentId = String(existing?.id || "");
      if (assignmentId) {
        const { error } = await supabaseAdmin
          .from("cambridge_exam_assignments")
          .update(assignmentValues)
          .eq("id", assignmentId);
        if (error) throw error;
      } else {
        const { data: assignment, error } = await supabaseAdmin
          .from("cambridge_exam_assignments")
          .insert({
            ...assignmentValues,
            exam_part_id: selection.parentId,
            exam_subpart_id: selection.subpartId,
            created_by: context.actorId,
          })
          .select("id")
          .single();
        if (error || !assignment) throw error || new Error("Assignment insert failed.");
        assignmentId = String(assignment.id);
      }
      const { error: mapError } = await supabaseAdmin
        .from("course_plan_homework_assignments")
        .upsert({
          course_plan_exam_item_id: item.id,
          cambridge_exam_assignment_id: assignmentId,
        });
      if (mapError) throw mapError;
    }
  }
}

export async function saveCoursePlanningDay(
  context: CoursePlanningContext,
  body: unknown
) {
  const record = checkObject(body, "Invalid Course Planning request.");
  const allowed = new Set([
    "action",
    "day_id",
    "pages_to_cover",
    "other_activities",
    "homework_instructions",
    "homework_due_date",
    "exam_items",
    "resources",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key)) || record.action !== "save_day") {
    throw new CoursePlanningError("Invalid Course Planning request.", 400);
  }
  const day = await getPlanDay(context, String(record.day_id || ""));
  await rejectClosedLesson(String(day.lesson_date));
  const plan = Array.isArray(day.course_plans) ? day.course_plans[0] : day.course_plans;
  const examItems = parseExamItems(record.exam_items);
  const resources = parseResources(record.resources);
  await Promise.all([verifyExamItems(context, examItems), verifyResources(context.classId, resources)]);

  const homeworkInstructions = cleanText(record.homework_instructions, "Homework instructions");
  const homeworkDueDate = String(record.homework_due_date || "").trim() || null;
  const hasHomework =
    Boolean(homeworkInstructions) || examItems.some((item) => item.purpose === "homework");
  if (hasHomework) {
    if (!isCoursePlanningDate(homeworkDueDate) || homeworkDueDate < String(day.lesson_date)) {
      throw new CoursePlanningError("Homework needs a due date on or after the lesson date.", 422);
    }
  } else if (homeworkDueDate) {
    if (!isCoursePlanningDate(homeworkDueDate) || homeworkDueDate < String(day.lesson_date)) {
      throw new CoursePlanningError("Homework due date is not valid.", 422);
    }
  }

  await deactivateHomeworkForDay(String(day.id));
  const { error: dayUpdateError } = await supabaseAdmin
    .from("course_plan_days")
    .update({
      pages_to_cover: cleanText(record.pages_to_cover, "Pages to be covered"),
      other_activities: cleanText(record.other_activities, "Other activities"),
      homework_instructions: homeworkInstructions,
      homework_due_date: homeworkDueDate,
    })
    .eq("id", day.id);
  if (dayUpdateError) throw dayUpdateError;

  const { error: deleteItemsError } = await supabaseAdmin
    .from("course_plan_exam_items")
    .delete()
    .eq("course_plan_day_id", day.id);
  if (deleteItemsError) throw deleteItemsError;
  if (examItems.length) {
    const { error: insertItemsError } = await supabaseAdmin
      .from("course_plan_exam_items")
      .insert(
        examItems.map((item) => ({
          course_plan_day_id: day.id,
          exam_set_id: item.examSetId,
          exam_part_id: item.examPartId,
          exam_subpart_id: item.examSubpartId,
          purpose: item.purpose,
          selection_scope: item.selectionScope,
          sort_order: item.sortOrder,
        }))
      );
    if (insertItemsError) throw insertItemsError;
  }

  const { error: deleteResourcesError } = await supabaseAdmin
    .from("course_plan_resources")
    .delete()
    .eq("course_plan_day_id", day.id)
    .in("resource_type", ["external_link", "class_resource"]);
  if (deleteResourcesError) throw deleteResourcesError;
  if (resources.length) {
    const { error: insertResourcesError } = await supabaseAdmin
      .from("course_plan_resources")
      .insert(
        resources.map((resource) => ({
          course_plan_day_id: day.id,
          resource_type: resource.resourceType,
          label: resource.label,
          external_url: resource.externalUrl,
          class_resource_id: resource.classResourceId,
          sort_order: resource.sortOrder,
        }))
      );
    if (insertResourcesError) throw insertResourcesError;
  }

  const { data: updatedDay, error: updatedDayError } = await supabaseAdmin
    .from("course_plan_days")
    .select("id, lesson_date, homework_due_date")
    .eq("id", day.id)
    .single();
  if (updatedDayError || !updatedDay) throw updatedDayError || new Error("Day reload failed.");
  await syncHomeworkForDay(context, updatedDay, String(plan?.status || "draft"));
  await supabaseAdmin
    .from("course_plans")
    .update({ updated_by: context.actorId })
    .eq("id", day.course_plan_id);
}

export async function setCoursePlanPublication(
  context: CoursePlanningContext,
  action: "publish" | "unpublish"
) {
  const plan = await ensureCoursePlan(context);
  if (action === "unpublish" && context.role !== "admin") {
    throw new CoursePlanningError("Only Admin can unpublish a course plan.", 403);
  }
  const nextStatus = action === "publish" ? "published" : "draft";
  const { error: planError } = await supabaseAdmin
    .from("course_plans")
    .update({
      status: nextStatus,
      updated_by: context.actorId,
      ...(action === "publish"
        ? { published_by: context.actorId, published_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", plan.id);
  if (planError) throw planError;

  if (action === "unpublish") {
    const { error } = await supabaseAdmin
      .from("cambridge_exam_assignments")
      .update({ active: false, updated_by: context.actorId })
      .eq("course_plan_class_id", context.classId)
      .is("archived_at", null);
    if (error) throw error;
    return;
  }

  const { data: days, error: daysError } = await supabaseAdmin
    .from("course_plan_days")
    .select("id, lesson_date, homework_due_date")
    .eq("course_plan_id", plan.id);
  if (daysError) throw daysError;
  for (const day of days || []) {
    await syncHomeworkForDay(context, day, "published");
  }
}

export async function addCoursePlanUploadedResource(input: {
  context: CoursePlanningContext;
  dayId: string;
  resourceType: "pdf" | "audio";
  label: string;
  storagePath: string;
  mimeType: string;
  originalFilename: string;
  fileSize: number;
}) {
  const day = await getPlanDay(input.context, input.dayId);
  await rejectClosedLesson(String(day.lesson_date));
  const { data: lastResource, error: lastError } = await supabaseAdmin
    .from("course_plan_resources")
    .select("sort_order")
    .eq("course_plan_day_id", day.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;
  const { data, error } = await supabaseAdmin
    .from("course_plan_resources")
    .insert({
      course_plan_day_id: day.id,
      resource_type: input.resourceType,
      label: input.label,
      storage_path: input.storagePath,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      file_size: input.fileSize,
      sort_order: Number(lastResource?.sort_order || 0) + 1,
    })
    .select("id")
    .single();
  if (error || !data) throw error || new Error("Resource insert failed.");
  return String(data.id);
}

export async function deleteCoursePlanResource(
  context: CoursePlanningContext,
  resourceId: string
) {
  if (!validId(resourceId)) throw new CoursePlanningError("Invalid course resource.", 400);
  const { data: resource, error } = await supabaseAdmin
    .from("course_plan_resources")
    .select("id, storage_path, course_plan_days!inner (lesson_date, course_plans!inner (class_id))")
    .eq("id", resourceId)
    .eq("course_plan_days.course_plans.class_id", context.classId)
    .maybeSingle();
  if (error) throw error;
  if (!resource) throw new CoursePlanningError("Course resource was not found.", 404);
  const resourceDay = Array.isArray(resource.course_plan_days)
    ? resource.course_plan_days[0]
    : resource.course_plan_days;
  await rejectClosedLesson(String(resourceDay?.lesson_date || ""));
  const { error: deleteError } = await supabaseAdmin
    .from("course_plan_resources")
    .delete()
    .eq("id", resourceId);
  if (deleteError) throw deleteError;
  if (resource.storage_path) {
    const { error: storageError } = await supabaseAdmin.storage
      .from(COURSE_PLAN_BUCKET)
      .remove([String(resource.storage_path)]);
    if (storageError) {
      console.error("Course plan file cleanup failed:", { resourceId, code: storageError.name });
    }
  }
}
