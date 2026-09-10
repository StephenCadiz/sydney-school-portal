import "server-only";

import { classUsesAcademicYear } from "./academicYearRules";
import { isEnrolmentDate } from "./classEnrolment";
import { getEffectiveClassDateRange, isDateWithinEffectiveClassRange } from "./classDateRange";
import { supabaseAdmin } from "./supabaseAdmin";

// Validate before creating an Auth account or sending an invitation. The RPC
// independently repeats these checks inside the membership transaction.
export async function validateInitialEnrolment(classId: string, type: "profile" | "young_learner", startsOn: unknown) {
  if (!isEnrolmentDate(startsOn)) return "An explicit enrolment start date is required.";
  const { data: classroom, error } = await supabaseAdmin.from("classes")
    .select("id, is_cambridge, course_type, academic_year_id, start_date, end_date")
    .eq("id", classId).maybeSingle();
  if (error) throw error;
  if (!classroom || Boolean(classroom.is_cambridge) !== (type === "profile")) return "Choose a compatible class.";
  if (classUsesAcademicYear(classroom.course_type) && !classroom.academic_year_id) return "Assign an academic year before enrolling a student.";
  const year = classroom.academic_year_id
    ? await supabaseAdmin.from("academic_years").select("start_date, end_date").eq("id", classroom.academic_year_id).maybeSingle()
    : { data: null, error: null };
  if (year.error) throw year.error;
  const range = getEffectiveClassDateRange({
    classStart: classroom.start_date, classEnd: classroom.end_date,
    academicYearStart: year.data?.start_date, academicYearEnd: year.data?.end_date,
  });
  return isDateWithinEffectiveClassRange(startsOn, range)
    ? null : "The enrolment start must be inside the class and academic-year dates.";
}

export function enrolProfileStudent(actorId: string, studentId: string, classId: string, startsOn: string) {
  return supabaseAdmin.rpc("manage_class_enrolment_period", {
    p_actor_id: actorId, p_student_type: "profile", p_student_id: studentId,
    p_action: "enrol", p_class_id: classId, p_starts_on: startsOn,
    p_ends_before: null, p_period_id: null,
  });
}
