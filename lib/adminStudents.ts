import { supabase } from "./supabase";

const cambridgeLevelNames = ["B1", "B2", "C1", "C2"];

export type YoungLearnerBulkClassOption = {
  id: string;
  level_name: string;
  level_catagory: string;
  class_label: string;
  classroom_name: string;
  teacher_id: string;
  teacher_name: string;
  course_type: string;
  days: string;
  start_time: string;
  end_time: string;
  is_cambridge: boolean;
  is_support: boolean;
  active_young_learner_count: number;
};

export type CambridgeBulkClassOption = {
  id: string;
  level_name: string;
  level_catagory: string;
  course_type: string;
  class_label: string;
  classroom_name: string;
  teacher_id: string;
  teacher_name: string;
  days: string;
  start_time: string;
  end_time: string;
  is_cambridge: boolean;
  is_online: boolean;
  current_cambridge_student_count: number;
};

export type AdminCambridgeStudentDirectoryRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  class_id: string;
  class_name: string;
  class_label: string;
  level_name: string;
  course_type: string;
  days: string;
  start_time: string;
  end_time: string;
  teacher_name: string;
  classroom_name: string;
  is_online: boolean;
  is_cambridge: boolean;
};

export type AdminYoungLearnerDirectoryRow = {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string;
  class_name: string;
  active: boolean;
  class_label: string;
  level_name: string;
  days: string;
  start_time: string;
  end_time: string;
  teacher_name: string;
  classroom_name: string;
  is_cambridge: boolean;
};

function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

function normalizeLevelCategory(category: string | null | undefined) {
  return String(category || "").trim().toLowerCase();
}

function getMadridDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  return `${year}-${month}-${day}`;
}

function isSupportLevel(
  levelName: string | null | undefined,
  category: string | null | undefined
) {
  return (
    normalizeLevelCategory(category) === "support" ||
    normalizeLevelName(levelName) === "SUPPORT CLASSES"
  );
}

function isOnlineClass(classroom: any) {
  return String(classroom?.course_type || "").toLowerCase() === "online";
}

function getClassroomDisplayName(classroom: any, assignedClassroom: any) {
  if (isOnlineClass(classroom)) {
    return "Online Class";
  }

  return assignedClassroom?.name || "No classroom assigned";
}

function getClassLabel(classroom: any, level: any, assignedClassroom: any) {
  const timeSlot =
    classroom?.start_time && classroom?.end_time
      ? `${classroom.start_time}-${classroom.end_time}`
      : "-";

  return classroom
    ? `${level?.name || "-"} - ${classroom.days || "-"} - ${timeSlot} - ${getClassroomDisplayName(
        classroom,
        assignedClassroom
      )}`
    : "";
}

function formatCourseTypeLabel(courseType: string | null | undefined) {
  const normalizedCourseType = String(courseType || "").trim();

  if (!normalizedCourseType) {
    return "";
  }

  return (
    normalizedCourseType.charAt(0).toUpperCase() +
    normalizedCourseType.slice(1).toLowerCase()
  );
}

function getCambridgeClassLabel(classroom: any, level: any, assignedClassroom: any) {
  const timeSlot =
    classroom?.start_time && classroom?.end_time
      ? `${classroom.start_time}-${classroom.end_time}`
      : "";
  const courseType = formatCourseTypeLabel(classroom?.course_type);

  return [
    [level?.name || "Unknown Level", courseType].filter(Boolean).join(" "),
    classroom?.days || "",
    timeSlot,
    getClassroomDisplayName(classroom, assignedClassroom),
  ]
    .filter(Boolean)
    .join(" - ");
}

async function getClassReferenceData() {
  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("*");

  if (classesError) {
    console.error("getClasses Supabase error:", classesError);
    throw classesError;
  }

  const { data: levels, error: levelsError } = await supabase
    .from("levels")
    .select("id, name, catagory");

  if (levelsError) {
    console.error("getClassLevels Supabase error:", levelsError);
    throw levelsError;
  }

  const { data: classrooms, error: classroomsError } = await supabase
    .from("classrooms")
    .select("id, name")
    .order("name");

  if (classroomsError) {
    console.error("getClassrooms Supabase error:", classroomsError);
    throw classroomsError;
  }

  return {
    classes: classes || [],
    levels: levels || [],
    classrooms: classrooms || [],
  };
}

function getProfileName(profile: any) {
  return `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
}

async function getTeacherProfiles(classes: any[]) {
  const teacherIds = Array.from(
    new Set(classes.map((classroom) => classroom.teacher_id).filter(Boolean))
  );

  const { data, error } =
    teacherIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds)
      : { data: [], error: null };

  if (error) {
    console.error("getTeacherProfiles Supabase error:", error);
    throw error;
  }

  return data || [];
}

async function getDirectoryClassLookup() {
  const { classes, levels, classrooms } = await getClassReferenceData();
  const teachers = await getTeacherProfiles(classes);

  const classRows = classes.map((classroom) => {
    const level = levels.find((item) => item.id === classroom.level_id);
    const assignedClassroom = classrooms.find(
      (item) => item.id === classroom.classroom_id
    );
    const teacher = teachers.find((item) => item.id === classroom.teacher_id);
    const levelName = level?.name || "";
    const levelCategory = level?.catagory || "";
    const teacherName = getProfileName(teacher);

    return {
      id: String(classroom.id || ""),
      class_name: classroom.class_name || "",
      level_name: levelName,
      level_catagory: levelCategory,
      class_label:
        classroom.is_cambridge === true
          ? getCambridgeClassLabel(classroom, level, assignedClassroom)
          : getClassLabel(classroom, level, assignedClassroom),
      course_type: classroom.course_type || "",
      days: classroom.days || "",
      start_time: classroom.start_time || "",
      end_time: classroom.end_time || "",
      teacher_name: teacherName || "No teacher assigned",
      classroom_name: getClassroomDisplayName(classroom, assignedClassroom),
      is_online: isOnlineClass(classroom),
      is_cambridge: classroom.is_cambridge === true,
      is_support: isSupportLevel(levelName, levelCategory),
    };
  });

  return new Map(classRows.map((classroom) => [classroom.id, classroom]));
}

function sortByStudentName<
  T extends { id: string; first_name: string; last_name: string }
>(items: T[]) {
  return [...items].sort((first, second) => {
    const lastNameComparison = (first.last_name || "").localeCompare(
      second.last_name || "",
      undefined,
      { sensitivity: "base" }
    );

    if (lastNameComparison !== 0) {
      return lastNameComparison;
    }

    const firstNameComparison = (first.first_name || "").localeCompare(
      second.first_name || "",
      undefined,
      { sensitivity: "base" }
    );

    if (firstNameComparison !== 0) {
      return firstNameComparison;
    }

    return first.id.localeCompare(second.id);
  });
}

export async function getStudents() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, role")
    .eq("role", "student")
    .order("first_name");

  if (error) {
    console.error("getStudents Supabase error:", error);
    throw error;
  }

  const students = data || [];
  const studentIds = students.map((student) => student.id);

  if (studentIds.length === 0) {
    return [];
  }

  const { data: enrolments, error: enrolmentsError } = await supabase
    .from("class_enrolments")
    .select("student_id, class_id")
    .in("student_id", studentIds);

  if (enrolmentsError) {
    console.error("getStudentEnrolments Supabase error:", enrolmentsError);
    throw enrolmentsError;
  }

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("*");

  if (classesError) {
    console.error("getStudentClasses Supabase error:", classesError);
    throw classesError;
  }

  const { data: levels, error: levelsError } = await supabase
    .from("levels")
    .select("id, name");

  if (levelsError) {
    console.error("getStudentClassLevels Supabase error:", levelsError);
    throw levelsError;
  }

  const { data: classrooms, error: classroomsError } = await supabase
    .from("classrooms")
    .select("id, name");

  if (classroomsError) {
    console.error("getStudentClassrooms Supabase error:", classroomsError);
    throw classroomsError;
  }

  return students.map((student) => {
    const enrolment = (enrolments || []).find(
      (item) => item.student_id === student.id
    );
    const classroom = (classes || []).find(
      (item) => item.id === enrolment?.class_id
    );
    const level = (levels || []).find(
      (item) => item.id === classroom?.level_id
    );
    const assignedClassroom = (classrooms || []).find(
      (item) => item.id === classroom?.classroom_id
    );

    return {
      ...student,
      class_id: enrolment?.class_id || "",
      class_label: getClassLabel(classroom, level, assignedClassroom),
      level_name: level?.name || "Unknown Level",
      is_cambridge: classroom?.is_cambridge === true,
    };
  });
}

export async function getAdminCambridgeStudentDirectory(): Promise<
  AdminCambridgeStudentDirectoryRow[]
> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, role")
    .eq("role", "student")
    .order("first_name");

  if (error) {
    console.error("getAdminCambridgeStudentDirectory students error:", error);
    throw error;
  }

  const students = data || [];
  const studentIds = students.map((student) => student.id);

  if (studentIds.length === 0) {
    return [];
  }

  const { data: enrolments, error: enrolmentsError } = await supabase
    .from("class_enrolments")
    .select("student_id, class_id")
    .in("student_id", studentIds);

  if (enrolmentsError) {
    console.error(
      "getAdminCambridgeStudentDirectory enrolments error:",
      enrolmentsError
    );
    throw enrolmentsError;
  }

  const classLookup = await getDirectoryClassLookup();
  const enrolmentByStudentId = new Map<string, any>();

  for (const enrolment of enrolments || []) {
    const studentId = String(enrolment.student_id || "");

    if (studentId && !enrolmentByStudentId.has(studentId)) {
      enrolmentByStudentId.set(studentId, enrolment);
    }
  }

  const rows: AdminCambridgeStudentDirectoryRow[] = [];

  for (const student of students) {
    const enrolment = enrolmentByStudentId.get(String(student.id));
    const classroom = classLookup.get(String(enrolment?.class_id || ""));

    if (
      !classroom ||
      classroom.is_cambridge !== true ||
      classroom.is_support === true ||
      !cambridgeLevelNames.includes(normalizeLevelName(classroom.level_name))
    ) {
      continue;
    }

    rows.push({
      id: student.id,
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      email: student.email || "",
      class_id: classroom.id,
      class_name: classroom.class_name,
      class_label: classroom.class_label,
      level_name: classroom.level_name || "Unknown Level",
      course_type: classroom.course_type,
      days: classroom.days,
      start_time: classroom.start_time,
      end_time: classroom.end_time,
      teacher_name: classroom.teacher_name,
      classroom_name: classroom.classroom_name,
      is_online: classroom.is_online,
      is_cambridge: true,
    });
  }

  return sortByStudentName(rows);
}

export async function getAdminYoungLearnerDirectory(): Promise<
  AdminYoungLearnerDirectoryRow[]
> {
  const { data, error } = await supabase
    .from("young_learners")
    .select("id, first_name, last_name, class_id, active, created_at")
    .order("first_name");

  if (error) {
    console.error("getAdminYoungLearnerDirectory Supabase error:", error);
    throw error;
  }

  const youngLearners = data || [];

  if (youngLearners.length === 0) {
    return [];
  }

  const classLookup = await getDirectoryClassLookup();
  const rows: AdminYoungLearnerDirectoryRow[] = [];

  for (const student of youngLearners) {
    const classroom = classLookup.get(String(student.class_id || ""));

    if (
      !classroom ||
      classroom.is_cambridge === true
    ) {
      continue;
    }

    rows.push({
      id: student.id,
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      class_id: classroom.id,
      class_name: classroom.class_name,
      active: student.active !== false,
      class_label: classroom.class_label,
      level_name: classroom.level_name || "Unknown Level",
      days: classroom.days,
      start_time: classroom.start_time,
      end_time: classroom.end_time,
      teacher_name: classroom.teacher_name,
      classroom_name: classroom.classroom_name,
      is_cambridge: false,
    });
  }

  return sortByStudentName(rows);
}

export async function updateStudent(studentId: string, data: any) {
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: data.first_name,
      last_name: data.last_name,
    })
    .eq("id", studentId)
    .eq("role", "student");

  if (error) {
    console.error("updateStudent Supabase error:", error);
    throw error;
  }
}

export async function updateStudentClass(
  studentId: string,
  classId: string
) {
  const { data: enrolments, error: enrolmentsError } = await supabase
    .from("class_enrolments")
    .select("student_id, class_id")
    .eq("student_id", studentId);

  if (enrolmentsError) {
    console.error("updateStudentClass lookup error:", enrolmentsError);
    throw enrolmentsError;
  }

  if (enrolments && enrolments.length > 0) {
    const currentClassId = String(enrolments[0]?.class_id || "");

    if (currentClassId === String(classId || "")) {
      return;
    }

    const { error } = await supabase
      .from("class_enrolments")
      .update({
        class_id: classId,
        enrolled_at: getMadridDateString(),
      })
      .eq("student_id", studentId);

    if (error) {
      console.error("updateStudentClass update error:", error);
      throw error;
    }

    return;
  }

  const { error } = await supabase
    .from("class_enrolments")
    .insert([
      {
        student_id: studentId,
        class_id: classId,
        enrolled_at: getMadridDateString(),
      },
    ]);

  if (error) {
    console.error("updateStudentClass insert error:", error);
    throw error;
  }
}

export async function getCambridgeClassesForStudentInvite() {
  const { classes, levels, classrooms } = await getClassReferenceData();

  return classes
    .map((classroom) => {
      const level = levels.find(
        (item) => item.id === classroom.level_id
      );

      const assignedClassroom = classrooms.find(
        (item) => item.id === classroom.classroom_id
      );

      return {
        id: classroom.id,
        level_name: level?.name || "",
        level_catagory: level?.catagory || "",
        classroom_name: getClassroomDisplayName(
          classroom,
          assignedClassroom
        ),
        course_type: classroom.course_type,
        days: classroom.days,
        start_time: classroom.start_time,
        end_time: classroom.end_time,
        is_cambridge: classroom.is_cambridge,
      };
    })
    .filter(
      (classroom) =>
        classroom.is_cambridge === true &&
        cambridgeLevelNames.includes(
          normalizeLevelName(classroom.level_name)
        )
    );
}

export async function getCambridgeClassesForBulkCreate(): Promise<
  CambridgeBulkClassOption[]
> {
  const { classes, levels, classrooms } = await getClassReferenceData();
  const teacherIds = Array.from(
    new Set(classes.map((classroom) => classroom.teacher_id).filter(Boolean))
  );

  const { data: teachers, error: teachersError } =
    teacherIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds)
      : { data: [], error: null };

  if (teachersError) {
    console.error("getCambridgeBulkClasses teachers error:", teachersError);
    throw teachersError;
  }

  const { data: studentProfiles, error: studentsError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "student");

  if (studentsError) {
    console.error("getCambridgeBulkClasses students error:", studentsError);
    throw studentsError;
  }

  const studentIds = (studentProfiles || []).map((student) => student.id);
  const { data: enrolments, error: enrolmentsError } =
    studentIds.length > 0
      ? await supabase
          .from("class_enrolments")
          .select("student_id, class_id")
          .in("student_id", studentIds)
      : { data: [], error: null };

  if (enrolmentsError) {
    console.error("getCambridgeBulkClasses enrolments error:", enrolmentsError);
    throw enrolmentsError;
  }

  const countedStudentsByClass = (enrolments || []).reduce<
    Record<string, Set<string>>
  >((counts, enrolment) => {
    const classId = String(enrolment.class_id || "");
    const studentId = String(enrolment.student_id || "");

    if (!classId || !studentId) {
      return counts;
    }

    return {
      ...counts,
      [classId]: new Set([...(counts[classId] || []), studentId]),
    };
  }, {});

  return classes
    .map((classroom) => {
      const level = levels.find((item) => item.id === classroom.level_id);
      const assignedClassroom = classrooms.find(
        (item) => item.id === classroom.classroom_id
      );
      const teacher = (teachers || []).find(
        (item) => item.id === classroom.teacher_id
      );
      const levelName = level?.name || "";
      const levelCategory = level?.catagory || "";
      const teacherName = `${teacher?.first_name || ""} ${
        teacher?.last_name || ""
      }`.trim();
      const classId = String(classroom.id);

      return {
        id: classroom.id,
        level_name: levelName,
        level_catagory: levelCategory,
        course_type: classroom.course_type || "",
        class_label: getCambridgeClassLabel(classroom, level, assignedClassroom),
        classroom_name: getClassroomDisplayName(classroom, assignedClassroom),
        teacher_id: classroom.teacher_id || "",
        teacher_name: teacherName || "Not assigned",
        days: classroom.days || "",
        start_time: classroom.start_time || "",
        end_time: classroom.end_time || "",
        is_cambridge: classroom.is_cambridge === true,
        is_online: isOnlineClass(classroom),
        current_cambridge_student_count:
          countedStudentsByClass[classId]?.size || 0,
      };
    })
    .filter(
      (classroom) =>
        classroom.is_cambridge === true &&
        cambridgeLevelNames.includes(normalizeLevelName(classroom.level_name)) &&
        !isSupportLevel(classroom.level_name, classroom.level_catagory)
    )
    .sort((first, second) =>
      first.class_label.localeCompare(second.class_label, undefined, {
        sensitivity: "base",
      })
    );
}

export async function getYoungLearnerClassesForStudentCreate() {
  const { classes, levels, classrooms } = await getClassReferenceData();

  return classes
    .map((classroom) => {
      const level = levels.find(
        (item) => item.id === classroom.level_id
      );
      const assignedClassroom = classrooms.find(
        (item) => item.id === classroom.classroom_id
      );

      return {
        id: classroom.id,
        level_name: level?.name || "",
        level_catagory: level?.catagory || "",
        class_label: getClassLabel(classroom, level, assignedClassroom),
        classroom_name: getClassroomDisplayName(
          classroom,
          assignedClassroom
        ),
        course_type: classroom.course_type,
        days: classroom.days,
        start_time: classroom.start_time,
        end_time: classroom.end_time,
        is_cambridge: classroom.is_cambridge,
      };
    })
    .filter(
      (classroom) =>
        classroom.is_cambridge !== true
    );
}

export async function getYoungLearnerClassesForBulkCreate(): Promise<
  YoungLearnerBulkClassOption[]
> {
  const { classes, levels, classrooms } = await getClassReferenceData();
  const teacherIds = Array.from(
    new Set(classes.map((classroom) => classroom.teacher_id).filter(Boolean))
  );

  const { data: teachers, error: teachersError } =
    teacherIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds)
      : { data: [], error: null };

  if (teachersError) {
    console.error("getYoungLearnerBulkClasses teachers error:", teachersError);
    throw teachersError;
  }

  const { data: activeYoungLearners, error: youngLearnersError } =
    await supabase
      .from("young_learners")
      .select("id, class_id")
      .eq("active", true);

  if (youngLearnersError) {
    console.error(
      "getYoungLearnerBulkClasses young learners error:",
      youngLearnersError
    );
    throw youngLearnersError;
  }

  const countsByClassId = (activeYoungLearners || []).reduce<
    Record<string, number>
  >((counts, student) => {
    const classId = String(student.class_id || "");

    if (!classId) {
      return counts;
    }

    return {
      ...counts,
      [classId]: (counts[classId] || 0) + 1,
    };
  }, {});

  return classes
    .map((classroom) => {
      const level = levels.find((item) => item.id === classroom.level_id);
      const assignedClassroom = classrooms.find(
        (item) => item.id === classroom.classroom_id
      );
      const teacher = (teachers || []).find(
        (item) => item.id === classroom.teacher_id
      );
      const levelName = level?.name || "";
      const levelCategory = level?.catagory || "";
      const isSupport = isSupportLevel(levelName, levelCategory);
      const teacherName = `${teacher?.first_name || ""} ${
        teacher?.last_name || ""
      }`.trim();

      return {
        id: classroom.id,
        level_name: levelName,
        level_catagory: levelCategory,
        class_label: getClassLabel(classroom, level, assignedClassroom),
        classroom_name: getClassroomDisplayName(classroom, assignedClassroom),
        teacher_id: classroom.teacher_id || "",
        teacher_name: teacherName || "Not assigned",
        course_type: classroom.course_type || "",
        days: classroom.days || "",
        start_time: classroom.start_time || "",
        end_time: classroom.end_time || "",
        is_cambridge: classroom.is_cambridge === true,
        is_support: isSupport,
        active_young_learner_count: countsByClassId[String(classroom.id)] || 0,
      };
    })
    .filter(
      (classroom) =>
        classroom.is_cambridge !== true
    )
    .sort((first, second) =>
      first.class_label.localeCompare(second.class_label, undefined, {
        sensitivity: "base",
      })
    );
}

export async function getYoungLearners() {
  const { data, error } = await supabase
    .from("young_learners")
    .select("id, first_name, last_name, class_id, active, created_at")
    .order("first_name");

  if (error) {
    console.error("getYoungLearners Supabase error:", error);
    throw error;
  }

  const youngLearners = data || [];

  if (youngLearners.length === 0) {
    return [];
  }

  const { classes, levels, classrooms } = await getClassReferenceData();

  return youngLearners.map((student) => {
    const classroom = classes.find(
      (item) => item.id === student.class_id
    );
    const level = levels.find((item) => item.id === classroom?.level_id);
    const assignedClassroom = classrooms.find(
      (item) => item.id === classroom?.classroom_id
    );

    return {
      ...student,
      class_label: getClassLabel(classroom, level, assignedClassroom),
      level_name: level?.name || "Unknown Level",
      is_cambridge: classroom?.is_cambridge === true,
    };
  });
}
