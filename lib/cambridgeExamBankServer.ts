import "server-only";

import { NextRequest, NextResponse } from "next/server";

import {
  CAMBRIDGE_EXAM_PARTS,
  CAMBRIDGE_EXAM_URL_MAX_LENGTH,
  CambridgeExamFormParts,
  CambridgeExamResourceType,
  createEmptyExamParts,
  getExamCompleteness,
  getExamPartLabel,
  isEligibleCambridgeExamLevel,
  isValidExternalUrl,
  normalizeExternalUrl,
} from "./cambridgeExamBank";
import { supabaseAdmin } from "./supabaseAdmin";

export function examBankJsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireExamBankAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) {
    return {
      userId: "",
      response: examBankJsonError("Authentication required.", 401),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return {
      userId: "",
      response: examBankJsonError("Authentication required.", 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("Exam Bank Admin verification failed:", {
      stage: "profile-lookup",
      actorId: user.id,
    });
    return {
      userId: "",
      response: examBankJsonError("Unable to verify Admin access.", 500),
    };
  }

  if (profile?.role !== "admin") {
    return {
      userId: "",
      response: examBankJsonError("Admin access required.", 403),
    };
  }

  return { userId: user.id, response: null };
}

export async function getEligibleExamBankLevel(levelId: number) {
  const { data, error } = await supabaseAdmin
    .from("levels")
    .select("id, name")
    .eq("id", levelId)
    .single();

  if (error || !data || !isEligibleCambridgeExamLevel(data.name)) {
    return null;
  }

  return {
    id: data.id,
    name: String(data.name).trim().toUpperCase(),
  };
}

type ValidatedExamPayload = {
  levelId: number;
  examNumber: number;
  title: string | null;
  parts: CambridgeExamFormParts;
};

export function validateExamBankPayload(
  input: unknown
):
  | { value: ValidatedExamPayload; error: null }
  | { value: null; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { value: null, error: "Invalid Exam Bank payload." };
  }

  const body = input as Record<string, unknown>;
  const allowedTopLevelFields = new Set([
    "level_id",
    "exam_number",
    "title",
    "parts",
  ]);

  if (Object.keys(body).some((key) => !allowedTopLevelFields.has(key))) {
    return { value: null, error: "The request contains unsupported fields." };
  }

  const levelId = Number(body.level_id);
  const examNumber = Number(body.exam_number);
  if (
    body.title !== undefined &&
    body.title !== null &&
    typeof body.title !== "string"
  ) {
    return { value: null, error: "Internal title must be text." };
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!Number.isInteger(levelId) || levelId <= 0) {
    return { value: null, error: "Choose a valid Cambridge level." };
  }

  if (!Number.isInteger(examNumber) || examNumber <= 0) {
    return {
      value: null,
      error: "Exam number must be a positive whole number.",
    };
  }

  if (title.length > 120) {
    return {
      value: null,
      error: "Internal title must be 120 characters or fewer.",
    };
  }

  if (!body.parts || typeof body.parts !== "object" || Array.isArray(body.parts)) {
    return { value: null, error: "Exactly four exam parts are required." };
  }

  const submittedParts = body.parts as Record<string, unknown>;
  const submittedPartKeys = Object.keys(submittedParts).sort();
  const canonicalPartKeys = [...CAMBRIDGE_EXAM_PARTS].sort();

  if (
    submittedPartKeys.length !== canonicalPartKeys.length ||
    submittedPartKeys.some((key, index) => key !== canonicalPartKeys[index])
  ) {
    return { value: null, error: "Exactly four exam parts are required." };
  }

  const normalizedParts = createEmptyExamParts();

  for (const partType of CAMBRIDGE_EXAM_PARTS) {
    const part = submittedParts[partType];
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      return { value: null, error: `Invalid ${partType} resources.` };
    }

    const submittedResources = part as Record<string, unknown>;
    const allowedResources = new Set(Object.keys(normalizedParts[partType]));

    if (
      Object.keys(submittedResources).some(
        (resourceType) => !allowedResources.has(resourceType)
      )
    ) {
      return {
        value: null,
        error: `Invalid resource type for ${partType}.`,
      };
    }

    const normalizedResources: Partial<
      Record<CambridgeExamResourceType, string>
    > = {};

    for (const [resourceType, submittedUrl] of Object.entries(
      submittedResources
    )) {
      if (typeof submittedUrl !== "string") {
        return {
          value: null,
          error: `Invalid URL for ${partType} ${resourceType}.`,
        };
      }

      const url = normalizeExternalUrl(submittedUrl);
      if (!url) continue;

      if (url.length > CAMBRIDGE_EXAM_URL_MAX_LENGTH) {
        return {
          value: null,
          error: `URL for ${partType} ${resourceType} must contain no more than ${CAMBRIDGE_EXAM_URL_MAX_LENGTH} characters.`,
        };
      }

      if (!isValidExternalUrl(url)) {
        return {
          value: null,
          error: `Enter a valid HTTP or HTTPS URL for ${partType} ${resourceType}.`,
        };
      }

      normalizedResources[resourceType as CambridgeExamResourceType] = url;
    }

    normalizedParts[partType] = normalizedResources;
  }

  return {
    value: {
      levelId,
      examNumber,
      title: title || null,
      parts: normalizedParts,
    },
    error: null,
  };
}

export const examBankSelect = `
  id,
  exam_number,
  title,
  active,
  archived_at,
  created_at,
  updated_at,
  level:levels!cambridge_exam_sets_level_id_fkey (
    id,
    name
  ),
  parts:cambridge_exam_parts (
    id,
    part_type,
    resources:cambridge_exam_part_resources (
      resource_type,
      external_url
    )
  )
`;

export function serializeExamBankRow(row: any) {
  const levelRelation = Array.isArray(row?.level) ? row.level[0] : row?.level;
  const level = {
    id: levelRelation?.id,
    name: String(levelRelation?.name || "").trim().toUpperCase(),
  };
  const partsByType = new Map<string, any>(
    (row?.parts || []).map((part: any) => [part.part_type, part])
  );
  const formParts = createEmptyExamParts();
  const parts = CAMBRIDGE_EXAM_PARTS.map((partType) => {
    const part = partsByType.get(partType);
    const resources = (part?.resources || [])
      .filter(
        (resource: any) =>
          typeof resource.resource_type === "string" &&
          typeof resource.external_url === "string"
      )
      .map((resource: any) => ({
        resource_type: resource.resource_type as CambridgeExamResourceType,
        external_url: resource.external_url,
      }));

    formParts[partType] = Object.fromEntries(
      resources.map((resource: any) => [
        resource.resource_type,
        resource.external_url,
      ])
    );

    return {
      id: part?.id || null,
      part_type: partType,
      display_label: getExamPartLabel(level.name, partType),
      resources,
    };
  });
  const completeness = getExamCompleteness(level.name, formParts);

  return {
    id: row.id,
    level,
    exam_number: row.exam_number,
    title: row.title,
    active: row.active,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completeness: {
      complete_parts: completeness.complete_parts,
      total_parts: completeness.total_parts,
      ready: completeness.ready,
      missing: completeness.missing,
    },
    parts: parts.map((part) => {
      const partCompleteness = completeness.parts.find(
        (item) => item.part_type === part.part_type
      );
      return {
        ...part,
        complete: partCompleteness?.complete || false,
        missing_resources: partCompleteness?.missing_resources || [],
      };
    }),
  };
}

export function getExamPartsPayload(parts: CambridgeExamFormParts) {
  return Object.fromEntries(
    CAMBRIDGE_EXAM_PARTS.map((partType) => [
      partType,
      Object.fromEntries(
        Object.entries(parts[partType]).filter(([, value]) =>
          Boolean(normalizeExternalUrl(value))
        )
      ),
    ])
  );
}
