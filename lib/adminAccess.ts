/**
 * Targeted Admin capability policy for staff accounts that need a narrower
 * workspace than the default Admin role.
 *
 * Keep the exception keyed by the stable profile ID. Display names and email
 * addresses are mutable and must never be used as an authorization key.
 */

export const ROCIO_AYALA_PROFILE_ID = "3eb96ad4-e8f7-4e96-bc96-ad8e533cf4a2";

const ROCIO_ALLOWED_PATHS = [
  "/admin",
  "/admin/students",
  "/admin/student-information",
  "/admin/class-enrolments",
  "/admin/school-roster",
  "/admin/class-exams",
  "/admin/print-class-exams",
  "/admin/friday-tutorials",
  "/admin/attendance",
  "/admin/school-closures/summary",
  "/admin/messages",
  "/admin/announcements",
  "/admin/resources",
] as const;

export function isRocioRestrictedAdmin(profileId: string | null | undefined) {
  return String(profileId || "").trim() === ROCIO_AYALA_PROFILE_ID;
}

export function adminPathAllowed(
  profileId: string | null | undefined,
  pathname: string
) {
  if (!isRocioRestrictedAdmin(profileId)) return true;
  const normalized = pathname.split("?")[0].replace(/\/$/, "") || "/";
  return ROCIO_ALLOWED_PATHS.some(
    (allowedPath) =>
      normalized === allowedPath ||
      (allowedPath !== "/admin" && normalized.startsWith(`${allowedPath}/`))
  );
}

/**
 * Admin API paths may include narrowly scoped self-service endpoints that do
 * not have a visible Admin page. Keep those endpoints out of the page/menu
 * policy while still allowing the authenticated account to use its own
 * server-validated self-service action.
 */
export function adminApiPathAllowed(
  profileId: string | null | undefined,
  pathname: string
) {
  if (
    isRocioRestrictedAdmin(profileId) &&
    (pathname.split("?")[0].replace(/\/$/, "") || "/") === "/admin/staff-time/self"
  ) {
    return true;
  }
  return adminPathAllowed(profileId, pathname);
}

export function filterAdminNavGroups<T extends { items: Array<{ href: string }> }>(
  profileId: string | null | undefined,
  groups: T[]
) {
  if (!isRocioRestrictedAdmin(profileId)) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => adminPathAllowed(profileId, item.href)),
    }))
    .filter((group) => group.items.length > 0);
}

export function isAdminAttendanceOverviewOnly(profileId: string | null | undefined) {
  return isRocioRestrictedAdmin(profileId);
}
