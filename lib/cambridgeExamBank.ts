export const CAMBRIDGE_EXAM_LEVELS = ["B1", "B2", "C1", "C2"] as const;
export const CAMBRIDGE_EXAM_PARTS = [
  "reading",
  "listening",
  "writing",
  "speaking",
] as const;
export const CAMBRIDGE_EXAM_RESOURCE_TYPES = [
  "paper",
  "key",
  "audio",
  "sample_writing",
] as const;
export const CAMBRIDGE_EXAM_URL_MAX_LENGTH = 2048;

export type CambridgeExamLevel = (typeof CAMBRIDGE_EXAM_LEVELS)[number];
export type CambridgeExamPartType = (typeof CAMBRIDGE_EXAM_PARTS)[number];
export type CambridgeExamResourceType =
  (typeof CAMBRIDGE_EXAM_RESOURCE_TYPES)[number];

export type CambridgeExamFormParts = Record<
  CambridgeExamPartType,
  Partial<Record<CambridgeExamResourceType, string>>
>;

export type CambridgeExamSavePayload = {
  level_id: string | number;
  exam_number: number;
  title: string;
  parts: CambridgeExamFormParts;
};

export type CambridgeExamRecord = {
  id: string;
  level: { id: number; name: string };
  exam_number: number;
  title: string | null;
  active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  completeness: {
    complete_parts: number;
    total_parts: number;
    ready: boolean;
    missing: string[];
  };
  parts: Array<{
    id: string | null;
    part_type: CambridgeExamPartType;
    display_label: string;
    complete: boolean;
    missing_resources: CambridgeExamResourceType[];
    resources: Array<{
      resource_type: CambridgeExamResourceType;
      external_url: string;
    }>;
  }>;
};

export const REQUIRED_RESOURCES: Record<
  CambridgeExamPartType,
  readonly CambridgeExamResourceType[]
> = {
  reading: ["paper", "key"],
  listening: ["paper", "audio", "key"],
  writing: ["paper", "sample_writing"],
  speaking: ["paper"],
};

export const RESOURCE_LABELS: Record<CambridgeExamResourceType, string> = {
  paper: "Question Paper",
  key: "Key",
  audio: "Audio",
  sample_writing: "Sample Writing",
};

const MISSING_RESOURCE_LABELS: Record<CambridgeExamResourceType, string> = {
  paper: "question paper",
  key: "key",
  audio: "audio",
  sample_writing: "sample",
};

export function createEmptyExamParts(): CambridgeExamFormParts {
  return {
    reading: { paper: "", key: "" },
    listening: { paper: "", audio: "", key: "" },
    writing: { paper: "", sample_writing: "" },
    speaking: { paper: "" },
  };
}

export function normalizeCambridgeExamLevel(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

export function isEligibleCambridgeExamLevel(
  value: unknown
): value is CambridgeExamLevel {
  return CAMBRIDGE_EXAM_LEVELS.includes(
    normalizeCambridgeExamLevel(value) as CambridgeExamLevel
  );
}

export function getExamPartLabel(
  level: unknown,
  partType: CambridgeExamPartType
) {
  if (partType === "reading") {
    return normalizeCambridgeExamLevel(level) === "B1"
      ? "Reading"
      : "Reading and Use of English";
  }

  return partType.charAt(0).toUpperCase() + partType.slice(1);
}

export function normalizeExternalUrl(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidExternalUrl(value: unknown) {
  const normalized = normalizeExternalUrl(value);
  if (!normalized || /\s/.test(normalized)) return false;

  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getMissingResources(
  partType: CambridgeExamPartType,
  resources: Partial<Record<CambridgeExamResourceType, string>>
) {
  return REQUIRED_RESOURCES[partType].filter(
    (resourceType) => !normalizeExternalUrl(resources[resourceType])
  );
}

export function getExamCompleteness(
  level: unknown,
  parts: CambridgeExamFormParts
) {
  const partSummaries = CAMBRIDGE_EXAM_PARTS.map((partType) => {
    const missingResources = getMissingResources(partType, parts[partType]);
    return {
      part_type: partType,
      display_label: getExamPartLabel(level, partType),
      complete: missingResources.length === 0,
      missing_resources: missingResources,
    };
  });
  const missing = partSummaries.flatMap((part) =>
    part.missing_resources.map(
      (resourceType) =>
        `Missing ${part.display_label} ${MISSING_RESOURCE_LABELS[resourceType]}`
    )
  );

  return {
    complete_parts: partSummaries.filter((part) => part.complete).length,
    total_parts: CAMBRIDGE_EXAM_PARTS.length,
    ready: missing.length === 0,
    missing,
    parts: partSummaries,
  };
}

export function formatExamName(
  levelName: unknown,
  examNumber: unknown,
  title?: unknown
) {
  const base = `${normalizeCambridgeExamLevel(levelName)} Exam ${Number(
    examNumber
  )}`;
  const safeTitle = String(title || "").trim();
  return safeTitle ? `${base} · ${safeTitle}` : base;
}
