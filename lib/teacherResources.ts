import { supabase } from "./supabase";
import type { TeacherResourceType } from "./teacherResourceValidation";

export type TeacherResourceScope = "shared_teacher" | "official_teacher";

export type TeacherResource = {
  id: string;
  title: string;
  description: string;
  resource_scope: TeacherResourceScope;
  level_id: number | string;
  created_by: string | null;
  external_url: string | null;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  level_name?: string;
};

type TeacherResourceRow = Omit<TeacherResource, "creator_name" | "level_name">;

type CreateSharedTeacherResourceInput = {
  levelId: string | number;
  title: string;
  description: string;
  resourceType: TeacherResourceType;
  externalUrl?: string;
  file?: File | null;
};

type CreateOfficialTeacherResourceInput = CreateSharedTeacherResourceInput;

function formatProfileName(profile: any) {
  return `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
}

async function getTeacherResourcesForLevel(
  levelId: string | number,
  resourceScope: TeacherResourceScope
) {
  const { data, error } = await supabase
    .from("teacher_resources")
    .select(
      "id, title, description, resource_scope, level_id, created_by, external_url, storage_path, original_filename, mime_type, file_size, created_at, updated_at"
    )
    .eq("level_id", levelId)
    .eq("resource_scope", resourceScope)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Unable to load teacher resources:", error);
    throw new Error("Unable to load teacher resources.");
  }

  return (data || []) as TeacherResourceRow[];
}

async function attachCreatorNames(resources: TeacherResourceRow[]) {
  const creatorIds = Array.from(
    new Set(resources.map((resource) => resource.created_by).filter(Boolean))
  ) as string[];

  if (creatorIds.length === 0) {
    return resources.map((resource) => ({
      ...resource,
      creator_name: "Sydney School",
    }));
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", creatorIds);

  if (error) {
    console.error("Unable to load resource creator names:", error);
  }

  const profileNames = new Map(
    (profiles || []).map((profile: any) => [
      profile.id,
      formatProfileName(profile) || "Sydney School",
    ])
  );

  return resources.map((resource) => ({
    ...resource,
    creator_name: resource.created_by
      ? profileNames.get(resource.created_by) || "Sydney School"
      : "Sydney School",
  }));
}

async function attachLevelNames(resources: TeacherResourceRow[]) {
  const levelIds = Array.from(
    new Set(resources.map((resource) => resource.level_id).filter(Boolean))
  );

  if (levelIds.length === 0) {
    return resources.map((resource) => ({
      ...resource,
      level_name: "Unknown Level",
    }));
  }

  const { data: levels, error } = await supabase
    .from("levels")
    .select("id, name")
    .in("id", levelIds);

  if (error) {
    console.error("Unable to load resource level names:", error);
  }

  const levelNames = new Map(
    (levels || []).map((level: any) => [String(level.id), level.name])
  );

  return resources.map((resource) => ({
    ...resource,
    level_name: levelNames.get(String(resource.level_id)) || "Unknown Level",
  }));
}

export async function getSharedTeacherResourcesForLevel(
  levelId: string | number
) {
  const resources = await getTeacherResourcesForLevel(levelId, "shared_teacher");
  return attachCreatorNames(resources);
}

export async function getOfficialTeacherResourcesForLevel(
  levelId: string | number
) {
  return getTeacherResourcesForLevel(levelId, "official_teacher");
}

async function getAllTeacherResourcesForAdmin(resourceScope: TeacherResourceScope) {
  const { data, error } = await supabase
    .from("teacher_resources")
    .select(
      "id, title, description, resource_scope, level_id, created_by, external_url, storage_path, original_filename, mime_type, file_size, created_at, updated_at"
    )
    .eq("resource_scope", resourceScope)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Unable to load admin teacher resources:", error);
    throw new Error("Unable to load teacher resources.");
  }

  return attachLevelNames((data || []) as TeacherResourceRow[]);
}

export async function getAllOfficialTeacherResourcesForAdmin() {
  return getAllTeacherResourcesForAdmin("official_teacher");
}

export async function getAllSharedTeacherResourcesForAdmin() {
  const resources = await getAllTeacherResourcesForAdmin("shared_teacher");
  return attachCreatorNames(resources);
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You must be logged in to manage resources.");
  }

  return session.access_token;
}

async function parseApiResponse(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function createSharedTeacherResource(
  input: CreateSharedTeacherResourceInput
) {
  const accessToken = await getAccessToken();
  const formData = new FormData();

  formData.append("levelId", String(input.levelId));
  formData.append("title", input.title);
  formData.append("description", input.description);
  formData.append("resourceType", input.resourceType);

  if (input.resourceType === "link") {
    formData.append("externalUrl", input.externalUrl || "");
  }

  if (input.resourceType === "file" && input.file) {
    formData.append("file", input.file);
  }

  const response = await fetch("/api/teacher/resources/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const result = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(result.error || "Unable to publish resource.");
  }

  return result;
}

export async function createOfficialTeacherResource(
  input: CreateOfficialTeacherResourceInput
) {
  const accessToken = await getAccessToken();
  const formData = new FormData();

  formData.append("levelId", String(input.levelId));
  formData.append("title", input.title);
  formData.append("description", input.description);
  formData.append("resourceType", input.resourceType);

  if (input.resourceType === "link") {
    formData.append("externalUrl", input.externalUrl || "");
  }

  if (input.resourceType === "file" && input.file) {
    formData.append("file", input.file);
  }

  const response = await fetch("/api/admin/resources/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const result = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(result.error || "Unable to publish official resource.");
  }

  return result;
}

export async function deleteTeacherResourceForAdmin(resourceId: string) {
  const accessToken = await getAccessToken();

  const response = await fetch("/api/admin/resources/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resourceId,
    }),
  });

  const result = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(result.error || "Unable to delete resource.");
  }

  return result;
}

export async function getTeacherResourceSignedUrl(resourceId: string) {
  const accessToken = await getAccessToken();

  const response = await fetch("/api/teacher/resources/open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resourceId,
    }),
  });

  const result = await parseApiResponse(response);

  if (!response.ok || !result.signedUrl) {
    throw new Error(result.error || "Unable to open resource file.");
  }

  return String(result.signedUrl);
}
