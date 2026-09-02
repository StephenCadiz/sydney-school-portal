export type ClassAttendanceStatus = "present" | "absent" | null;

export const CLASS_REGISTER_CHANGED_EVENT = "teacher-class-register-updated";

export type ClassRegisterUnavailableReason =
  | "missing_course_dates"
  | "missing_academic_year"
  | "invalid_class_times";

export type ClassRegisterUnavailableResponse = {
  available: false;
  reason: ClassRegisterUnavailableReason;
  message: string;
};

export function isClassRegisterUnavailableResponse(
  value: unknown
): value is ClassRegisterUnavailableResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Partial<ClassRegisterUnavailableResponse>;
  return (
    response.available === false &&
    typeof response.message === "string" &&
    [
      "missing_course_dates",
      "missing_academic_year",
      "invalid_class_times",
    ].includes(String(response.reason || ""))
  );
}

export type ClassAttendanceSummary = {
  present_count: number;
  absent_count: number;
  completed_register_count: number;
  attendance_percentage: number | null;
};

export type ClassRegisterLesson = {
  register_id: string | null;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  completed_at: string | null;
  present_count: number;
  absent_count: number;
  unmarked_count: number;
  student_count: number;
  is_available: boolean;
  is_overdue: boolean;
  status: "upcoming" | "not_started" | "in_progress" | "completed";
};

export type ClassRegisterStudentEntry = {
  id: string;
  student_type: "profile" | "young_learner";
  student_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  attendance_status: ClassAttendanceStatus;
  marked_at: string | null;
};

export type ClassRegisterDetails = {
  id: string;
  class_id: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  completed_at: string | null;
  completed_by: string | null;
  entries: ClassRegisterStudentEntry[];
};

export type ClassRegisterSnapshot = {
  class: {
    id: string;
    name: string;
    level: string;
    course_type: string;
    days: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
  };
  today_madrid: string;
  today_lesson: ClassRegisterLesson | null;
  recent_registers: ClassRegisterLesson[];
  selected_lesson: ClassRegisterLesson | null;
  selected_register: ClassRegisterDetails | null;
};

export type ClassRegisterReminder = {
  class_id: string;
  class_name: string;
  level: string;
  course_type: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  is_overdue: boolean;
  is_current_lesson: boolean;
  register_started: boolean;
};

export type AdminAttendanceHistoryRow = {
  entry_id: string;
  register_id: string;
  class_id: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  attendance_status: Exclude<ClassAttendanceStatus, null>;
  class_name: string;
  level_name: string;
  course_type: string;
  teacher_name: string;
  academic_year_label: string | null;
};

export type AdminAttendanceCourse = {
  class_id: string;
  label: string;
  academic_year_label: string | null;
  summary: ClassAttendanceSummary;
};

export type AdminStudentAttendance = {
  current_class_id: string | null;
  summary: ClassAttendanceSummary;
  courses: AdminAttendanceCourse[];
  history: AdminAttendanceHistoryRow[];
};

export function getEmptyClassAttendanceSummary(): ClassAttendanceSummary {
  return {
    present_count: 0,
    absent_count: 0,
    completed_register_count: 0,
    attendance_percentage: null,
  };
}
