import type {
  AdminAttendanceHistoryRow,
  ClassAttendanceSummary,
} from "./classRegister";

export type AttendanceStudentType = "profile" | "young_learner";
export type AttendanceAlertType =
  | "consecutive_absence"
  | "low_attendance";
export type AttendanceAlertViewStatus =
  | "needs_attention"
  | "dealt_with"
  | "resolved";

export type AdminAttendanceAcademicYear = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: "current" | "future" | "archived";
};

export type AdminAttendanceClassSummary = ClassAttendanceSummary & {
  class_id: string;
  class_name: string;
  level_id: string;
  level_name: string;
  teacher_id: string;
  teacher_name: string;
  course_type: string;
  academic_year_id: string | null;
  academic_year_label: string | null;
  course_start_date: string | null;
  course_end_date: string | null;
  days: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  student_count: number;
  active_alert_count: number;
};

export type AdminAttendanceLevelSummary = ClassAttendanceSummary & {
  level_id: string;
  level_name: string;
  class_count: number;
  student_count: number;
  active_alert_count: number;
};

export type AdminAttendanceAlert = {
  id: string;
  alert_type: AttendanceAlertType;
  status: AttendanceAlertViewStatus;
  class_id: string;
  class_name: string;
  level_name: string;
  teacher_name: string;
  student_type: AttendanceStudentType;
  student_id: string;
  student_name: string;
  condition_active: boolean;
  triggered_at: string;
  resolved_at: string | null;
  dealt_with_at: string | null;
  dealt_with_by_name: string | null;
  absence_dates: string[];
  summary: ClassAttendanceSummary;
};

export type AdminAttendanceOverview = {
  academic_years: AdminAttendanceAcademicYear[];
  selected_academic_year: AdminAttendanceAcademicYear | null;
  summary: ClassAttendanceSummary & {
    active_alert_count: number;
    alert_student_count: number;
    low_attendance_alert_count: number;
    consecutive_absence_alert_count: number;
    students_below_70_count: number;
  };
  levels: AdminAttendanceLevelSummary[];
  classes: AdminAttendanceClassSummary[];
  alerts: AdminAttendanceAlert[];
};

export type AdminAttendanceClassStudent = ClassAttendanceSummary & {
  student_type: AttendanceStudentType;
  student_id: string;
  student_name: string;
  active: boolean;
  active_alert_count: number;
};

export type AdminAttendanceClassDetails = {
  classroom: AdminAttendanceClassSummary;
  students: AdminAttendanceClassStudent[];
};

export type AdminAttendanceStudentSearchResult = {
  student_type: AttendanceStudentType;
  student_id: string;
  student_name: string;
  email: string | null;
  active: boolean;
  class_id: string | null;
  class_name: string | null;
  level_name: string | null;
};

export type AdminAttendanceStudentCourse = ClassAttendanceSummary & {
  class_id: string;
  class_name: string;
  level_name: string;
  teacher_name: string;
  course_type: string;
  academic_year_label: string | null;
};

export type AdminAttendanceStudentDetails = {
  student: {
    student_type: AttendanceStudentType;
    student_id: string;
    student_name: string;
    email: string | null;
    active: boolean;
  };
  selected_academic_year: AdminAttendanceAcademicYear | null;
  current_class_id: string | null;
  summary: ClassAttendanceSummary;
  courses: AdminAttendanceStudentCourse[];
  history: AdminAttendanceHistoryRow[];
  alerts: AdminAttendanceAlert[];
};

export function formatAttendancePercentage(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "No records";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}
