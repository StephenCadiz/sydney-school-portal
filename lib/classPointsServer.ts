import "server-only";

import { NextRequest } from "next/server";

import {
  authorizeTeacherHomeworkClass,
  TeacherHomeworkError,
} from "./teacherHomeworkServer";
import { supabaseAdmin } from "./supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ClassPointsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type ClassPointsAction = boolean | null;

export type ClassPointsEntryInput = {
  youngLearnerId: string;
  homeworkDone: ClassPointsAction;
  speakingEnglish: ClassPointsAction;
  goodBehaviour: ClassPointsAction;
  examMark: number | null;
};

export type ClassPointsContext = {
  actorId: string;
  role: "teacher" | "admin";
  classId: string;
  className: string;
  academicYear: string;
};

function getMadridDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
  };
}

export function getCurrentMadridAcademicYear(date = new Date()) {
  const { year, month } = getMadridDateParts(date);
  const startYear = month >= 9 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function getName(profile: any, fallback: string) {
  return `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    fallback;
}

function displayName(learner: any, firstNameCounts: Map<string, number>) {
  const firstName = String(learner?.first_name || "").trim() || "Learner";
  const lastName = String(learner?.last_name || "").trim();
  const duplicate =
    (firstNameCounts.get(firstName.toLocaleLowerCase()) || 0) > 1;

  return duplicate && lastName
    ? `${firstName} ${lastName.charAt(0).toUpperCase()}.`
    : firstName;
}

export async function getClassPointsContext(
  request: NextRequest,
  requestedClassId: string
): Promise<ClassPointsContext> {
  if (!UUID_PATTERN.test(requestedClassId)) {
    throw new ClassPointsError("Class Points are not available for this class.", 404);
  }

  let access;
  try {
    access = await authorizeTeacherHomeworkClass(request, requestedClassId);
  } catch (error) {
    if (error instanceof TeacherHomeworkError) {
      throw new ClassPointsError(error.message, error.status);
    }
    throw error;
  }

  const { data: classroom, error } = await supabaseAdmin
    .from("classes")
    .select("id, is_cambridge, class_name")
    .eq("id", access.classId)
    .maybeSingle();
  if (error) throw error;
  if (!classroom || classroom.is_cambridge === true) {
    throw new ClassPointsError("Class Points are not available for this class.", 404);
  }

  return {
    actorId: access.actorId,
    role: access.role,
    classId: access.classId,
    className: String(classroom.class_name || "").trim() || "Class",
    academicYear: getCurrentMadridAcademicYear(),
  };
}

export function parseClassPointsEntry(body: unknown): ClassPointsEntryInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ClassPointsError("Invalid points entry.", 400);
  }

  const record = body as Record<string, unknown>;
  const allowed = new Set([
    "young_learner_id",
    "homework_done",
    "speaking_english",
    "good_behaviour",
    "exam_mark",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new ClassPointsError("The request contains unsupported fields.", 400);
  }

  const youngLearnerId = String(record.young_learner_id || "").trim();
  if (!UUID_PATTERN.test(youngLearnerId)) {
    throw new ClassPointsError("This learner is not enrolled in the selected class.", 422);
  }

  function optionalAction(value: unknown) {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value;
    throw new ClassPointsError("Select Yes, No, or Not recorded for each action.", 422);
  }

  const examValue = record.exam_mark;
  let examMark: number | null = null;
  if (examValue !== undefined && examValue !== null) {
    if (
      typeof examValue !== "number" ||
      !Number.isInteger(examValue) ||
      examValue < 1 ||
      examValue > 10
    ) {
      throw new ClassPointsError(
        "Exam marks must be whole numbers from 1 to 10.",
        422
      );
    }
    examMark = examValue;
  }

  const homeworkDone = optionalAction(record.homework_done);
  const speakingEnglish = optionalAction(record.speaking_english);
  const goodBehaviour = optionalAction(record.good_behaviour);
  if (
    homeworkDone === null &&
    speakingEnglish === null &&
    goodBehaviour === null &&
    examMark === null
  ) {
    throw new ClassPointsError("Select at least one action or exam mark.", 422);
  }

  return {
    youngLearnerId,
    homeworkDone,
    speakingEnglish,
    goodBehaviour,
    examMark,
  };
}

export function calculateClassPointsDelta(input: ClassPointsEntryInput) {
  const actionPoints = (value: ClassPointsAction) =>
    value === true ? 1 : value === false ? -1 : 0;

  return (
    actionPoints(input.homeworkDone) +
    actionPoints(input.speakingEnglish) +
    actionPoints(input.goodBehaviour) +
    (input.examMark || 0)
  );
}

export async function loadClassPointsSnapshot(context: ClassPointsContext) {
  const { data: learners, error: learnerError } = await supabaseAdmin
    .from("young_learners")
    .select("id, first_name, last_name, active")
    .eq("class_id", context.classId)
    .eq("active", true)
    .order("first_name")
    .order("last_name");
  if (learnerError) throw learnerError;

  const learnerRows = learners || [];
  const learnerIds = learnerRows.map((learner) => String(learner.id));
  const entryResult = learnerIds.length
    ? await supabaseAdmin
        .from("young_learner_class_point_entries")
        .select(
          "id, young_learner_id, teacher_id, homework_done, speaking_english, good_behaviour, exam_mark, points_delta, created_at"
        )
        .eq("class_id", context.classId)
        .eq("academic_year", context.academicYear)
        .is("deleted_at", null)
        .in("young_learner_id", learnerIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (entryResult.error) throw entryResult.error;

  const entries = entryResult.data || [];
  const teacherIds = Array.from(
    new Set(entries.map((entry) => String(entry.teacher_id || "")).filter(Boolean))
  );
  const teacherResult = teacherIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", teacherIds)
    : { data: [], error: null };
  if (teacherResult.error) throw teacherResult.error;

  const teachers = new Map(
    (teacherResult.data || []).map((teacher) => [
      String(teacher.id),
      getName(teacher, "Former staff member"),
    ])
  );
  const histories = new Map<string, any[]>();
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const learnerId = String(entry.young_learner_id);
    totals.set(learnerId, (totals.get(learnerId) || 0) + Number(entry.points_delta || 0));
    histories.set(learnerId, [
      ...(histories.get(learnerId) || []),
      {
        ...entry,
        teacher_name: teachers.get(String(entry.teacher_id || "")) || "Former staff member",
      },
    ]);
  }

  const firstNameCounts = new Map<string, number>();
  for (const learner of learnerRows) {
    const firstName = String(learner.first_name || "").trim().toLocaleLowerCase();
    if (firstName) firstNameCounts.set(firstName, (firstNameCounts.get(firstName) || 0) + 1);
  }
  const rankedLearners = learnerRows
    .map((learner) => ({
      id: String(learner.id),
      first_name: String(learner.first_name || "").trim(),
      last_name: String(learner.last_name || "").trim(),
      display_name: displayName(learner, firstNameCounts),
      points_total: totals.get(String(learner.id)) || 0,
      history: histories.get(String(learner.id)) || [],
    }))
    .sort(
      (first, second) =>
        second.points_total - first.points_total ||
        first.first_name.localeCompare(second.first_name) ||
        first.last_name.localeCompare(second.last_name) ||
        first.id.localeCompare(second.id)
    );

  let previousPoints: number | null = null;
  let previousRank = 0;
  const learnersWithRanks = rankedLearners.map((learner, index) => {
    const rank =
      previousPoints === learner.points_total ? previousRank : index + 1;
    previousPoints = learner.points_total;
    previousRank = rank;
    return { ...learner, rank };
  });

  return {
    class: { id: context.classId, name: context.className },
    academic_year: context.academicYear,
    learners: learnersWithRanks,
  };
}
