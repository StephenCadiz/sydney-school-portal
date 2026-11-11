export type ClassDeliveryMode = "in_person" | "online" | "hybrid";

export const CLASS_DELIVERY_MODES: readonly ClassDeliveryMode[] = [
  "in_person",
  "online",
  "hybrid",
];

export function normalizeClassDeliveryMode(value: unknown): ClassDeliveryMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "online" || normalized === "hybrid"
    ? normalized
    : "in_person";
}

/**
 * Legacy online classes pre-date the Cambridge delivery setting. They remain
 * online while Cambridge classes can use the new delivery_mode field.
 */
export function classHasOnlineOption(classroom: {
  course_type?: unknown;
  is_cambridge?: unknown;
  delivery_mode?: unknown;
} | null | undefined) {
  if (!classroom) return false;
  if (String(classroom.course_type ?? "").trim().toLowerCase() === "online") {
    return true;
  }
  return normalizeClassDeliveryMode(classroom.delivery_mode) !== "in_person";
}

export function classIsOnlineOnly(classroom: {
  course_type?: unknown;
  is_cambridge?: unknown;
  delivery_mode?: unknown;
} | null | undefined) {
  if (!classroom) return false;
  if (String(classroom.course_type ?? "").trim().toLowerCase() === "online") {
    return true;
  }
  return normalizeClassDeliveryMode(classroom.delivery_mode) === "online";
}

