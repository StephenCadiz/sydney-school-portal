export const MOCK_RESULT_REVIEW_STATUSES = [
  "draft",
  "awaiting_review",
  "changes_required",
  "published",
] as const;

export type MockResultReviewStatus =
  (typeof MOCK_RESULT_REVIEW_STATUSES)[number];

export const MOCK_RESULT_STATUS_LABELS: Record<
  MockResultReviewStatus,
  string
> = {
  draft: "Draft",
  awaiting_review: "Awaiting Admin Review",
  changes_required: "Changes Required",
  published: "Published",
};

export type MockResultWorkflowRow = {
  id: string;
  review_id: string;
  class_id: string;
  student_id: string;
  teacher_id: string;
  result_type: "mock";
  status: MockResultReviewStatus;
  mock_number: number;
  title: string;
  reading: number | null;
  writing: number | null;
  listening: number | null;
  speaking: number | null;
  overall: number | null;
  comments: string | null;
  review_note: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  published_at: string | null;
  published_by: string | null;
  approved_version_available: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminMockReviewRow = MockResultWorkflowRow & {
  student_name: string;
  teacher_name: string;
  class_name: string;
  level_id: string;
  level_name: string;
  academic_year_id: string | null;
  academic_year_label: string;
};

export function isMockResultReviewStatus(
  value: unknown
): value is MockResultReviewStatus {
  return MOCK_RESULT_REVIEW_STATUSES.includes(
    String(value || "") as MockResultReviewStatus
  );
}

export function getMockResultStatusLabel(value: unknown) {
  return isMockResultReviewStatus(value)
    ? MOCK_RESULT_STATUS_LABELS[value]
    : MOCK_RESULT_STATUS_LABELS.draft;
}

export function canTeacherEditMockResult(status: unknown) {
  return (
    status === "draft" ||
    status === "changes_required" ||
    status === "published"
  );
}

export function canTeacherSubmitMockResult(status: unknown) {
  return status === "draft" || status === "changes_required";
}

export function canTeacherRemoveMockResult(status: unknown) {
  return status === "draft" || status === "changes_required";
}

export function toMockScore(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

export function calculateMockResultAverage(values: unknown[]) {
  const scores = values.map(toMockScore);
  if (scores.some((score) => score === null)) return null;
  return (
    (scores[0] as number) +
    (scores[1] as number) +
    (scores[2] as number) +
    (scores[3] as number)
  ) / 4;
}

export function hasCompleteMockResultScores(result: {
  reading?: unknown;
  writing?: unknown;
  listening?: unknown;
  speaking?: unknown;
}) {
  return [result.reading, result.writing, result.listening, result.speaking]
    .map(toMockScore)
    .every((score) => score !== null && score >= 0 && score <= 100);
}
