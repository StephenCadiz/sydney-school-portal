/**
 * Student-facing teacher display names.
 *
 * Keep this transformation scoped to Cambridge student output. The canonical
 * profile name remains unchanged everywhere else in the portal.
 */
export const CAMBRIDGE_ROSE_TEACHER_PROFILE_ID =
  "8be7d093-d270-40d4-b758-e53d7bc99752";

export type StudentFacingTeacherProfile = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export function getStudentFacingTeacherName(
  teacher: StudentFacingTeacherProfile | null | undefined,
  isCambridgeStudent: boolean
) {
  if (
    isCambridgeStudent &&
    String(teacher?.id || "") === CAMBRIDGE_ROSE_TEACHER_PROFILE_ID
  ) {
    return "Rose";
  }

  return (
    [teacher?.first_name, teacher?.last_name]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ") || "Teacher"
  );
}
