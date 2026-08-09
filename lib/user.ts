import { supabase } from "./supabase";
import { getCurrentAcademicYear } from "./academicYears";
import {
  NO_CURRENT_ACADEMIC_YEAR_CLASS_MESSAGE,
  resolveCurrentStudentClass,
} from "./academicYearRules";

export async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("No user logged in.");
  }

  return session.user;
}

export async function getCurrentStudentClass() {
  const user = await getCurrentUser();

  const { data: enrolments, error: enrolmentError } = await supabase
    .from("class_enrolments")
    .select("class_id")
    .eq("student_id", user.id);

  if (enrolmentError) {
    throw new Error(
      `Unable to load class enrolment: ${enrolmentError.message}`
    );
  }

  if (!enrolments || enrolments.length === 0) {
    throw new Error(NO_CURRENT_ACADEMIC_YEAR_CLASS_MESSAGE);
  }

  const classIds = Array.from(
    new Set(enrolments.map((enrolment) => String(enrolment.class_id || "")))
  ).filter(Boolean);

  const [{ data: classes, error: classError }, currentAcademicYear] =
    await Promise.all([
      supabase.from("classes").select("*").in("id", classIds),
      getCurrentAcademicYear(),
    ]);

  if (classError) {
    throw new Error(
      `Unable to load class: ${classError.message}`
    );
  }

  if (!classes || classes.length === 0) {
    throw new Error(NO_CURRENT_ACADEMIC_YEAR_CLASS_MESSAGE);
  }

  const resolution = resolveCurrentStudentClass(
    classes,
    currentAcademicYear?.id
  );
  if (resolution.error || !resolution.classroom) {
    throw new Error(
      resolution.error || NO_CURRENT_ACADEMIC_YEAR_CLASS_MESSAGE
    );
  }

  return resolution.classroom;
}

export async function getCurrentStudentCourseInfo() {
  const classroom = await getCurrentStudentClass();

  if (!classroom.level_id) {
    throw new Error(
      `The class ${classroom.id} does not have a level_id.`
    );
  }

  if (!classroom.course_type) {
    throw new Error(
      `The class ${classroom.id} does not have a course_type.`
    );
  }

  const { data: levelData, error: levelError } = await supabase
    .from("levels")
    .select("name")
    .eq("id", classroom.level_id)
    .single();

  if (levelError) {
    throw new Error(
      `Unable to load class level: ${levelError.message}`
    );
  }

  if (!levelData?.name) {
    throw new Error(
      `No level found for level id: ${classroom.level_id}`
    );
  }

  let classroomDetails = null;

  if (classroom.classroom_id) {
    const { data: classroomData, error: classroomError } = await supabase
      .from("classrooms")
      .select("name, logo, theme_colour")
      .eq("id", classroom.classroom_id)
      .single();

    if (classroomError) {
      throw new Error(
        `Unable to load classroom details: ${classroomError.message}`
      );
    }

    classroomDetails = classroomData;
  }

  return {
    classroom,
    classroomDetails,
    level: levelData.name,
    courseType: classroom.course_type,
  };
}

export async function getCurrentTeacher() {
  const classroom = await getCurrentStudentClass();

  if (!classroom.teacher_id) {
    throw new Error(
      `The class ${classroom.id} does not have a teacher_id.`
    );
  }

  const { data: teachers, error: teacherError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", classroom.teacher_id);

  if (teacherError) {
    throw new Error(
      `Unable to load teacher profile: ${teacherError.message}`
    );
  }

  if (!teachers || teachers.length === 0) {
    throw new Error(
      `No teacher profile found for teacher id: ${classroom.teacher_id}`
    );
  }

  if (teachers.length > 1) {
    throw new Error(
      `More than one teacher profile found for teacher id: ${classroom.teacher_id}`
    );
  }

  const teacher = teachers[0];

  return teacher;
}

export async function getCurrentTeacherName() {
  const teacher = await getCurrentTeacher();

  return `${teacher.first_name} ${teacher.last_name ?? ""}`.trim();
}

export async function getStudentContext() {
  const user = await getCurrentUser();
  const classroom = await getCurrentStudentClass();
  const teacher = await getCurrentTeacher();

  return {
    user,
    classroom,
    teacher,
  };
}
