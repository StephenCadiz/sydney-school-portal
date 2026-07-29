import {
  getHomeworkSkillLabel,
  normalizeHomeworkSkill,
} from "./homework";
import { toResultNumber } from "./progress";
import {
  calculateFridayTutorialAttendance,
  formatFridayTutorialPracticeKey,
  formatFridayTutorialPracticeLabel,
  normalizeFridayTutorialPercentage,
} from "./fridayTutorialResults";
import { getCambridgeTarget, getTargetStatus } from "./teacherResults";

export type ProgressMetric = {
  value: number | null;
  context: string;
};

export type HomeworkAssignmentStatus = "completed" | "outstanding" | "pending";

type HomeworkProgressRow = {
  id: string;
  source: "assignment";
  title: string;
  skill: string;
  skill_label: string;
  percentage: number;
};

type HomeworkProgressAssignment = {
  id: string;
  source: "assignment";
  title: string;
  skill: string;
  skill_label: string;
  due_date: string | null;
  status: HomeworkAssignmentStatus;
};

type HomeworkProgress = {
  overall: number | null;
  result_count: number;
  target_status: ReturnType<typeof getTargetStatus>;
  skills: Array<{ skill: string; label: string; average: number | null }>;
  assignments: HomeworkProgressAssignment[];
  history: HomeworkProgressRow[];
};

export type TeacherStudentProgressPayload = {
  student: {
    id: string;
    name: string;
    level: string;
    course_type: string;
    class_context: string;
  };
  target: number;
  summary: {
    assigned_homework: ProgressMetric;
    latest_mock: ProgressMetric & { mock_number: number | null };
    friday_average: ProgressMetric;
    friday_attendance: ProgressMetric & {
      attended_count: number;
      eligible_count: number;
    };
  };
  attention: Array<{ id: string; text: string }>;
  snapshot: string[];
  homework: HomeworkProgress;
  mocks: {
    latest: MockProgressRow | null;
    progression: number | null;
    previous_mock_number: number | null;
    target_status: ReturnType<typeof getTargetStatus>;
    history: MockProgressRow[];
  };
  friday: {
    average: number | null;
    attended_result_count: number;
    attendance: {
      eligible_count: number;
      attended_count: number;
      absent_count: number;
      percentage: number | null;
    };
    strongest: FridayArea | null;
    focus: FridayArea | null;
    history: FridayHistoryRow[];
  };
  follow_ups: {
    counts: { open: number; in_progress: number; resolved: number };
    recent: FollowUpProgressEntry[];
  };
};

export type MockProgressRow = {
  id: string;
  mock_number: number;
  reading: number | null;
  writing: number | null;
  listening: number | null;
  speaking: number | null;
  average: number;
  status: "Draft" | "Published";
};

export type FridayProgressSource = {
  id: string;
  result_sheet_id: string;
  session_id: string;
  session_date: string;
  level_name: string;
  activity_type: string;
  exam_part: string | null;
  percentage: number | null;
  attended: boolean;
};

export type FridayHistoryRow = {
  id: string;
  session_date: string;
  label: string;
  percentage: number | null;
  attended: boolean;
};

export type FridayArea = {
  key: string;
  label: string;
  average: number;
  count: number;
};

export type FollowUpProgressSource = {
  id: string;
  category: string;
  status: string;
  updated_at: string | null;
  entries: Array<{
    id: string;
    entry_date: string | null;
    created_at: string | null;
    details: string;
    action_plan: string;
    comment: string;
    teacher_name: string;
  }>;
};

export type FollowUpProgressEntry = {
  id: string;
  document_id: string;
  category: string;
  status: string;
  date: string;
  details: string;
  action_plan: string;
  comment: string;
  teacher_name: string;
};

type BuildInput = {
  student: TeacherStudentProgressPayload["student"];
  todayMadrid: string;
  results: any[];
  assignmentMetadata?: any[];
  fridayRows: FridayProgressSource[];
  followUps: FollowUpProgressSource[];
};

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function getTimestamp(row: any) {
  const value = Date.parse(row?.published_at || row?.exam_date || "");
  return Number.isFinite(value) ? value : 0;
}

function getMockAverage(row: any) {
  const values = [row.reading, row.writing, row.listening, row.speaking].map(
    toResultNumber
  );

  if (values.every((value) => value !== null)) {
    return average(values as number[]);
  }

  return toResultNumber(row.overall);
}

function buildMocks(results: any[]) {
  const newest = new Map<number, any>();

  for (const row of results) {
    if (row?.result_type !== "mock") continue;
    const mockNumber = Number(row.mock_number);
    if (!Number.isFinite(mockNumber) || mockNumber < 1) continue;
    if (getMockAverage(row) === null) continue;

    const existing = newest.get(mockNumber);
    if (
      !existing ||
      getTimestamp(row) > getTimestamp(existing) ||
      (getTimestamp(row) === getTimestamp(existing) &&
        String(row.id || "").localeCompare(String(existing.id || "")) > 0)
    ) {
      newest.set(mockNumber, row);
    }
  }

  return Array.from(newest.entries())
    .map(([mockNumber, row]) => ({
      id: String(row.id),
      mock_number: mockNumber,
      reading: toResultNumber(row.reading),
      writing: toResultNumber(row.writing),
      listening: toResultNumber(row.listening),
      speaking: toResultNumber(row.speaking),
      average: round(getMockAverage(row) as number),
      status: row.published_at ? ("Published" as const) : ("Draft" as const),
    }))
    .sort((first, second) => first.mock_number - second.mock_number);
}

function buildFriday(rows: FridayProgressSource[]) {
  const history: FridayHistoryRow[] = rows
    .map((row) => {
      const normalized = normalizeFridayTutorialPercentage(row.percentage).value;
      const attended = row.attended === true && normalized !== null;
      return {
        id: row.id,
        session_date: row.session_date,
        label: formatFridayTutorialPracticeLabel(
          row.level_name,
          row.activity_type,
          row.exam_part
        ),
        percentage: normalized,
        attended,
      };
    })
    .sort(
      (first, second) =>
        second.session_date.localeCompare(first.session_date) ||
        second.id.localeCompare(first.id)
    );
  const attendedRows = history.filter(
    (row) => row.attended && row.percentage !== null
  );
  const attendance = calculateFridayTutorialAttendance(history);
  const groups = new Map<string, { label: string; values: number[] }>();

  for (const row of rows) {
    const value = normalizeFridayTutorialPercentage(row.percentage).value;
    if (row.attended !== true || value === null) continue;
    const key = formatFridayTutorialPracticeKey(
      row.level_name,
      row.activity_type,
      row.exam_part
    );
    const group = groups.get(key) || {
      label: formatFridayTutorialPracticeLabel(
        row.level_name,
        row.activity_type,
        row.exam_part
      ),
      values: [],
    };
    group.values.push(value);
    groups.set(key, group);
  }

  const areas: FridayArea[] = Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      label: group.label,
      average: round(average(group.values) as number),
      count: group.values.length,
    }))
    .filter((area) => area.count > 0)
    .sort(
      (first, second) =>
        second.average - first.average || first.label.localeCompare(second.label)
    );

  return {
    average:
      attendedRows.length > 0
        ? round(
            average(attendedRows.map((row) => row.percentage as number)) as number
          )
        : null,
    attended_result_count: attendedRows.length,
    attendance: {
      eligible_count: attendance.eligible_count,
      attended_count: attendance.attended_count,
      absent_count: attendance.absent_count,
      percentage: attendance.attendance_percentage,
    },
    strongest: areas.length >= 2 ? areas[0] : null,
    focus: areas.length >= 2 ? areas[areas.length - 1] : null,
    history,
  };
}

function buildFollowUps(rows: FollowUpProgressSource[]) {
  const counts = { open: 0, in_progress: 0, resolved: 0 };

  for (const row of rows) {
    const status = String(row.status || "").trim().toLowerCase();
    if (status === "resolved") counts.resolved += 1;
    else if (status === "in progress") counts.in_progress += 1;
    else counts.open += 1;
  }

  const recent = rows
    .flatMap((document) =>
      document.entries.map((entry) => ({
        id: entry.id,
        document_id: document.id,
        category: document.category || "Other",
        status: document.status || "Open",
        date: entry.entry_date || entry.created_at || document.updated_at || "",
        details: entry.details,
        action_plan: entry.action_plan,
        comment: entry.comment,
        teacher_name: entry.teacher_name,
      }))
    )
    .sort(
      (first, second) =>
        String(second.date).localeCompare(String(first.date)) ||
        second.id.localeCompare(first.id)
    )
    .slice(0, 3);

  return { counts, recent };
}

function formatDifference(value: number) {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function buildTeacherStudentProgress(
  input: BuildInput
): TeacherStudentProgressPayload {
  const target = getCambridgeTarget(input.student.level);
  if (target === null) throw new Error("Unsupported Cambridge level.");

  const assignmentResults = input.results.filter(
    (row) =>
      row?.result_type === "homework" &&
      Boolean(row?.cambridge_exam_assignment_id)
  );
  const assignmentResultById = new Map(
    assignmentResults.map((row) => [
      String(row.cambridge_exam_assignment_id),
      row,
    ])
  );
  const assignmentHistory = [...(input.assignmentMetadata || [])]
    .sort(
      (first, second) =>
        String(second.release_date || second.due_date || "").localeCompare(
          String(first.release_date || first.due_date || "")
        ) || String(second.id).localeCompare(String(first.id))
    )
    .map((item) => {
      const result = assignmentResultById.get(String(item.id));
      const percentage = toResultNumber(result?.percentage);
      if (!result || percentage === null) return null;
      const partType = normalizeHomeworkSkill(item.part?.type);
      const metadataUnavailable = item.metadata_unavailable === true;
      const partLabel = metadataUnavailable
        ? "Historical assignment details unavailable"
        : getHomeworkSkillLabel(item.level || input.student.level, partType);
      const examNumber = Number(item.exam?.number);
      const title =
        !metadataUnavailable && Number.isInteger(examNumber) && examNumber > 0
          ? `Exam ${examNumber} · ${partLabel}`
          : "Historical assignment details unavailable";
      return {
        id: String(result.id),
        source: "assignment" as const,
        title,
        skill: metadataUnavailable ? "unavailable" : partType,
        skill_label: partLabel,
        percentage,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const assignedOverall =
    assignmentHistory.length > 0
      ? round(average(assignmentHistory.map((row) => row.percentage)) as number)
      : null;
  const assignedSkills = ["reading", "listening", "writing", "speaking"].map(
    (skill) => {
      const values = assignmentHistory
        .filter((row) => row.skill === skill)
        .map((row) => row.percentage);
      return {
        skill,
        label: getHomeworkSkillLabel(input.student.level, skill),
        average: values.length ? round(average(values) as number) : null,
      };
    }
  );
  const assignmentRows = (input.assignmentMetadata || [])
    .filter((item) => item.progress_current !== false)
    .map((item) => {
      const result = assignmentResultById.get(String(item.id));
      return {
        id: String(item.id),
        source: "assignment" as const,
        title: `Exam ${item.exam.number} · ${item.part.label}`,
        skill: String(item.part.type),
        skill_label: String(item.part.label),
        due_date: item.due_date || null,
        status: result
          ? ("completed" as const)
          : item.due_date && item.due_date < input.todayMadrid
          ? ("outstanding" as const)
          : ("pending" as const),
      };
    })
    .sort(
      (first, second) =>
        String(first.due_date || "9999-12-31").localeCompare(
          String(second.due_date || "9999-12-31")
        ) || first.id.localeCompare(second.id)
    );

  const mocks = buildMocks(input.results);
  const latestMock = mocks.at(-1) || null;
  const previousMock = mocks.length > 1 ? mocks[mocks.length - 2] : null;
  const progression =
    latestMock && previousMock
      ? round(latestMock.average - previousMock.average)
      : null;
  const friday = buildFriday(input.fridayRows);
  const followUps = buildFollowUps(input.followUps);
  const outstandingCount = assignmentRows.filter(
    (item) => item.status === "outstanding"
  ).length;
  const unresolvedFollowUps = followUps.counts.open + followUps.counts.in_progress;
  const attention: Array<{ id: string; text: string }> = [];

  if (outstandingCount > 0) {
    attention.push({
      id: "outstanding-homework",
      text: `${outstandingCount} outstanding Homework ${
        outstandingCount === 1 ? "task" : "tasks"
      }`,
    });
  }

  const mockTargetStatus = getTargetStatus(latestMock?.average ?? null, target);
  if (latestMock && mockTargetStatus && mockTargetStatus.difference < 0) {
    attention.push({
      id: "latest-mock",
      text: `Latest Mock ${latestMock.mock_number} is ${formatDifference(
        mockTargetStatus.difference
      )} points below the ${input.student.level} target.`,
    });
  }

  if (unresolvedFollowUps > 0) {
    attention.push({
      id: "follow-ups",
      text: `${unresolvedFollowUps} Follow-up ${
        unresolvedFollowUps === 1 ? "record requires" : "records require"
      } attention.`,
    });
  }

  const snapshot: string[] = [];
  const assignedTargetStatus = getTargetStatus(assignedOverall, target);
  if (assignedOverall !== null && assignedTargetStatus) {
    snapshot.push(
      `Assigned Homework average: ${assignedOverall}% — ${formatDifference(
        assignedTargetStatus.difference
      )} points ${
        assignedTargetStatus.difference >= 0 ? "above target" : "to target"
      }.`
    );
  }
  if (latestMock && mockTargetStatus) {
    snapshot.push(
      `Latest Mock ${latestMock.mock_number}: ${latestMock.average}% — ${formatDifference(
        mockTargetStatus.difference
      )} points ${
        mockTargetStatus.difference >= 0 ? "above target" : "to target"
      }.`
    );
  }
  if (outstandingCount > 0) {
    snapshot.push(
      `${outstandingCount} Homework ${
        outstandingCount === 1 ? "task is" : "tasks are"
      } outstanding.`
    );
  }
  if (friday.attendance.eligible_count > 0) {
    snapshot.push(
      `Friday Tutorial attendance: ${friday.attendance.attended_count} of ${friday.attendance.eligible_count} sessions.`
    );
  }
  if (unresolvedFollowUps > 0) {
    snapshot.push(
      `${unresolvedFollowUps} Follow-up ${
        unresolvedFollowUps === 1 ? "record requires" : "records require"
      } attention.`
    );
  }

  return {
    student: input.student,
    target,
    summary: {
      assigned_homework: {
        value: assignedOverall,
        context:
          assignedOverall === null
            ? "No assigned results"
            : `${assignmentHistory.length} completed`,
      },
      latest_mock: {
        value: latestMock?.average ?? null,
        mock_number: latestMock?.mock_number ?? null,
        context: latestMock ? `Mock ${latestMock.mock_number}` : "No mock results",
      },
      friday_average: {
        value: friday.average,
        context:
          friday.attended_result_count > 0
            ? `${friday.attended_result_count} attended ${
                friday.attended_result_count === 1 ? "result" : "results"
              }`
            : "No attended results",
      },
      friday_attendance: {
        value: friday.attendance.percentage,
        context:
          friday.attendance.eligible_count > 0
            ? `${friday.attendance.attended_count} of ${friday.attendance.eligible_count} attended`
            : "No submitted sessions",
        attended_count: friday.attendance.attended_count,
        eligible_count: friday.attendance.eligible_count,
      },
    },
    attention,
    snapshot,
    homework: {
      overall: assignedOverall,
      result_count: assignmentHistory.length,
      target_status: assignedTargetStatus,
      skills: assignedSkills,
      assignments: assignmentRows,
      history: assignmentHistory,
    },
    mocks: {
      latest: latestMock,
      progression,
      previous_mock_number: previousMock?.mock_number ?? null,
      target_status: mockTargetStatus,
      history: [...mocks].reverse(),
    },
    friday,
    follow_ups: followUps,
  };
}
