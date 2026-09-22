import { supabase } from "./supabase";
import { sortClassesByGlobalOrder } from "./classOrdering";

function logSupabaseError(context: string, error: any) {
  console.error(`${context} Supabase error:`, {
    message: error?.message || "",
    code: error?.code || "",
    details: error?.details || "",
    hint: error?.hint || "",
  });
}

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
    logSupabaseError("getAdminClasses", error);
    throw error;
  }

  const levelIds = [...new Set((data || []).map((classroom: any) => classroom.level_id).filter((id: unknown) => id != null))];
  const { data: levels, error: levelsError } = levelIds.length
    ? await supabase.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };

  if (levelsError) {
    logSupabaseError("getAdminClasses levels", levelsError);
    throw levelsError;
  }

  const levelNames = new Map((levels || []).map((level: any) => [String(level.id), level.name]));
  return sortClassesByGlobalOrder((data || []).map((classroom: any) => ({
    ...classroom,
    level_name: levelNames.get(String(classroom.level_id)) || null,
  })));
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("You must be logged in as an admin.");
  }

  const response = await fetch("/api/admin/classes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(prepareClassData(classData)),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to create the class.");

  return result.class;
}

export async function updateClass(id: string, classData: any) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("You must be logged in as an admin.");
  }

  const response = await fetch(`/api/admin/classes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(prepareClassData(classData)),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to update the class.");

  return result.class;
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
        .from("class_roster_profiles")
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
      .from("class_roster_young_learners")
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
