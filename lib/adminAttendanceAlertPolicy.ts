export type AdminAttendanceAlertStudentType = "profile" | "young_learner";

/**
 * Student identities that remain visible in attendance data but are excluded
 * from Admin attention alerts and alert counts.
 */
export const ADMIN_ATTENDANCE_ALERT_EXEMPTIONS = Object.freeze([
  {
    studentType: "young_learner" as const,
    studentId: "f0521a4f-7343-473d-958f-74a8c6353d4d",
  },
]);

export function isAdminAttendanceAlertExempt(
  studentType: AdminAttendanceAlertStudentType,
  studentId: unknown
) {
  const normalizedId = String(studentId ?? "").trim().toLowerCase();
  return ADMIN_ATTENDANCE_ALERT_EXEMPTIONS.some(
    (exemption) =>
      exemption.studentType === studentType &&
      exemption.studentId === normalizedId
  );
}
