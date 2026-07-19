import { supabase } from "./supabase";
import {
  getEmptyFridayTutorialProgressSummary,
  type FridayTutorialProgressSummary,
} from "./fridayTutorialResults";
import { isTeensUnitExamLevel } from "./unitExamResults";

function formatSupabaseError(action: string, error: any) {
  return [
    `Student Information ${action} failed: ${
      error?.message || "Unknown Supabase error"
    }`,
    error?.details ? `Details: ${error.details}` : null,
    error?.hint ? `Hint: ${error.hint}` : null,
    error?.code ? `Code: ${error.code}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

export function calculateAverage(values: any[]) {
  const numbers = values
    .map(toNumber)
    .filter((value): value is number => value !== null);

  if (numbers.length === 0) {
    return null;
  }

  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

export function formatAverage(value: any) {
  const number = toNumber(value);

  if (number === null) {
    return "-";
  }

  const rounded = Math.round(number * 10) / 10;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getFullName(person: any) {
  return `${person?.first_name || ""} ${person?.last_name || ""}`.trim() ||
    "Unnamed student";
}

function normalizeSearch(value: string) {
  return String(value || "").trim().toLowerCase();
}

function matchesSearch(person: any, query: string) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return false;
  }

  const firstName = normalizeSearch(person.first_name);
  const lastName = normalizeSearch(person.last_name);
  const fullName = normalizeSearch(getFullName(person));

  return (
    firstName.includes(normalizedQuery) ||
    lastName.includes(normalizedQuery) ||
    fullName.includes(normalizedQuery)
  );
}

function getCourseTypeLabel(courseType: string | null | undefined) {
  if (!courseType) {
    return "-";
  }

  return `${courseType.charAt(0).toUpperCase()}${courseType.slice(1)}`;
}

function getClassroomDisplayName(classRow: any, classroom: any) {
  if (String(classRow?.course_type || "").toLowerCase() === "online") {
    return "Online Class";
  }

  return classroom?.name || "No classroom assigned";
}

function getClassLabel(classRow: any, level: any, classroom: any) {
  if (!classRow) {
    return "Class not found";
  }

  const timeSlot =
    classRow.start_time && classRow.end_time
      ? `${classRow.start_time}-${classRow.end_time}`
      : "-";

  return `${level?.name || "Unknown Level"} - ${
    classRow.days || "-"
  } - ${timeSlot} - ${getClassroomDisplayName(classRow, classroom)}`;
}

function getTeacherName(teacher: any) {
  return getFullName(teacher) || "No teacher assigned";
}

const cambridgeLevelOrder = ["B1", "B2", "C1", "C2"];

const youngLearnerLevelOrder = [
  "Kids 1",
  "Kids 2",
  "Junior 1",
  "Junior 2",
  "Junior 3",
  "Junior 4",
  "Teens 1",
];

const levelAnalysisOrder = [
  ...youngLearnerLevelOrder,
  ...cambridgeLevelOrder,
];

function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

function getLevelSortIndex(levelName: string, isCambridge: boolean) {
  const order = isCambridge ? cambridgeLevelOrder : youngLearnerLevelOrder;
  const index = order.findIndex(
    (item) => normalizeLevelName(item) === normalizeLevelName(levelName)
  );

  return index === -1 ? 999 : index;
}

function isCambridgeLevelName(levelName: string | null | undefined) {
  return cambridgeLevelOrder.some(
    (item) => normalizeLevelName(item) === normalizeLevelName(levelName)
  );
}

function isYoungLearnerAnalysisLevel(levelName: string | null | undefined) {
  return youngLearnerLevelOrder.some(
    (item) => normalizeLevelName(item) === normalizeLevelName(levelName)
  );
}

async function getReferenceData(classIds: string[]) {
  const uniqueClassIds = Array.from(new Set(classIds.filter(Boolean)));

  const { data: classes, error: classesError } =
    uniqueClassIds.length > 0
      ? await supabase.from("classes").select("*").in("id", uniqueClassIds)
      : { data: [], error: null };

  if (classesError) {
    throw new Error(formatSupabaseError("class load", classesError));
  }

  const levelIds = Array.from(
    new Set((classes || []).map((item) => item.level_id).filter(Boolean))
  );
  const teacherIds = Array.from(
    new Set((classes || []).map((item) => item.teacher_id).filter(Boolean))
  );
  const classroomIds = Array.from(
    new Set((classes || []).map((item) => item.classroom_id).filter(Boolean))
  );

  const { data: levels, error: levelsError } =
    levelIds.length > 0
      ? await supabase.from("levels").select("id, name").in("id", levelIds)
      : { data: [], error: null };

  if (levelsError) {
    throw new Error(formatSupabaseError("level load", levelsError));
  }

  const { data: teachers, error: teachersError } =
    teacherIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds)
      : { data: [], error: null };

  if (teachersError) {
    throw new Error(formatSupabaseError("teacher load", teachersError));
  }

  const { data: classrooms, error: classroomsError } =
    classroomIds.length > 0
      ? await supabase
          .from("classrooms")
          .select("id, name")
          .in("id", classroomIds)
      : { data: [], error: null };

  if (classroomsError) {
    throw new Error(formatSupabaseError("classroom load", classroomsError));
  }

  return {
    classes: classes || [],
    levels: levels || [],
    teachers: teachers || [],
    classrooms: classrooms || [],
  };
}

function buildStudentResult(student: any, studentType: string, reference: any) {
  const classRow = reference.classes.find(
    (item: any) => item.id === student.class_id
  );
  const level = reference.levels.find(
    (item: any) => item.id === classRow?.level_id
  );
  const teacher = reference.teachers.find(
    (item: any) => item.id === classRow?.teacher_id
  );
  const classroom = reference.classrooms.find(
    (item: any) => item.id === classRow?.classroom_id
  );

  return {
    student_type: studentType,
    id: student.id,
    first_name: student.first_name || "",
    last_name: student.last_name || "",
    full_name: getFullName(student),
    level_name: level?.name || "Unknown Level",
    class_id: classRow?.id || "",
    class_label: getClassLabel(classRow, level, classroom),
    teacher_name: getTeacherName(teacher),
    class_days: classRow?.days || "-",
    start_time: classRow?.start_time || "",
    end_time: classRow?.end_time || "",
    course_type: classRow?.course_type || "",
  };
}

function buildClassDetails(classRow: any, reference: any) {
  const level = reference.levels.find(
    (item: any) => item.id === classRow?.level_id
  );
  const teacher = reference.teachers.find(
    (item: any) => item.id === classRow?.teacher_id
  );
  const classroom = reference.classrooms.find(
    (item: any) => item.id === classRow?.classroom_id
  );
  const levelName = level?.name || "Unknown Level";
  const teacherName = getTeacherName(teacher);
  const timeSlot =
    classRow?.start_time && classRow?.end_time
      ? `${classRow.start_time}-${classRow.end_time}`
      : "-";

  return {
    class_id: classRow?.id || "",
    level_name: levelName,
    teacher_name: teacherName,
    days: classRow?.days || "-",
    start_time: classRow?.start_time || "",
    end_time: classRow?.end_time || "",
    course_type: classRow?.course_type || "",
    course_type_label: getCourseTypeLabel(classRow?.course_type),
    classroom_name: getClassroomDisplayName(classRow, classroom),
    is_cambridge: classRow?.is_cambridge === true,
    class_label: getClassLabel(classRow, level, classroom),
    option_label: `${teacherName} — ${levelName} — ${
      classRow?.days || "-"
    } — ${timeSlot}`,
  };
}

async function getAllClassReferenceData() {
  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("*");

  if (classesError) {
    throw new Error(formatSupabaseError("class option load", classesError));
  }

  const { data: levels, error: levelsError } = await supabase
    .from("levels")
    .select("id, name");

  if (levelsError) {
    throw new Error(formatSupabaseError("level option load", levelsError));
  }

  const teacherIds = Array.from(
    new Set((classes || []).map((item) => item.teacher_id).filter(Boolean))
  );
  const classroomIds = Array.from(
    new Set((classes || []).map((item) => item.classroom_id).filter(Boolean))
  );

  const { data: teachers, error: teachersError } =
    teacherIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds)
      : { data: [], error: null };

  if (teachersError) {
    throw new Error(formatSupabaseError("teacher option load", teachersError));
  }

  const { data: classrooms, error: classroomsError } =
    classroomIds.length > 0
      ? await supabase
          .from("classrooms")
          .select("id, name")
          .in("id", classroomIds)
      : { data: [], error: null };

  if (classroomsError) {
    throw new Error(formatSupabaseError("classroom option load", classroomsError));
  }

  return {
    classes: classes || [],
    levels: levels || [],
    teachers: teachers || [],
    classrooms: classrooms || [],
  };
}

export async function getClassSearchOptions() {
  const reference = await getAllClassReferenceData();

  return reference.classes
    .map((classRow: any) => buildClassDetails(classRow, reference))
    .sort((first: any, second: any) => {
      if (first.is_cambridge !== second.is_cambridge) {
        return first.is_cambridge ? -1 : 1;
      }

      const firstIndex = getLevelSortIndex(first.level_name, first.is_cambridge);
      const secondIndex = getLevelSortIndex(second.level_name, second.is_cambridge);

      if (firstIndex !== secondIndex) {
        return firstIndex - secondIndex;
      }

      return first.option_label.localeCompare(second.option_label);
    });
}

export async function searchAllStudents(query: string) {
  const trimmedQuery = String(query || "").trim();

  if (!trimmedQuery) {
    return [];
  }

  const { data: cambridgeStudents, error: cambridgeError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role")
    .eq("role", "student")
    .order("first_name");

  if (cambridgeError) {
    throw new Error(formatSupabaseError("Cambridge student search", cambridgeError));
  }

  const matchedCambridgeStudents = (cambridgeStudents || []).filter((student) =>
    matchesSearch(student, trimmedQuery)
  );
  const cambridgeIds = matchedCambridgeStudents.map((student) => student.id);

  const { data: enrolments, error: enrolmentsError } =
    cambridgeIds.length > 0
      ? await supabase
          .from("class_enrolments")
          .select("student_id, class_id")
          .in("student_id", cambridgeIds)
      : { data: [], error: null };

  if (enrolmentsError) {
    throw new Error(formatSupabaseError("Cambridge enrolment search", enrolmentsError));
  }

  const cambridgeWithClass = matchedCambridgeStudents.map((student) => {
    const enrolment = (enrolments || []).find(
      (item) => item.student_id === student.id
    );

    return {
      ...student,
      class_id: enrolment?.class_id || "",
    };
  });

  const { data: youngLearners, error: youngLearnersError } = await supabase
    .from("young_learners")
    .select("id, first_name, last_name, class_id, active")
    .order("first_name");

  if (youngLearnersError) {
    throw new Error(formatSupabaseError("Young Learner search", youngLearnersError));
  }

  const matchedYoungLearners = (youngLearners || []).filter((student) =>
    matchesSearch(student, trimmedQuery)
  );

  const reference = await getReferenceData([
    ...cambridgeWithClass.map((student) => student.class_id),
    ...matchedYoungLearners.map((student) => student.class_id),
  ]);

  return [
    ...cambridgeWithClass.map((student) =>
      buildStudentResult(student, "cambridge", reference)
    ),
    ...matchedYoungLearners.map((student) =>
      buildStudentResult(student, "young_learner", reference)
    ),
  ].sort((first, second) => first.full_name.localeCompare(second.full_name));
}

export async function getCambridgeFridayTutorialProgressSummary(
  studentId: string
): Promise<FridayTutorialProgressSummary> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No user logged in.");
  }

  const params = new URLSearchParams({ student_id: studentId });
  const response = await fetch(`/api/friday-tutorial-progress?${params}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.error || "Unable to load Friday tutorial progress."
    );
  }

  return (
    (payload.summary as FridayTutorialProgressSummary | undefined) ||
    getEmptyFridayTutorialProgressSummary()
  );
}

export async function getCambridgeStudentResultsSummary(studentId: string) {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("student_id", studentId);

  if (error) {
    throw new Error(formatSupabaseError("Cambridge result load", error));
  }

  const rows = data || [];
  const practiceRows = rows.filter((item) => item.result_type === "homework");
  const mockRows = rows.filter((item) => item.result_type === "mock");
  const skillNames = Array.from(
    new Set(practiceRows.map((item) => item.skill).filter(Boolean))
  );

  const practiceSkillAverages = skillNames.map((skill) => ({
    skill,
    average: calculateAverage(
      practiceRows
        .filter((item) => item.skill === skill)
        .map((item) => item.percentage)
    ),
  }));

  const enrichedMockRows = mockRows.map((row) => {
    const calculatedOverall = calculateAverage([
      row.reading,
      row.writing,
      row.listening,
      row.speaking,
    ]);

    return {
      ...row,
      published_at: row.published_at ?? null,
      row_average: toNumber(row.overall) ?? calculatedOverall,
    };
  });

  return {
    type: "cambridge",
    practice: {
      rows: practiceRows,
      skill_averages: practiceSkillAverages,
      overall_average: calculateAverage(
        practiceRows.map((item) => item.percentage)
      ),
    },
    mock: {
      rows: enrichedMockRows,
      reading_average: calculateAverage(mockRows.map((item) => item.reading)),
      writing_average: calculateAverage(mockRows.map((item) => item.writing)),
      listening_average: calculateAverage(mockRows.map((item) => item.listening)),
      speaking_average: calculateAverage(mockRows.map((item) => item.speaking)),
      overall_average: calculateAverage(
        enrichedMockRows.map((item) => item.row_average)
      ),
    },
    friday_tutorial: await getCambridgeFridayTutorialProgressSummary(studentId),
  };
}

export async function getYoungLearnerUnitExamSummary(
  youngLearnerId: string,
  levelName: string
) {
  const { data, error } = await supabase
    .from("unit_exam_results")
    .select("*")
    .eq("young_learner_id", youngLearnerId)
    .order("unit_exam_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError("Unit Exam result load", error));
  }

  const rows = data || [];
  const isTeens = isTeensUnitExamLevel(levelName);
  const enrichedRows = rows.map((row) => ({
    ...row,
    row_average: isTeens
      ? calculateAverage([row.reading, row.writing, row.listening, row.speaking])
      : calculateAverage([row.reading_writing, row.listening, row.speaking]),
  }));

  const groupedByUnit = enrichedRows.reduce(
    (groups: Record<string, any[]>, row) => {
      const key = String(row.unit_exam_number || "Unassigned");

      return {
        ...groups,
        [key]: [...(groups[key] || []), row],
      };
    },
    {}
  );

  return {
    type: "young_learner",
    is_teens: isTeens,
    rows: enrichedRows,
    grouped_by_unit: groupedByUnit,
    averages: isTeens
      ? {
          reading: calculateAverage(rows.map((item) => item.reading)),
          writing: calculateAverage(rows.map((item) => item.writing)),
          listening: calculateAverage(rows.map((item) => item.listening)),
          speaking: calculateAverage(rows.map((item) => item.speaking)),
          overall: calculateAverage(enrichedRows.map((item) => item.row_average)),
        }
      : {
          reading_writing: calculateAverage(
            rows.map((item) => item.reading_writing)
          ),
          listening: calculateAverage(rows.map((item) => item.listening)),
          speaking: calculateAverage(rows.map((item) => item.speaking)),
          overall: calculateAverage(enrichedRows.map((item) => item.row_average)),
        },
  };
}

export async function getFollowUpsForStudent(
  studentType: string,
  studentId: string
) {
  let query = supabase
    .from("follow_up_documents")
    .select("*")
    .eq("student_type", studentType)
    .order("updated_at", { ascending: false });

  query =
    studentType === "young_learner"
      ? query.eq("young_learner_id", studentId)
      : query.eq("student_id", studentId);

  const { data: documents, error } = await query;

  if (error) {
    throw new Error(formatSupabaseError("follow-up load", error));
  }

  const rows = documents || [];
  const teacherIds = Array.from(
    new Set(rows.map((item) => item.teacher_id).filter(Boolean))
  );
  const classIds = Array.from(
    new Set(rows.map((item) => item.class_id).filter(Boolean))
  );

  const { data: teachers, error: teachersError } =
    teacherIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds)
      : { data: [], error: null };

  if (teachersError) {
    throw new Error(formatSupabaseError("follow-up teacher load", teachersError));
  }

  const reference = await getReferenceData(classIds);

  const entriesByDocument = await Promise.all(
    rows.map(async (document) => {
      const { data: entries, error: entriesError } = await supabase
        .from("follow_up_entries")
        .select("*")
        .eq("follow_up_document_id", document.id)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (entriesError) {
        throw new Error(formatSupabaseError("follow-up entry load", entriesError));
      }

      const entryTeacherIds = Array.from(
        new Set((entries || []).map((entry) => entry.teacher_id).filter(Boolean))
      );
      const { data: entryTeachers, error: entryTeachersError } =
        entryTeacherIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, first_name, last_name")
              .in("id", entryTeacherIds)
          : { data: [], error: null };

      if (entryTeachersError) {
        throw new Error(
          formatSupabaseError("follow-up entry teacher load", entryTeachersError)
        );
      }

      return [
        document.id,
        (entries || []).map((entry) => {
          const entryTeacher = (entryTeachers || []).find(
            (teacher) => teacher.id === entry.teacher_id
          );

          return {
            entry_date: entry.entry_date || entry.created_at,
            teacher_name: getTeacherName(entryTeacher),
            details: entry.details || "",
            action_plan: entry.action_plan || "",
            comment: entry.comment || "",
          };
        }),
      ];
    })
  );
  const entriesMap = new Map(entriesByDocument as [string, any[]][]);

  return rows.map((document) => {
    const teacher = (teachers || []).find(
      (item) => item.id === document.teacher_id
    );
    const classRow = reference.classes.find(
      (item: any) => item.id === document.class_id
    );
    const level = reference.levels.find(
      (item: any) => item.id === classRow?.level_id
    );
    const classroom = reference.classrooms.find(
      (item: any) => item.id === classRow?.classroom_id
    );

    return {
      id: document.id,
      category: document.category || "Other",
      status: document.status || "Open",
      teacher_name: getTeacherName(teacher),
      class_label: getClassLabel(classRow, level, classroom),
      recommend_friday_tutorial: Boolean(document.recommend_friday_tutorial),
      admin_seen: Boolean(document.admin_seen),
      entries: entriesMap.get(document.id) || [],
    };
  });
}

export async function getStudentInformation(
  studentType: string,
  studentId: string
) {
  if (studentType === "young_learner") {
    const { data: student, error } = await supabase
      .from("young_learners")
      .select("id, first_name, last_name, class_id, active")
      .eq("id", studentId)
      .single();

    if (error) {
      throw new Error(formatSupabaseError("Young Learner load", error));
    }

    const reference = await getReferenceData([student.class_id]);
    const base = buildStudentResult(student, "young_learner", reference);

    return {
      ...base,
      course_type: getCourseTypeLabel(base.course_type),
      results_summary: await getYoungLearnerUnitExamSummary(
        student.id,
        base.level_name
      ),
      follow_ups: await getFollowUpsForStudent("young_learner", student.id),
    };
  }

  const { data: student, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, role")
    .eq("id", studentId)
    .eq("role", "student")
    .single();

  if (error) {
    throw new Error(formatSupabaseError("Cambridge student load", error));
  }

  const { data: enrolment, error: enrolmentError } = await supabase
    .from("class_enrolments")
    .select("student_id, class_id")
    .eq("student_id", student.id)
    .maybeSingle();

  if (enrolmentError) {
    throw new Error(formatSupabaseError("Cambridge enrolment load", enrolmentError));
  }

  const reference = await getReferenceData([enrolment?.class_id || ""]);
  const base = buildStudentResult(
    {
      ...student,
      class_id: enrolment?.class_id || "",
    },
    "cambridge",
    reference
  );

  return {
    ...base,
    course_type: getCourseTypeLabel(base.course_type),
    results_summary: await getCambridgeStudentResultsSummary(student.id),
    follow_ups: await getFollowUpsForStudent("cambridge", student.id),
  };
}

export async function getClassInformation(classId: string) {
  const { data: classRow, error } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();

  if (error) {
    throw new Error(formatSupabaseError("class information load", error));
  }

  const reference = await getReferenceData([classId]);
  const classDetails = buildClassDetails(classRow, reference);

  const { data: enrolments, error: enrolmentsError } = await supabase
    .from("class_enrolments")
    .select("student_id, class_id")
    .eq("class_id", classId);

  if (enrolmentsError) {
    throw new Error(formatSupabaseError("class enrolment load", enrolmentsError));
  }

  const cambridgeStudentIds = (enrolments || [])
    .map((item) => item.student_id)
    .filter(Boolean);

  const { data: cambridgeStudents, error: cambridgeError } =
    cambridgeStudentIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", cambridgeStudentIds)
      : { data: [], error: null };

  if (cambridgeError) {
    throw new Error(formatSupabaseError("class Cambridge student load", cambridgeError));
  }

  const { data: youngLearners, error: youngLearnersError } = await supabase
    .from("young_learners")
    .select("id, first_name, last_name, class_id, active")
    .eq("class_id", classId)
    .order("first_name");

  if (youngLearnersError) {
    throw new Error(formatSupabaseError("class Young Learner load", youngLearnersError));
  }

  const students = [
    ...(cambridgeStudents || []).map((student) =>
      buildStudentResult(
        {
          ...student,
          class_id: classId,
        },
        "cambridge",
        reference
      )
    ),
    ...(youngLearners || []).map((student) =>
      buildStudentResult(student, "young_learner", reference)
    ),
  ].sort((first, second) => first.full_name.localeCompare(second.full_name));

  return {
    details: classDetails,
    students,
  };
}

function getMockOverall(row: any) {
  return (
    toNumber(row.overall) ??
    calculateAverage([row.reading, row.writing, row.listening, row.speaking])
  );
}

async function getCambridgeClassResultsSummary(classId: string) {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("class_id", classId);

  if (error) {
    throw new Error(formatSupabaseError("Cambridge class result load", error));
  }

  const rows = data || [];
  const practiceRows = rows.filter((item) => item.result_type === "homework");
  const mockRows = rows.filter((item) => item.result_type === "mock");
  const skillNames = Array.from(
    new Set(practiceRows.map((item) => item.skill).filter(Boolean))
  );

  return {
    type: "cambridge",
    has_results: rows.length > 0,
    practice: {
      skill_averages: skillNames.map((skill) => ({
        skill,
        average: calculateAverage(
          practiceRows
            .filter((item) => item.skill === skill)
            .map((item) => item.percentage)
        ),
      })),
      overall_average: calculateAverage(
        practiceRows.map((item) => item.percentage)
      ),
    },
    mock: {
      reading_average: calculateAverage(mockRows.map((item) => item.reading)),
      writing_average: calculateAverage(mockRows.map((item) => item.writing)),
      listening_average: calculateAverage(mockRows.map((item) => item.listening)),
      speaking_average: calculateAverage(mockRows.map((item) => item.speaking)),
      overall_average: calculateAverage(mockRows.map(getMockOverall)),
    },
  };
}

async function getYoungLearnerClassResultsSummary(
  classId: string,
  levelName: string
) {
  const { data, error } = await supabase
    .from("unit_exam_results")
    .select("*")
    .eq("class_id", classId);

  if (error) {
    throw new Error(formatSupabaseError("Young Learner class result load", error));
  }

  const rows = data || [];
  const isTeens = isTeensUnitExamLevel(levelName);
  const rowAverages = rows.map((row) =>
    isTeens
      ? calculateAverage([row.reading, row.writing, row.listening, row.speaking])
      : calculateAverage([row.reading_writing, row.listening, row.speaking])
  );

  return {
    type: "young_learner",
    is_teens: isTeens,
    has_results: rows.length > 0,
    averages: isTeens
      ? {
          reading: calculateAverage(rows.map((item) => item.reading)),
          writing: calculateAverage(rows.map((item) => item.writing)),
          listening: calculateAverage(rows.map((item) => item.listening)),
          speaking: calculateAverage(rows.map((item) => item.speaking)),
          overall: calculateAverage(rowAverages),
        }
      : {
          reading_writing: calculateAverage(
            rows.map((item) => item.reading_writing)
          ),
          listening: calculateAverage(rows.map((item) => item.listening)),
          speaking: calculateAverage(rows.map((item) => item.speaking)),
          overall: calculateAverage(rowAverages),
        },
  };
}

export async function getClassResultsSummary(classId: string) {
  const { data: classRow, error } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();

  if (error) {
    throw new Error(formatSupabaseError("class summary load", error));
  }

  const reference = await getReferenceData([classId]);
  const details = buildClassDetails(classRow, reference);

  return details.is_cambridge
    ? getCambridgeClassResultsSummary(classId)
    : getYoungLearnerClassResultsSummary(classId, details.level_name);
}

export async function getLevelAnalysisOptions() {
  const { data, error } = await supabase
    .from("levels")
    .select("id, name");

  if (error) {
    throw new Error(formatSupabaseError("level analysis option load", error));
  }

  return (data || [])
    .filter((level) =>
      levelAnalysisOrder.some(
        (item) => normalizeLevelName(item) === normalizeLevelName(level.name)
      )
    )
    .sort((first, second) => {
      const firstIndex = levelAnalysisOrder.findIndex(
        (item) => normalizeLevelName(item) === normalizeLevelName(first.name)
      );
      const secondIndex = levelAnalysisOrder.findIndex(
        (item) => normalizeLevelName(item) === normalizeLevelName(second.name)
      );

      return firstIndex - secondIndex;
    })
    .map((level) => ({
      id: level.id,
      name: level.name,
    }));
}

function getCambridgeLevelPracticeSummary(rows: any[]) {
  const skillNames = Array.from(
    new Set(rows.map((item) => item.skill).filter(Boolean))
  );

  return {
    skill_averages: skillNames.map((skill) => ({
      skill,
      average: calculateAverage(
        rows.filter((item) => item.skill === skill).map((item) => item.percentage)
      ),
    })),
    overall_average: calculateAverage(rows.map((item) => item.percentage)),
    result_count: rows.length,
  };
}

function getCambridgeLevelMockSummary(rows: any[]) {
  return {
    reading_average: calculateAverage(rows.map((item) => item.reading)),
    writing_average: calculateAverage(rows.map((item) => item.writing)),
    listening_average: calculateAverage(rows.map((item) => item.listening)),
    speaking_average: calculateAverage(rows.map((item) => item.speaking)),
    overall_average: calculateAverage(rows.map(getMockOverall)),
    result_count: rows.length,
  };
}

function getYoungLearnerLevelSummary(rows: any[], levelName: string) {
  const isTeens = isTeensUnitExamLevel(levelName);
  const rowAverages = rows.map((row) =>
    isTeens
      ? calculateAverage([row.reading, row.writing, row.listening, row.speaking])
      : calculateAverage([row.reading_writing, row.listening, row.speaking])
  );

  return {
    is_teens: isTeens,
    result_count: rows.length,
    averages: isTeens
      ? {
          reading: calculateAverage(rows.map((item) => item.reading)),
          writing: calculateAverage(rows.map((item) => item.writing)),
          listening: calculateAverage(rows.map((item) => item.listening)),
          speaking: calculateAverage(rows.map((item) => item.speaking)),
          overall: calculateAverage(rowAverages),
        }
      : {
          reading_writing: calculateAverage(
            rows.map((item) => item.reading_writing)
          ),
          listening: calculateAverage(rows.map((item) => item.listening)),
          speaking: calculateAverage(rows.map((item) => item.speaking)),
          overall: calculateAverage(rowAverages),
        },
  };
}

export async function getLevelAnalysis(levelName: string) {
  const normalizedLevelName = normalizeLevelName(levelName);
  const { data: levels, error: levelsError } = await supabase
    .from("levels")
    .select("id, name");

  if (levelsError) {
    throw new Error(formatSupabaseError("level analysis level load", levelsError));
  }

  const level = (levels || []).find(
    (item) => normalizeLevelName(item.name) === normalizedLevelName
  );

  if (!level) {
    return {
      level_name: levelName || "Unknown Level",
      student_count: 0,
      class_count: 0,
      result_count: 0,
      type: "unsupported",
      class_breakdown: [],
    };
  }

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("*")
    .eq("level_id", level.id);

  if (classesError) {
    throw new Error(formatSupabaseError("level analysis class load", classesError));
  }

  const classRows = classes || [];
  const classIds = classRows.map((item) => item.id).filter(Boolean);
  const reference = await getReferenceData(classIds);
  const classDetails = classRows.map((classRow) =>
    buildClassDetails(classRow, reference)
  );

  if (classRows.length === 0) {
    return {
      level_name: level.name,
      student_count: 0,
      class_count: 0,
      result_count: 0,
      type: isCambridgeLevelName(level.name) ? "cambridge" : "young_learner",
      class_breakdown: [],
    };
  }

  if (isCambridgeLevelName(level.name)) {
    const { data: enrolments, error: enrolmentsError } =
      classIds.length > 0
        ? await supabase
            .from("class_enrolments")
            .select("student_id, class_id")
            .in("class_id", classIds)
        : { data: [], error: null };

    if (enrolmentsError) {
      throw new Error(formatSupabaseError("level analysis enrolment load", enrolmentsError));
    }

    const studentIds = Array.from(
      new Set((enrolments || []).map((item) => item.student_id).filter(Boolean))
    );
    const { data: profiles, error: profilesError } =
      studentIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id")
            .eq("role", "student")
            .in("id", studentIds)
        : { data: [], error: null };

    if (profilesError) {
      throw new Error(formatSupabaseError("level analysis student load", profilesError));
    }

    const validStudentIds = new Set((profiles || []).map((item) => item.id));
    const studentCountByClass = new Map<string, number>();

    (enrolments || []).forEach((enrolment) => {
      if (!validStudentIds.has(enrolment.student_id)) {
        return;
      }

      studentCountByClass.set(
        enrolment.class_id,
        (studentCountByClass.get(enrolment.class_id) || 0) + 1
      );
    });

    const { data: resultRows, error: resultsError } =
      classIds.length > 0
        ? await supabase.from("results").select("*").in("class_id", classIds)
        : { data: [], error: null };

    if (resultsError) {
      throw new Error(formatSupabaseError("level analysis Cambridge result load", resultsError));
    }

    const rows = resultRows || [];
    const practiceRows = rows.filter((item) => item.result_type === "homework");
    const mockRows = rows.filter((item) => item.result_type === "mock");

    return {
      level_name: level.name,
      type: "cambridge",
      student_count: validStudentIds.size,
      class_count: classRows.length,
      result_count: rows.length,
      practice: getCambridgeLevelPracticeSummary(practiceRows),
      mock: getCambridgeLevelMockSummary(mockRows),
      class_breakdown: classDetails.map((details) => {
        const classResults = rows.filter(
          (item) => item.class_id === details.class_id
        );
        const classPractice = classResults.filter(
          (item) => item.result_type === "homework"
        );
        const classMock = classResults.filter(
          (item) => item.result_type === "mock"
        );

        return {
          ...details,
          student_count: studentCountByClass.get(details.class_id) || 0,
          result_count: classResults.length,
          practice: getCambridgeLevelPracticeSummary(classPractice),
          mock: getCambridgeLevelMockSummary(classMock),
        };
      }),
    };
  }

  if (!isYoungLearnerAnalysisLevel(level.name)) {
    return {
      level_name: level.name,
      student_count: 0,
      class_count: classRows.length,
      result_count: 0,
      type: "unsupported",
      class_breakdown: [],
    };
  }

  const { data: youngLearners, error: youngLearnersError } =
    classIds.length > 0
      ? await supabase
          .from("young_learners")
          .select("id, class_id, active")
          .eq("active", true)
          .in("class_id", classIds)
      : { data: [], error: null };

  if (youngLearnersError) {
    throw new Error(formatSupabaseError("level analysis Young Learner load", youngLearnersError));
  }

  const studentCountByClass = new Map<string, number>();
  (youngLearners || []).forEach((student) => {
    studentCountByClass.set(
      student.class_id,
      (studentCountByClass.get(student.class_id) || 0) + 1
    );
  });

  const { data: resultRows, error: resultsError } =
    classIds.length > 0
      ? await supabase
          .from("unit_exam_results")
          .select("*")
          .in("class_id", classIds)
      : { data: [], error: null };

  if (resultsError) {
    throw new Error(formatSupabaseError("level analysis Unit Exam result load", resultsError));
  }

  const rows = resultRows || [];

  return {
    level_name: level.name,
    type: "young_learner",
    student_count: youngLearners?.length || 0,
    class_count: classRows.length,
    ...getYoungLearnerLevelSummary(rows, level.name),
    class_breakdown: classDetails.map((details) => {
      const classRows = rows.filter((item) => item.class_id === details.class_id);
      const summary = getYoungLearnerLevelSummary(classRows, level.name);

      return {
        ...details,
        student_count: studentCountByClass.get(details.class_id) || 0,
        ...summary,
      };
    }),
  };
}
