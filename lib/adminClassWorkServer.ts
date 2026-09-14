import "server-only";

import { supabaseAdmin } from "./supabaseAdmin";

export type AdminClassWorkStudentType = "profile" | "young_learner";

export type AdminClassWorkEntry = {
  id: string;
  class_id: string;
  class_name: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  pupils_book_page: number | null;
  activity_book_page: number | null;
  homework: string | null;
  extra_activities: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  teacher_name: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeAdminClassWorkStudentType(
  value: string
): AdminClassWorkStudentType | null {
  if (value === "cambridge" || value === "profile") return "profile";
  if (value === "young_learner") return "young_learner";
  return null;
}

function teacherName(profile: any) {
  return (
    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    "Teacher"
  );
}

function periodIncludesLesson(period: any, lessonDate: string) {
  return (
    String(period.starts_on || "") <= lessonDate &&
    (!period.ends_before || lessonDate < String(period.ends_before))
  );
}

export async function loadAdminStudentClassWork(
  studentType: AdminClassWorkStudentType,
  studentId: string
): Promise<AdminClassWorkEntry[]> {
  if (!UUID_PATTERN.test(studentId)) return [];

  const identityResult =
    studentType === "profile"
      ? await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", studentId)
          .eq("role", "student")
          .maybeSingle()
      : await supabaseAdmin
          .from("young_learners")
          .select("id")
          .eq("id", studentId)
          .maybeSingle();
  if (identityResult.error) throw identityResult.error;
  if (!identityResult.data) return [];

  const { data: periods, error: periodsError } = await supabaseAdmin
    .from("class_enrolment_periods")
    .select("class_id, starts_on, ends_before, cancelled_at")
    .eq("student_type", studentType)
    .eq("student_id", studentId)
    .is("cancelled_at", null)
    .order("starts_on", { ascending: false });
  if (periodsError) throw periodsError;

  const classIds = Array.from(
    new Set((periods || []).map((period) => String(period.class_id)).filter(Boolean))
  );
  if (classIds.length === 0) return [];

  const [classesResult, entriesResult] = await Promise.all([
    supabaseAdmin
      .from("classes")
      .select("id, class_name")
      .in("id", classIds),
    supabaseAdmin
      .from("class_progress_entries")
      .select(
        "id, class_id, teacher_id, lesson_date, scheduled_start_time, scheduled_end_time, pupils_book_page, activity_book_page, homework, extra_activities, completed_at, created_at, updated_at"
      )
      .in("class_id", classIds)
      .order("lesson_date", { ascending: false })
      .order("scheduled_start_time", { ascending: false })
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(500),
  ]);
  if (classesResult.error) throw classesResult.error;
  if (entriesResult.error) throw entriesResult.error;

  const teacherIds = Array.from(
    new Set((entriesResult.data || []).map((entry) => entry.teacher_id).filter(Boolean))
  );
  const teachersResult = teacherIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", teacherIds)
    : { data: [], error: null };
  if (teachersResult.error) throw teachersResult.error;

  const classNames = new Map(
    (classesResult.data || []).map((classRow) => [
      String(classRow.id),
      String(classRow.class_name || "Class"),
    ])
  );
  const teachers = new Map(
    (teachersResult.data || []).map((profile) => [String(profile.id), teacherName(profile)])
  );
  const periodsByClass = new Map<string, any[]>();
  for (const period of periods || []) {
    const classId = String(period.class_id);
    periodsByClass.set(classId, [...(periodsByClass.get(classId) || []), period]);
  }

  return (entriesResult.data || [])
    .filter((entry) =>
      (periodsByClass.get(String(entry.class_id)) || []).some((period) =>
        periodIncludesLesson(period, String(entry.lesson_date || ""))
      )
    )
    .map((entry) => ({
      id: String(entry.id),
      class_id: String(entry.class_id),
      class_name: classNames.get(String(entry.class_id)) || "Class",
      lesson_date: String(entry.lesson_date),
      scheduled_start_time: String(entry.scheduled_start_time || ""),
      scheduled_end_time: String(entry.scheduled_end_time || ""),
      pupils_book_page: entry.pupils_book_page ?? null,
      activity_book_page: entry.activity_book_page ?? null,
      homework: entry.homework || null,
      extra_activities: entry.extra_activities || null,
      completed_at: entry.completed_at || null,
      created_at: entry.created_at || null,
      updated_at: entry.updated_at || null,
      teacher_name: teachers.get(String(entry.teacher_id)) || "Teacher",
    }));
}
