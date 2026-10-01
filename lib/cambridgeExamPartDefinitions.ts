export const CAMBRIDGE_NON_SPEAKING_SKILLS = [
  "reading",
  "listening",
  "writing",
] as const;

export type CambridgeNonSpeakingSkill = (typeof CAMBRIDGE_NON_SPEAKING_SKILLS)[number];

/**
 * Official Cambridge paper structure used by Express and Intensive planning.
 * The exam-bank rows identify the skill; these definitions identify the
 * numbered parts inside that skill for each level.
 */
export const CAMBRIDGE_LEVEL_PART_COUNTS: Record<string, Record<CambridgeNonSpeakingSkill, number>> = {
  B1: { reading: 6, listening: 4, writing: 2 },
  B2: { reading: 7, listening: 4, writing: 2 },
  C1: { reading: 8, listening: 4, writing: 2 },
  C2: { reading: 7, listening: 4, writing: 2 },
};

export function normalizeCambridgeLevel(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

export function partCountFor(level: unknown, skill: unknown) {
  const counts = CAMBRIDGE_LEVEL_PART_COUNTS[normalizeCambridgeLevel(level)];
  const key = String(skill || "").trim().toLowerCase() as CambridgeNonSpeakingSkill;
  return counts?.[key] || 0;
}

export function skillLabelFor(level: unknown, skill: unknown) {
  const key = String(skill || "").trim().toLowerCase();
  if (key === "reading") {
    return normalizeCambridgeLevel(level) === "B1" ? "Reading" : "Reading and Use of English";
  }
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "Exam skill";
}

export function partLabel(partNumber: number) {
  return `Part ${partNumber}`;
}
