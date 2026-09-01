import "server-only";

import {
  calculateMockResultAverage,
  isMockResultReviewStatus,
  toMockScore,
  type AdminMockReviewRow,
  type MockResultReviewStatus,
  type MockResultWorkflowRow,
} from "./mockResultWorkflow";
import { supabaseAdmin } from "./supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MockResultWorkflowError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type TeacherMockResultInput = {
  resultId: string | null;
  classId: string;
  studentId: string;
  mockNumber: number;
  reading: number | null;
  writing: number | null;
  listening: number | null;
  speaking: number | null;
  comments: string;
  action: "save_draft" | "submit";
};

export type AdminMockResultEditAction =
  | "save_changes"
  | "save_and_publish"
  | "save_published";

export type AdminMockResultEditInput = {
  resultId: string;
  reading: number;
  writing: number;
  listening: number;
  speaking: number;
  comments: string;
  action: AdminMockResultEditAction;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function personName(profile: any, fallback: string) {
  const name = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
  return name || fallback;
}

function validateScore(value: unknown, label: string) {
  const score = toMockScore(value);
  if (score !== null && (score < 0 || score > 100)) {
    throw new MockResultWorkflowError(`${label} must be between 0 and 100.`);
  }
  return score;
}

export function validateTeacherMockResultInput(
  input: unknown
): TeacherMockResultInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new MockResultWorkflowError("Invalid Mock Result details.");
  }

  const body = input as Record<string, unknown>;
  const allowed = new Set([
    "result_id",
    "class_id",
    "student_id",
    "mock_number",
    "reading",
    "writing",
    "listening",
    "speaking",
    "comments",
    "action",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new MockResultWorkflowError("The request contains unsupported fields.");
  }

  const resultId = text(body.result_id) || null;
  const classId = text(body.class_id);
  const studentId = text(body.student_id);
  const mockNumber = Number(body.mock_number);
  const comments = body.comments === null ? "" : text(body.comments);
  const action = body.action;

  if (resultId && !UUID_PATTERN.test(resultId)) {
    throw new MockResultWorkflowError("Invalid Mock Result identifier.");
  }
  if (!UUID_PATTERN.test(classId) || !UUID_PATTERN.test(studentId)) {
    throw new MockResultWorkflowError("A valid class and student are required.");
  }
  if (!Number.isInteger(mockNumber) || mockNumber < 1) {
    throw new MockResultWorkflowError(
      "Mock number must be a positive whole number."
    );
  }
  if (body.comments !== null && body.comments !== undefined && typeof body.comments !== "string") {
    throw new MockResultWorkflowError("Comments must be text.");
  }
  if (comments.length > 5000) {
    throw new MockResultWorkflowError("Comments must be 5000 characters or fewer.");
  }
  if (action !== "save_draft" && action !== "submit") {
    throw new MockResultWorkflowError("Choose a valid Mock Result action.");
  }

  const value: TeacherMockResultInput = {
    resultId,
    classId,
    studentId,
    mockNumber,
    reading: validateScore(body.reading, "Reading"),
    writing: validateScore(body.writing, "Writing"),
    listening: validateScore(body.listening, "Listening"),
    speaking: validateScore(body.speaking, "Speaking"),
    comments,
    action,
  };

  if (
    action === "submit" &&
    [value.reading, value.writing, value.listening, value.speaking].some(
      (score) => score === null
    )
  ) {
    throw new MockResultWorkflowError(
      "Enter all four Mock Exam scores before submitting for Admin review."
    );
  }

  return value;
}

export function validateAdminMockResultEditInput(
  input: unknown
): AdminMockResultEditInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new MockResultWorkflowError("Invalid Mock Result edit details.");
  }

  const body = input as Record<string, unknown>;
  const allowed = new Set([
    "result_id",
    "reading",
    "writing",
    "listening",
    "speaking",
    "comments",
    "action",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new MockResultWorkflowError("The request contains unsupported fields.");
  }

  const resultId = text(body.result_id);
  if (!UUID_PATTERN.test(resultId)) {
    throw new MockResultWorkflowError("Invalid Mock Result identifier.");
  }

  const action = body.action;
  if (
    action !== "save_changes" &&
    action !== "save_and_publish" &&
    action !== "save_published"
  ) {
    throw new MockResultWorkflowError("Choose a valid Admin edit action.");
  }

  if (
    body.comments !== null &&
    body.comments !== undefined &&
    typeof body.comments !== "string"
  ) {
    throw new MockResultWorkflowError("Comments must be text.");
  }
  const comments = body.comments === null ? "" : text(body.comments);
  if (comments.length > 5000) {
    throw new MockResultWorkflowError(
      "Comments must be 5000 characters or fewer."
    );
  }

  const scores = {
    reading: validateScore(body.reading, "Reading"),
    writing: validateScore(body.writing, "Writing"),
    listening: validateScore(body.listening, "Listening"),
    speaking: validateScore(body.speaking, "Speaking"),
  };
  if (Object.values(scores).some((score) => score === null)) {
    throw new MockResultWorkflowError(
      "Enter all four Mock Exam scores before saving Admin changes."
    );
  }

  return {
    resultId,
    reading: scores.reading as number,
    writing: scores.writing as number,
    listening: scores.listening as number,
    speaking: scores.speaking as number,
    comments,
    action,
  };
}

function mergeResultAndReview(result: any, review: any): MockResultWorkflowRow {
  const status: MockResultReviewStatus = isMockResultReviewStatus(review?.status)
    ? review.status
    : result.published_at
      ? "published"
      : "draft";
  const source = review || result;
  const mockNumber = Number(source.mock_number || result.mock_number || 1);

  return {
    id: String(result.id),
    review_id: String(review?.id || ""),
    class_id: String(result.class_id || ""),
    student_id: String(result.student_id || ""),
    teacher_id: String(result.teacher_id || ""),
    result_type: "mock",
    status,
    mock_number:
      Number.isInteger(mockNumber) && mockNumber > 0 ? mockNumber : 1,
    title: text(source.title) || `Mock ${mockNumber || 1}`,
    reading: toMockScore(source.reading),
    writing: toMockScore(source.writing),
    listening: toMockScore(source.listening),
    speaking: toMockScore(source.speaking),
    overall:
      toMockScore(source.overall) ??
      calculateMockResultAverage([
        source.reading,
        source.writing,
        source.listening,
        source.speaking,
      ]),
    comments: text(source.comments) || null,
    review_note: text(review?.review_note) || null,
    submitted_at: review?.submitted_at || null,
    submitted_by: review?.submitted_by || null,
    reviewed_at: review?.reviewed_at || null,
    reviewed_by: review?.reviewed_by || null,
    published_at: result.published_at || null,
    published_by: review?.published_by || null,
    approved_version_available: Boolean(result.published_at),
    created_at: review?.created_at || result.created_at || null,
    updated_at: review?.updated_at || result.updated_at || null,
  };
}

export async function loadTeacherMockResults(
  classId: string,
  studentId: string
) {
  const { data: results, error: resultError } = await supabaseAdmin
    .from("results")
    .select("*")
    .eq("class_id", classId)
    .eq("student_id", studentId)
    .eq("result_type", "mock");
  if (resultError) throw resultError;

  const resultIds = (results || []).map((row) => String(row.id));
  const { data: reviews, error: reviewError } = resultIds.length
    ? await supabaseAdmin
        .from("mock_result_reviews")
        .select("*")
        .in("result_id", resultIds)
    : { data: [], error: null };
  if (reviewError) throw reviewError;

  const reviewByResultId = new Map(
    (reviews || []).map((review) => [String(review.result_id), review])
  );

  return (results || [])
    .map((result) =>
      mergeResultAndReview(result, reviewByResultId.get(String(result.id)))
    )
    .sort(
      (first, second) =>
        first.mock_number - second.mock_number || first.id.localeCompare(second.id)
    );
}

export async function saveTeacherMockResult(
  actorId: string,
  input: TeacherMockResultInput
) {
  const { data, error } = await supabaseAdmin.rpc(
    "save_teacher_mock_result_review",
    {
      p_actor_id: actorId,
      p_result_id: input.resultId,
      p_class_id: input.classId,
      p_student_id: input.studentId,
      p_mock_number: input.mockNumber,
      p_reading: input.reading,
      p_writing: input.writing,
      p_listening: input.listening,
      p_speaking: input.speaking,
      p_comments: input.comments || null,
      p_action: input.action,
    }
  );
  if (error) throw error;
  return data;
}

export async function removeTeacherMockResult(actorId: string, resultId: string) {
  if (!UUID_PATTERN.test(resultId)) {
    throw new MockResultWorkflowError("Invalid Mock Result identifier.");
  }
  const { data, error } = await supabaseAdmin.rpc(
    "delete_teacher_mock_result_review",
    { p_actor_id: actorId, p_result_id: resultId }
  );
  if (error) throw error;
  return data;
}

export async function getAdminAwaitingMockResultCount() {
  const { count, error } = await supabaseAdmin
    .from("mock_result_reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "awaiting_review");
  if (error) throw error;
  return count || 0;
}

export async function loadAdminMockResultReviews(): Promise<
  AdminMockReviewRow[]
> {
  const { data: reviews, error: reviewError } = await supabaseAdmin
    .from("mock_result_reviews")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (reviewError) throw reviewError;
  if (!reviews?.length) return [];

  const resultIds = reviews.map((review) => String(review.result_id));
  const { data: results, error: resultError } = await supabaseAdmin
    .from("results")
    .select("*")
    .in("id", resultIds)
    .eq("result_type", "mock");
  if (resultError) throw resultError;

  const resultById = new Map(
    (results || []).map((result) => [String(result.id), result])
  );
  const classIds = Array.from(
    new Set((results || []).map((result) => String(result.class_id || "")).filter(Boolean))
  );
  const profileIds = Array.from(
    new Set(
      [
        ...(results || []).flatMap((result) => [
          result.student_id,
          result.teacher_id,
        ]),
        ...reviews.flatMap((review) => [review.submitted_by]),
      ]
        .map((id) => String(id || ""))
        .filter(Boolean)
    )
  );
  const [classResult, profileResult] = await Promise.all([
    classIds.length
      ? supabaseAdmin
          .from("classes")
          .select("id, class_name, level_id, academic_year_id")
          .in("id", classIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, role")
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (classResult.error) throw classResult.error;
  if (profileResult.error) throw profileResult.error;

  const levelIds = Array.from(
    new Set((classResult.data || []).map((row) => Number(row.level_id)).filter(Boolean))
  );
  const academicYearIds = Array.from(
    new Set(
      (classResult.data || [])
        .map((row) => String(row.academic_year_id || ""))
        .filter(Boolean)
    )
  );
  const [levelResult, academicYearResult] = await Promise.all([
    levelIds.length
      ? supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
      : Promise.resolve({ data: [], error: null }),
    academicYearIds.length
      ? supabaseAdmin
          .from("academic_years")
          .select("id, label")
          .in("id", academicYearIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const levels = levelResult.data;
  const levelError = levelResult.error;
  if (levelError) throw levelError;
  if (academicYearResult.error) throw academicYearResult.error;

  const classById = new Map(
    (classResult.data || []).map((row) => [String(row.id), row])
  );
  const profileById = new Map(
    (profileResult.data || []).map((row) => [String(row.id), row])
  );
  const levelById = new Map(
    (levels || []).map((row) => [String(row.id), row])
  );
  const academicYearById = new Map(
    (academicYearResult.data || []).map((row) => [String(row.id), row])
  );

  return reviews.flatMap((review) => {
    const result = resultById.get(String(review.result_id));
    if (!result) return [];
    const merged = mergeResultAndReview(result, review);
    const classroom = classById.get(merged.class_id) as any;
    const level = levelById.get(String(classroom?.level_id || "")) as any;
    const academicYear = academicYearById.get(
      String(classroom?.academic_year_id || "")
    ) as any;
    const reviewTeacherId = String(
      review.submitted_by || merged.teacher_id || ""
    );

    return [{
      ...merged,
      teacher_id: reviewTeacherId,
      student_name: personName(
        profileById.get(merged.student_id),
        "Unknown student"
      ),
      teacher_name: personName(
        profileById.get(reviewTeacherId),
        "Unknown teacher"
      ),
      class_name:
        text(classroom?.class_name) || text(level?.name) || "Unknown class",
      level_id: String(classroom?.level_id || ""),
      level_name: text(level?.name) || "Unknown level",
      academic_year_id: classroom?.academic_year_id || null,
      academic_year_label: text(academicYear?.label),
    }];
  });
}

export async function reviewTeacherMockResult(input: {
  actorId: string;
  resultId: string;
  action: "publish" | "return";
  reviewNote: string;
}) {
  if (!UUID_PATTERN.test(input.resultId)) {
    throw new MockResultWorkflowError("Invalid Mock Result identifier.");
  }
  if (input.action !== "publish" && input.action !== "return") {
    throw new MockResultWorkflowError("Choose a valid review action.");
  }
  if (input.action === "return" && !input.reviewNote.trim()) {
    throw new MockResultWorkflowError("Add a correction note for the Teacher.");
  }
  if (input.reviewNote.trim().length > 1000) {
    throw new MockResultWorkflowError(
      "Correction note must be 1000 characters or fewer."
    );
  }

  const { data, error } = await supabaseAdmin.rpc(
    "review_teacher_mock_result",
    {
      p_actor_id: input.actorId,
      p_result_id: input.resultId,
      p_action: input.action,
      p_review_note: input.reviewNote.trim() || null,
    }
  );
  if (error) throw error;
  return data;
}

export async function editAdminMockResult(
  actorId: string,
  input: AdminMockResultEditInput
) {
  const { data, error } = await supabaseAdmin.rpc(
    "edit_admin_mock_result_review",
    {
      p_actor_id: actorId,
      p_result_id: input.resultId,
      p_reading: input.reading,
      p_writing: input.writing,
      p_listening: input.listening,
      p_speaking: input.speaking,
      p_comments: input.comments || null,
      p_action: input.action,
    }
  );
  if (error) throw error;
  return data;
}
