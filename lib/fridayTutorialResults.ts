export const fridayTutorialCambridgeLevels = ["B1", "B2", "C1", "C2"] as const;

export type FridayTutorialCambridgeLevel =
  (typeof fridayTutorialCambridgeLevels)[number];

export type FridayTutorialScheduledSessionSummary = {
  id: string;
  session_date: string;
  level_name: string;
  activity_type: string;
  exam_part: string | null;
  pdf_url?: string | null;
  audio_url?: string | null;
  note?: string | null;
  active: boolean;
  result_sheet_id?: string | null;
  results_submitted?: boolean;
  sheet_submitted_at?: string | null;
  sheet_updated_at?: string | null;
  is_future?: boolean;
  practice_key?: string;
  practice_label?: string;
};

export type FridayTutorialResultSheet = {
  id: string;
  tutorial_session_id: string;
  class_id: string;
  submitted_at: string;
  submitted_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type FridayTutorialResult = {
  id: string;
  result_sheet_id: string;
  student_id: string;
  percentage: number | null;
  attended: boolean;
  created_at: string;
  updated_at: string;
};

export type FridayTutorialTeacherSheetStudentRow = {
  student_id: string;
  first_name: string;
  last_name: string;
  percentage: number | null;
  attended: boolean;
  saved_result_id?: string | null;
  result_updated_at?: string | null;
};

export type TeacherFridayTutorialSheet = {
  session: FridayTutorialScheduledSessionSummary;
  result_sheet: FridayTutorialResultSheet | null;
  students: FridayTutorialTeacherSheetStudentRow[];
  snapshot_locked: boolean;
};

export type FridayTutorialSavedResultRow = {
  id: string;
  result_sheet_id: string;
  student_id: string;
  percentage: number | null;
  attended: boolean;
  created_at: string;
  updated_at: string;
};

export type FridayTutorialSaveResultInput = {
  student_id: string;
  percentage: number | string | null;
};

export type FridayTutorialSaveRequest = {
  tutorial_session_id: string;
  class_id: string;
  results: FridayTutorialSaveResultInput[];
};

export type FridayTutorialSaveResponse = {
  success: boolean;
  result_sheet_id: string;
  created_or_updated_count: number;
  attended_count: number;
  absent_count: number;
  first_submission: boolean;
};

export type FridayTutorialStudentHistoryItem = {
  result_id: string;
  result_sheet_id: string;
  tutorial_session_id: string;
  session_date: string;
  level_name: string;
  activity_type: string;
  exam_part: string | null;
  percentage: number | null;
  attended: boolean;
  practice_key: string;
  practice_label: string;
};

export type FridayTutorialProgressSourceRow = {
  id: string;
  result_sheet_id: string;
  percentage: number | null;
  attended: boolean;
  tutorial_session_id: string;
  session_date: string;
  level_name: string;
  activity_type: string;
  exam_part: string | null;
};

export type FridayTutorialAverageByPart = {
  practice_key: string;
  practice_label: string;
  count: number;
  average: number | null;
};

export type FridayTutorialAttendanceSummary = {
  eligible_count: number;
  attended_count: number;
  absent_count: number;
  attendance_percentage: number | null;
};

export type FridayTutorialProgressSummary = {
  has_results: boolean;
  total_count: number;
  attendance: FridayTutorialAttendanceSummary;
  averages: FridayTutorialAverageByPart[];
  recent: FridayTutorialStudentHistoryItem[];
};

export function getEmptyFridayTutorialProgressSummary(): FridayTutorialProgressSummary {
  return {
    has_results: false,
    total_count: 0,
    attendance: {
      eligible_count: 0,
      attended_count: 0,
      absent_count: 0,
      attendance_percentage: null,
    },
    averages: [],
    recent: [],
  };
}

export function normalizeCambridgeLevel(level: unknown) {
  return String(level ?? "").trim().toUpperCase();
}

export function isFridayTutorialCambridgeLevel(
  level: unknown
): level is FridayTutorialCambridgeLevel {
  return fridayTutorialCambridgeLevels.includes(
    normalizeCambridgeLevel(level) as FridayTutorialCambridgeLevel
  );
}

function normalizePracticeText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizePracticeKeyText(value: unknown) {
  return normalizePracticeText(value).toUpperCase();
}

export function formatFridayTutorialPracticeKey(
  levelName: unknown,
  activityType: unknown,
  examPart: unknown
) {
  return [
    normalizeCambridgeLevel(levelName),
    normalizePracticeKeyText(activityType),
    normalizePracticeKeyText(examPart),
  ]
    .filter(Boolean)
    .join("|");
}

export function formatFridayTutorialPracticeLabel(
  levelName: unknown,
  activityType: unknown,
  examPart: unknown
) {
  void levelName;

  return [
    normalizePracticeText(activityType),
    normalizePracticeText(examPart),
  ]
    .filter(Boolean)
    .join(" - ");
}

export function normalizeFridayTutorialPercentage(value: unknown): {
  value: number | null;
  error: string | null;
} {
  if (value === null || value === undefined || value === "") {
    return { value: null, error: null };
  }

  const parsed =
    typeof value === "number" ? value : Number(String(value).trim());

  if (!Number.isFinite(parsed)) {
    return {
      value: null,
      error: "Percentage must be a valid number.",
    };
  }

  if (parsed < 0 || parsed > 100) {
    return {
      value: null,
      error: "Percentage must be between 0 and 100.",
    };
  }

  return {
    value: Math.round(parsed * 100) / 100,
    error: null,
  };
}

export function deriveFridayTutorialAttended(percentage: unknown) {
  return normalizeFridayTutorialPercentage(percentage).value !== null;
}

export function calculateFridayTutorialAttendance(
  rows: Array<{ percentage?: number | null; attended?: boolean | null }>
): FridayTutorialAttendanceSummary {
  const eligibleCount = rows.length;
  const attendedCount = rows.filter(
    (row) =>
      row.attended === true &&
      row.percentage !== null &&
      row.percentage !== undefined
  ).length;
  const absentCount = Math.max(eligibleCount - attendedCount, 0);

  return {
    eligible_count: eligibleCount,
    attended_count: attendedCount,
    absent_count: absentCount,
    attendance_percentage:
      eligibleCount > 0
        ? Math.round((attendedCount / eligibleCount) * 10000) / 100
        : null,
  };
}

export function calculateFridayTutorialAveragesByPart(
  rows: FridayTutorialStudentHistoryItem[]
): FridayTutorialAverageByPart[] {
  const groups = new Map<
    string,
    { practice_label: string; values: number[] }
  >();

  for (const row of rows) {
    if (row.attended !== true || row.percentage === null) {
      continue;
    }

    const normalized = normalizeFridayTutorialPercentage(row.percentage);

    if (normalized.value === null) {
      continue;
    }

    const practiceKey =
      row.practice_key ||
      formatFridayTutorialPracticeKey(
        row.level_name,
        row.activity_type,
        row.exam_part
      );
    const practiceLabel =
      row.practice_label ||
      formatFridayTutorialPracticeLabel(
        row.level_name,
        row.activity_type,
        row.exam_part
      );
    const group = groups.get(practiceKey) || {
      practice_label: practiceLabel,
      values: [],
    };

    group.values.push(normalized.value);
    groups.set(practiceKey, group);
  }

  return Array.from(groups.entries())
    .map(([practiceKey, group]) => {
      const total = group.values.reduce((sum, value) => sum + value, 0);

      return {
        practice_key: practiceKey,
        practice_label: group.practice_label,
        count: group.values.length,
        average:
          group.values.length > 0
            ? Math.round((total / group.values.length) * 100) / 100
            : null,
      };
    })
    .sort((first, second) =>
      first.practice_label.localeCompare(second.practice_label, undefined, {
        sensitivity: "base",
      })
    );
}

export function buildFridayTutorialProgressSummary(
  rows: FridayTutorialProgressSourceRow[]
): FridayTutorialProgressSummary {
  const history = rows
    .map((row) => {
      const normalizedPercentage = normalizeFridayTutorialPercentage(
        row.percentage
      );
      const percentage = normalizedPercentage.error
        ? null
        : normalizedPercentage.value;

      return {
        result_id: row.id,
        result_sheet_id: row.result_sheet_id,
        tutorial_session_id: row.tutorial_session_id,
        session_date: String(row.session_date || ""),
        level_name: normalizeCambridgeLevel(row.level_name),
        activity_type: normalizePracticeText(row.activity_type),
        exam_part: normalizePracticeText(row.exam_part) || null,
        percentage,
        attended: row.attended === true && percentage !== null,
        practice_key: formatFridayTutorialPracticeKey(
          row.level_name,
          row.activity_type,
          row.exam_part
        ),
        practice_label: formatFridayTutorialPracticeLabel(
          row.level_name,
          row.activity_type,
          row.exam_part
        ),
      };
    })
    .sort((first, second) => {
      const dateComparison = String(second.session_date || "").localeCompare(
        String(first.session_date || "")
      );

      if (dateComparison !== 0) {
        return dateComparison;
      }

      const sessionComparison = String(
        second.tutorial_session_id || ""
      ).localeCompare(String(first.tutorial_session_id || ""));

      if (sessionComparison !== 0) {
        return sessionComparison;
      }

      return String(second.result_id || "").localeCompare(
        String(first.result_id || "")
      );
    });

  return {
    has_results: history.length > 0,
    total_count: history.length,
    attendance: calculateFridayTutorialAttendance(history),
    averages: calculateFridayTutorialAveragesByPart(history),
    recent: history.slice(0, 3),
  };
}

export function selectLastThreeSubmittedSessions<
  T extends { session_date?: string | null; sheet_submitted_at?: string | null }
>(sessions: T[]) {
  return [...sessions]
    .filter((session) => session.sheet_submitted_at)
    .sort((first, second) =>
      String(second.session_date || "").localeCompare(
        String(first.session_date || "")
      )
    )
    .slice(0, 3);
}
