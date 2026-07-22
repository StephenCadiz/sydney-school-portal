import {
  getCambridgeReadingSkillLabel,
  normalizeCambridgeLevel,
  normalizeHomeworkSkill,
} from "./homework";
import {
  formatFridayTutorialPracticeKey,
  formatFridayTutorialPracticeLabel,
} from "./fridayTutorialResults";

export type TeacherResultClassOption = {
  id: string;
  class_name: string;
  level_id: string;
  level_name: string;
  is_cambridge: boolean;
  course_type: string;
  days: string;
  start_time: string;
  end_time: string;
};

export type HomeworkSourceResult = {
  id?: string | null;
  class_id?: string | null;
  student_id?: string | null;
  title?: string | null;
  skill?: string | null;
  percentage?: number | string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type AggregateValue = {
  average: number | null;
  result_count: number;
  student_count: number;
  suppressed: boolean;
};

export type HomeworkSkillAggregate = AggregateValue & {
  skill: string;
  label: string;
};

export type HomeworkWeekAggregate = AggregateValue & {
  week: number;
  skill: string;
  label: string;
  coverage_count: number;
  coverage_total: number;
  coverage_percentage: number | null;
};

export type HomeworkClassComparison = AggregateValue & {
  class_id: string;
  class_name: string;
  level_name: string;
  roster_count: number;
};

export type HomeworkAnalytics = {
  overall: AggregateValue;
  skills: HomeworkSkillAggregate[];
  weeks: HomeworkWeekAggregate[];
};

export type FridaySourceRow = {
  sheet_id: string;
  session_id: string;
  class_id: string;
  student_id: string;
  session_date: string;
  level_name: string;
  activity_type: string;
  exam_part: string | null;
  percentage: number | null;
  attended: boolean;
};

export type AttendanceAggregate = {
  percentage: number | null;
  attended_count: number | null;
  absent_count: number | null;
  opportunity_count: number;
  student_count: number;
  suppressed: boolean;
};

export type FridayAnalytics = {
  overall: AggregateValue;
  attendance: AttendanceAggregate;
  session_count: number;
  attempt_count: number;
  parts: Array<AggregateValue & { key: string; label: string }>;
  sessions: Array<
    AggregateValue & {
      session_date: string;
      label: string;
      attendance: AttendanceAggregate;
      sheet_count: number;
    }
  >;
};

export type MockSourceResult = {
  id?: string | null;
  class_id?: string | null;
  student_id?: string | null;
  mock_number?: number | string | null;
  reading?: number | string | null;
  writing?: number | string | null;
  listening?: number | string | null;
  speaking?: number | string | null;
  overall?: number | string | null;
  published_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type MockHistoryAggregate = AggregateValue & {
  mock_number: number;
  coverage_count: number;
  coverage_total: number;
  published_count: number;
  entered_count: number;
  aggregate_change: number | null;
  matched_change: number | null;
  matched_student_count: number;
  skills: Array<AggregateValue & { skill: string; label: string }>;
};

export type MockAnalytics = {
  latest_mock_number: number | null;
  latest: MockHistoryAggregate | null;
  latest_skills: Array<AggregateValue & { skill: string; label: string }>;
  history: MockHistoryAggregate[];
  represented_class_count: number;
};

export function toTeacherResultNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getCambridgeTarget(level: unknown) {
  const targets: Record<string, number> = {
    B1: 70,
    B2: 60,
    C1: 60,
    C2: 60,
  };

  return targets[normalizeCambridgeLevel(level)] ?? null;
}

export function getHomeworkWeek(result: HomeworkSourceResult) {
  const match = /week\s+(\d+)/i.exec(String(result.title || ""));
  return match ? Number(match[1]) : null;
}

function getResultTime(result: HomeworkSourceResult) {
  const timestamp = Date.parse(result.updated_at || result.created_at || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getAnyResultTime(result: { updated_at?: string | null; created_at?: string | null }) {
  const timestamp = Date.parse(result.updated_at || result.created_at || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getSkillOrder(skill: string) {
  if (skill === "reading") return 1;
  if (skill === "listening") return 2;
  if (skill === "writing") return 3;
  return 99;
}

export function getHomeworkSkillLabel(level: unknown, skill: unknown) {
  const normalizedSkill = normalizeHomeworkSkill(skill);

  if (normalizedSkill === "reading") {
    return getCambridgeReadingSkillLabel(String(level || ""));
  }

  if (normalizedSkill === "listening") return "Listening";
  if (normalizedSkill === "writing") return "Writing";
  if (normalizedSkill === "speaking") return "Speaking";

  return String(skill || "Homework").trim() || "Homework";
}

export function deduplicateHomeworkResults(
  results: HomeworkSourceResult[],
  enrolledStudentIdsByClass: Map<string, Set<string>>
) {
  const newestByKey = new Map<string, HomeworkSourceResult>();

  for (const result of results) {
    const classId = String(result.class_id || "");
    const studentId = String(result.student_id || "");
    const week = getHomeworkWeek(result);
    const skill = normalizeHomeworkSkill(result.skill);
    const percentage = toTeacherResultNumber(result.percentage);

    if (
      !classId ||
      !studentId ||
      !week ||
      !skill ||
      percentage === null ||
      !enrolledStudentIdsByClass.get(classId)?.has(studentId)
    ) {
      continue;
    }

    const key = `${classId}:${studentId}:${week}:${skill}`;
    const existing = newestByKey.get(key);

    if (
      !existing ||
      getResultTime(result) > getResultTime(existing) ||
      (getResultTime(result) === getResultTime(existing) &&
        String(result.id || "").localeCompare(String(existing.id || "")) > 0)
    ) {
      newestByKey.set(key, {
        ...result,
        class_id: classId,
        student_id: studentId,
        skill,
        percentage,
      });
    }
  }

  return Array.from(newestByKey.values());
}

export function buildAggregateValue(results: HomeworkSourceResult[]): AggregateValue {
  const values = results
    .map((result) => toTeacherResultNumber(result.percentage))
    .filter((value): value is number => value !== null);
  const distinctStudents = new Set(
    results.map((result) => String(result.student_id || "")).filter(Boolean)
  ).size;
  return {
    average:
      values.length > 0
        ? values.reduce((total, value) => total + value, 0) / values.length
        : null,
    result_count: values.length,
    student_count: distinctStudents,
    suppressed: false,
  };
}

export function buildHomeworkAnalytics(
  results: HomeworkSourceResult[],
  levelName: string,
  rosterCount: number
): HomeworkAnalytics {
  const skillGroups = new Map<string, HomeworkSourceResult[]>();
  const weekGroups = new Map<string, HomeworkSourceResult[]>();

  for (const result of results) {
    const skill = normalizeHomeworkSkill(result.skill);
    const week = getHomeworkWeek(result);

    if (!skill || !week) continue;
    skillGroups.set(skill, [...(skillGroups.get(skill) || []), result]);
    weekGroups.set(`${week}:${skill}`, [
      ...(weekGroups.get(`${week}:${skill}`) || []),
      result,
    ]);
  }

  const skills = ["reading", "listening", "writing"]
    .map((skill) => ({
      skill,
      label: getHomeworkSkillLabel(levelName, skill),
      ...buildAggregateValue(skillGroups.get(skill) || []),
    }))
    .sort((first, second) => getSkillOrder(first.skill) - getSkillOrder(second.skill));

  const weeks = Array.from(weekGroups.entries())
    .map(([key, rows]) => {
      const [weekText, skill] = key.split(":");
      const coverageCount = new Set(
        rows.map((row) => String(row.student_id || "")).filter(Boolean)
      ).size;

      return {
        week: Number(weekText),
        skill,
        label: getHomeworkSkillLabel(levelName, skill),
        coverage_count: coverageCount,
        coverage_total: rosterCount,
        coverage_percentage:
          rosterCount > 0 ? (coverageCount / rosterCount) * 100 : null,
        ...buildAggregateValue(rows),
      };
    })
    .sort(
      (first, second) =>
        first.week - second.week || getSkillOrder(first.skill) - getSkillOrder(second.skill)
    );

  return {
    overall: buildAggregateValue(results),
    skills,
    weeks,
  };
}

export function getTargetStatus(average: number | null, target: number | null) {
  if (average === null || target === null) return null;

  const difference = average - target;
  return {
    label: difference >= 0 ? "Target achieved" : "Below target",
    difference,
  };
}

function aggregateValues(rows: Array<{ student_id?: string | null; value: number | null }>) {
  const valid = rows.filter((row) => row.value !== null);
  const students = new Set(valid.map((row) => String(row.student_id || "")).filter(Boolean));
  return {
    average:
      valid.length > 0
        ? valid.reduce((sum, row) => sum + (row.value as number), 0) / valid.length
        : null,
    result_count: valid.length,
    student_count: students.size,
    suppressed: false,
  };
}

export function buildAttendanceAggregate(rows: FridaySourceRow[]): AttendanceAggregate {
  const students = new Set(rows.map((row) => row.student_id).filter(Boolean));
  const attended = rows.filter(
    (row) => row.attended === true && toTeacherResultNumber(row.percentage) !== null
  ).length;
  return {
    percentage: rows.length > 0 ? (attended / rows.length) * 100 : null,
    attended_count: attended,
    absent_count: rows.length - attended,
    opportunity_count: rows.length,
    student_count: students.size,
    suppressed: false,
  };
}

export function buildFridayAnalytics(rows: FridaySourceRow[]): FridayAnalytics {
  const attendedRows = rows.filter(
    (row) => row.attended === true && toTeacherResultNumber(row.percentage) !== null
  );
  const partGroups = new Map<string, FridaySourceRow[]>();
  const sessionGroups = new Map<string, FridaySourceRow[]>();

  for (const row of rows) {
    const key = formatFridayTutorialPracticeKey(
      row.level_name,
      row.activity_type,
      row.exam_part
    );
    partGroups.set(key, [...(partGroups.get(key) || []), row]);
    sessionGroups.set(row.session_id, [...(sessionGroups.get(row.session_id) || []), row]);
  }

  const parts = Array.from(partGroups.entries())
    .map(([key, group]) => ({
      key,
      label: formatFridayTutorialPracticeLabel(
        group[0]?.level_name,
        group[0]?.activity_type,
        group[0]?.exam_part
      ),
      ...aggregateValues(
        group.map((row) => ({
          student_id: row.student_id,
          value:
            row.attended === true ? toTeacherResultNumber(row.percentage) : null,
        }))
      ),
    }))
    .sort((first, second) => first.label.localeCompare(second.label, undefined, { numeric: true }));

  const sessions = Array.from(sessionGroups.values())
    .map((group) => {
      const first = group[0];
      return {
        session_date: first?.session_date || "",
        label: formatFridayTutorialPracticeLabel(
          first?.level_name,
          first?.activity_type,
          first?.exam_part
        ),
        attendance: buildAttendanceAggregate(group),
        sheet_count: new Set(group.map((row) => row.sheet_id)).size,
        ...aggregateValues(
          group.map((row) => ({
            student_id: row.student_id,
            value:
              row.attended === true ? toTeacherResultNumber(row.percentage) : null,
          }))
        ),
      };
    })
    .sort((first, second) => first.session_date.localeCompare(second.session_date));

  return {
    overall: aggregateValues(
      attendedRows.map((row) => ({
        student_id: row.student_id,
        value: toTeacherResultNumber(row.percentage),
      }))
    ),
    attendance: buildAttendanceAggregate(rows),
    session_count: new Set(rows.map((row) => row.sheet_id)).size,
    attempt_count: attendedRows.length,
    parts,
    sessions,
  };
}

export function getMockStudentAverage(result: MockSourceResult) {
  const components = [result.reading, result.writing, result.listening, result.speaking].map(
    toTeacherResultNumber
  );

  if (components.every((value) => value !== null)) {
    return components.reduce((sum, value) => sum + (value as number), 0) / 4;
  }

  return toTeacherResultNumber(result.overall);
}

export function deduplicateMockResults(
  results: MockSourceResult[],
  enrolledStudentIdsByClass: Map<string, Set<string>>
) {
  const newestByKey = new Map<string, MockSourceResult>();

  for (const result of results) {
    const classId = String(result.class_id || "");
    const studentId = String(result.student_id || "");
    const mockNumber = Number(result.mock_number);

    if (
      !classId ||
      !studentId ||
      !Number.isFinite(mockNumber) ||
      mockNumber < 1 ||
      getMockStudentAverage(result) === null ||
      !enrolledStudentIdsByClass.get(classId)?.has(studentId)
    ) {
      continue;
    }

    const key = `${classId}:${studentId}:${mockNumber}`;
    const existing = newestByKey.get(key);
    if (
      !existing ||
      getAnyResultTime(result) > getAnyResultTime(existing) ||
      (getAnyResultTime(result) === getAnyResultTime(existing) &&
        String(result.id || "").localeCompare(String(existing.id || "")) > 0)
    ) {
      newestByKey.set(key, { ...result, class_id: classId, student_id: studentId, mock_number: mockNumber });
    }
  }

  return Array.from(newestByKey.values());
}

function buildMockHistoryRow(
  mockNumber: number,
  rows: MockSourceResult[],
  rosterCount: number,
  levelName: string
): MockHistoryAggregate {
  const averageRows = rows.map((row) => ({
    student_id: String(row.student_id || ""),
    value: getMockStudentAverage(row),
  }));
  const aggregate = aggregateValues(averageRows);

  return {
    mock_number: mockNumber,
    coverage_count: new Set(averageRows.map((row) => row.student_id).filter(Boolean)).size,
    coverage_total: rosterCount,
    published_count: rows.filter((row) => Boolean(row.published_at)).length,
    entered_count: rows.length,
    aggregate_change: null,
    matched_change: null,
    matched_student_count: 0,
    skills: buildMockSkills(rows, levelName),
    ...aggregate,
  };
}

function buildMockSkills(rows: MockSourceResult[], levelName: string) {
  const skillFields = ["reading", "listening", "writing", "speaking"] as const;
  const skills: Array<AggregateValue & { skill: string; label: string }> = skillFields.map(
    (skill) => ({
      skill,
      label:
        skill === "reading"
          ? getCambridgeReadingSkillLabel(levelName)
          : getHomeworkSkillLabel(levelName, skill),
      ...aggregateValues(
        rows.map((row) => ({
          student_id: String(row.student_id || ""),
          value: toTeacherResultNumber(row[skill]),
        }))
      ),
    })
  );
  skills.push({
    skill: "average",
    label: "Average",
    ...aggregateValues(
      rows.map((row) => ({
        student_id: String(row.student_id || ""),
        value: getMockStudentAverage(row),
      }))
    ),
  });
  return skills;
}

export function buildMockAnalytics(
  rows: MockSourceResult[],
  levelName: string,
  rosterCount: number
): MockAnalytics {
  const groups = new Map<number, MockSourceResult[]>();
  for (const row of rows) {
    const mockNumber = Number(row.mock_number);
    if (Number.isFinite(mockNumber)) groups.set(mockNumber, [...(groups.get(mockNumber) || []), row]);
  }

  const history = Array.from(groups.entries())
    .sort(([first], [second]) => first - second)
    .map(([mockNumber, group]) =>
      buildMockHistoryRow(mockNumber, group, rosterCount, levelName)
    );

  history.forEach((current, index) => {
    if (index === 0) return;
    const previous = history[index - 1];
    if (current.average !== null && previous.average !== null) {
      current.aggregate_change = current.average - previous.average;
    }

    const previousRows = groups.get(previous.mock_number) || [];
    const currentRows = groups.get(current.mock_number) || [];
    const previousByStudent = new Map(
      previousRows.map((row) => [`${row.class_id}:${row.student_id}`, getMockStudentAverage(row)])
    );
    const matchedDeltas = currentRows
      .map((row) => {
        const previousValue = previousByStudent.get(`${row.class_id}:${row.student_id}`);
        const currentValue = getMockStudentAverage(row);
        return previousValue !== undefined && previousValue !== null && currentValue !== null
          ? currentValue - previousValue
          : null;
      })
      .filter((value): value is number => value !== null);

    current.matched_student_count = matchedDeltas.length;
    current.matched_change = matchedDeltas.length > 0
      ? matchedDeltas.reduce((sum, value) => sum + value, 0) / matchedDeltas.length
      : null;
  });

  const latest = history.at(-1) || null;
  const latestRows = latest ? groups.get(latest.mock_number) || [] : [];
  const latestSkills = buildMockSkills(latestRows, levelName);

  return {
    latest_mock_number: latest?.mock_number || null,
    latest,
    latest_skills: latestSkills,
    history,
    represented_class_count: new Set(latestRows.map((row) => row.class_id).filter(Boolean)).size,
  };
}

export function getAggregateInsight<T extends AggregateValue & { label: string }>(items: T[]) {
  const comparable = items.filter((item) => item.average !== null);
  if (comparable.length < 2) return null;
  const sorted = [...comparable].sort((first, second) => (second.average as number) - (first.average as number));
  return { strongest: sorted[0], focus: sorted[sorted.length - 1] };
}
