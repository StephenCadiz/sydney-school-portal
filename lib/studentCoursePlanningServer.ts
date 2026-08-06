import "server-only";

import { isCoursePlanningEligible } from "./coursePlanningEligibility";
import { loadCoursePlanDays } from "./coursePlanningServer";
import { supabaseAdmin } from "./supabaseAdmin";

export async function loadStudentPublishedCoursePlans(studentId: string) {
  const { data: enrolments, error: enrolmentError } = await supabaseAdmin
    .from("class_enrolments")
    .select("class_id")
    .eq("student_id", studentId);
  if (enrolmentError) throw enrolmentError;
  const classIds = Array.from(
    new Set((enrolments || []).map((row) => String(row.class_id || "")).filter(Boolean))
  );
  if (!classIds.length) return [];

  const [plansResult, classesResult] = await Promise.all([
    supabaseAdmin
      .from("course_plans")
      .select("id, class_id, book_name, status, published_at")
      .in("class_id", classIds)
      .eq("status", "published")
      .order("published_at", { ascending: false }),
    supabaseAdmin
      .from("classes")
      .select("id, class_name, teacher_id, level_id, is_cambridge, course_type, days, start_time, end_time, start_date, end_date")
      .in("id", classIds),
  ]);
  if (plansResult.error) throw plansResult.error;
  if (classesResult.error) throw classesResult.error;
  const classrooms = classesResult.data || [];
  const levelIds = Array.from(
    new Set(classrooms.map((classroom) => Number(classroom.level_id)).filter(Boolean))
  );
  const { data: levels, error: levelError } = levelIds.length
    ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };
  if (levelError) throw levelError;
  const teacherIds = Array.from(
    new Set(classrooms.map((classroom) => String(classroom.teacher_id || "")).filter(Boolean))
  );
  const { data: teachers, error: teacherError } = teacherIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", teacherIds)
    : { data: [], error: null };
  if (teacherError) throw teacherError;
  const levelsById = new Map((levels || []).map((level) => [Number(level.id), String(level.name)]));
  const teachersById = new Map(
    (teachers || []).map((teacher) => [
      String(teacher.id),
      (String(teacher.first_name || "") + " " + String(teacher.last_name || "")).trim() ||
        "Teacher",
    ])
  );
  const classesById = new Map(
    classrooms.map((classroom) => [String(classroom.id), classroom])
  );

  const eligiblePlans = (plansResult.data || []).filter((plan) => {
    const classroom = classesById.get(String(plan.class_id));
    return Boolean(
      classroom &&
        isCoursePlanningEligible({
          isCambridge: classroom.is_cambridge === true,
          levelName: levelsById.get(Number(classroom.level_id)) || "",
          courseType: classroom.course_type,
        })
    );
  });

  return Promise.all(
    eligiblePlans.map(async (plan) => {
      const classroom = classesById.get(String(plan.class_id));
      if (!classroom) return null;
      const days = await loadCoursePlanDays(String(plan.id), {
        includeExamResources: true,
      });
      return {
        id: String(plan.id),
        class: {
          id: String(classroom.id),
          name: String(classroom.class_name || "").trim() ||
            levelsById.get(Number(classroom.level_id)) ||
            "Class",
          level: levelsById.get(Number(classroom.level_id)) || "",
          course_type: String(classroom.course_type || ""),
          teacher: teachersById.get(String(classroom.teacher_id || "")) || "Teacher",
          book_name: String(plan.book_name || ""),
          start_date: classroom.start_date || null,
          end_date: classroom.end_date || null,
          days: String(classroom.days || ""),
          scheduled_start_time: classroom.start_time || null,
          scheduled_end_time: classroom.end_time || null,
        },
        published_at: plan.published_at || null,
        days,
      };
    })
  ).then((plans) => plans.filter(Boolean));
}
