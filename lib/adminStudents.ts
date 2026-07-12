import { supabase } from "./supabase";

const cambridgeLevelNames = ["B1", "B2", "C1", "C2"];

function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
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
    .select("id, name");

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
    .select("student_id")
    .eq("student_id", studentId);

  if (enrolmentsError) {
    console.error("updateStudentClass lookup error:", enrolmentsError);
    throw enrolmentsError;
  }

  if (enrolments && enrolments.length > 0) {
    const { error } = await supabase
      .from("class_enrolments")
      .update({
        class_id: classId,
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
    .filter((classroom) => classroom.is_cambridge !== true);
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
