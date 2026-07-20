import { supabase } from "./supabase";

function isOnlineCourse(courseType: string | null | undefined) {
  return String(courseType ?? "").trim().toLowerCase() === "online";
}

function prepareClassData(classData: any) {
  if (isOnlineCourse(classData.course_type)) {
    return {
      ...classData,
      classroom_id: null,
      meet_link: String(classData.meet_link || "").trim(),
    };
  }

  return {
    ...classData,
    meet_link: null,
  };
}

export async function getAdminClasses() {
  const { data, error } = await supabase
    .from("classes")
    .select("*");

  if (error) {
    console.error("getAdminClasses Supabase error:", error);
    throw error;
  }

  return data || [];
}

export async function getLevels() {
  const { data, error } = await supabase
    .from("levels")
    .select("id, name, catagory")
    .order("name");

  if (error) {
    console.error("getLevels Supabase error:", error);
    throw error;
  }

  return data || [];
}

export async function getTeachers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("role", "teacher")
    .order("first_name");

  if (error) {
    console.error("getTeachers Supabase error:", error);
    throw error;
  }

  return data || [];
}

export async function getClassrooms() {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name")
    .order("name");

  if (error) {
    console.error("getClassrooms Supabase error:", error);
    throw error;
  }

  return data || [];
}

export async function createClass(classData: any) {
  const { error } = await supabase
    .from("classes")
    .insert([prepareClassData(classData)]);

  if (error) {
    console.error("createClass Supabase error:", error);
    throw error;
  }
}

export async function updateClass(id: string, classData: any) {
  const { error } = await supabase
    .from("classes")
    .update(prepareClassData(classData))
    .eq("id", id);

  if (error) {
    console.error("updateClass Supabase error:", error);
    throw error;
  }
}

export async function getClassStudentCounts() {
  const countsByClassId: Record<string, number> = {};

  try {
    const { data: studentProfiles, error: studentsError } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "student");

    if (studentsError) {
      throw studentsError;
    }

    const studentIds = (studentProfiles || [])
      .map((student) => student.id)
      .filter(Boolean);

    if (studentIds.length > 0) {
      const { data: enrolments, error: enrolmentsError } = await supabase
        .from("class_enrolments")
        .select("student_id, class_id")
        .in("student_id", studentIds);

      if (enrolmentsError) {
        throw enrolmentsError;
      }

      const countedCambridgeStudents: Record<string, Set<string>> = {};

      for (const enrolment of enrolments || []) {
        const classId = String(enrolment.class_id || "");
        const studentId = String(enrolment.student_id || "");

        if (!classId || !studentId) {
          continue;
        }

        if (!countedCambridgeStudents[classId]) {
          countedCambridgeStudents[classId] = new Set();
        }

        countedCambridgeStudents[classId].add(studentId);
      }

      for (const [classId, students] of Object.entries(
        countedCambridgeStudents
      )) {
        countsByClassId[classId] =
          (countsByClassId[classId] || 0) + students.size;
      }
    }
  } catch (error) {
    console.error("getClassStudentCounts Cambridge count error:", error);
  }

  try {
    const { data: youngLearners, error: youngLearnersError } = await supabase
      .from("young_learners")
      .select("id, class_id")
      .eq("active", true);

    if (youngLearnersError) {
      throw youngLearnersError;
    }

    const countedYoungLearners: Record<string, Set<string>> = {};

    for (const learner of youngLearners || []) {
      const classId = String(learner.class_id || "");
      const learnerId = String(learner.id || "");

      if (!classId || !learnerId) {
        continue;
      }

      if (!countedYoungLearners[classId]) {
        countedYoungLearners[classId] = new Set();
      }

      countedYoungLearners[classId].add(learnerId);
    }

    for (const [classId, learners] of Object.entries(countedYoungLearners)) {
      countsByClassId[classId] =
        (countsByClassId[classId] || 0) + learners.size;
    }
  } catch (error) {
    console.error("getClassStudentCounts Young Learner count error:", error);
  }

  return countsByClassId;
}
