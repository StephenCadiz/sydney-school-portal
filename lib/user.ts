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

  const response = await fetch("/api/student/session", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.error || "Your record cannot be accessed in the portal.");
  }
  return {
    ...session.user,
    id: String(payload.id),
    email: payload.email || session.user.email,
    first_name: payload.first_name || null,
    last_name: payload.last_name || null,
    display_name: payload.display_name || null,
  };
}

export async function getCurrentStudentClass() {
  const user = await getCurrentUser();

  const { data: enrolments, error: enrolmentError } = await supabase
    .from("current_class_enrolments")
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

/**
 * Return every teacher attached to the student's current active classes.
 * The single-teacher helper remains available for existing pages, while
 * messaging can offer the correct recipient when a student has more than one
 * active enrolment.
 */
export async function getCurrentStudentTeachers() {
  const user = await getCurrentUser();
  const { data: enrolments, error: enrolmentError } = await supabase
    .from("current_class_enrolments")
    .select("class_id")
    .eq("student_id", user.id);

  if (enrolmentError) {
    throw new Error(`Unable to load class enrolment: ${enrolmentError.message}`);
  }

  const classIds = Array.from(
    new Set((enrolments || []).map((row) => String(row.class_id || "")).filter(Boolean))
  );
  if (!classIds.length) return [];

  const { data: classes, error: classError } = await supabase
    .from("classes")
    .select("id, teacher_id")
    .in("id", classIds);
  if (classError) throw new Error(`Unable to load class teachers: ${classError.message}`);

  const teacherIds = Array.from(
    new Set((classes || []).map((row) => String(row.teacher_id || "")).filter(Boolean))
  );
  if (!teacherIds.length) return [];

  const { data: teachers, error: teacherError } = await supabase
    .from("profiles")
    .select("*")
    .in("id", teacherIds)
    .eq("role", "teacher");
  if (teacherError) throw new Error(`Unable to load teacher profiles: ${teacherError.message}`);

  return (teachers || []).sort((first, second) =>
    `${first.first_name || ""} ${first.last_name || ""}`.localeCompare(
      `${second.first_name || ""} ${second.last_name || ""}`
    )
  );
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
