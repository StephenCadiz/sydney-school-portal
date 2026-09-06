import { supabase } from "./supabase";
import type {
  SyllabusMaterialType,
  SyllabusStatus,
} from "./syllabusValidation";

export type SyllabusMaterial = {
  id: string;
  unit_id: string;
  material_type: SyllabusMaterialType;
  label: string;
  description: string;
  external_url: string | null;
  storage_path?: string | null;
  has_private_file?: boolean;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SyllabusUnit = {
  id: string;
  syllabus_id: string;
  title: string;
  pages_text: string;
  content_text: string;
  target_completion_date: string;
  exam_week_start_date: string | null;
  exam_week_end_date: string | null;
  exam_information: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  materials: SyllabusMaterial[];
};

export type Syllabus = {
  id: string;
  academic_year_id: string;
  level_id: number;
  title: string;
  status: SyllabusStatus;
  created_by?: string;
  updated_by?: string;
  published_by?: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  academic_year: {
    id: string;
    label: string;
    start_date: string;
    end_date: string;
    status: string;
  };
  level: { id: number; name: string };
  units: SyllabusUnit[];
};

export type SyllabusReferenceData = {
  academic_years: Array<{
    id: string;
    label: string;
    start_date: string;
    end_date: string;
    status: string;
  }>;
  levels: Array<{ id: number; name: string }>;
};

async function accessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  return session.access_token;
}

async function requestJson(url: string, init: RequestInit = {}) {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload.error || "Unable to complete the syllabus request."));
  }
  return payload;
}

export async function getAdminSyllabuses() {
  return requestJson("/api/admin/syllabuses") as Promise<{
    syllabuses: Syllabus[];
    reference_data: SyllabusReferenceData;
  }>;
}

export async function createSyllabus(input: {
  academic_year_id: string;
  level_id: number;
  title: string;
}) {
  return requestJson("/api/admin/syllabuses", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ syllabus: Syllabus }>;
}

export async function updateSyllabus(
  syllabusId: string,
  body: Record<string, unknown>
) {
  return requestJson(`/api/admin/syllabuses/${encodeURIComponent(syllabusId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }) as Promise<{ syllabus: Syllabus; message?: string }>;
}

export async function deleteSyllabus(syllabusId: string) {
  return requestJson(`/api/admin/syllabuses/${encodeURIComponent(syllabusId)}`, {
    method: "DELETE",
  }) as Promise<{
    deleted: true;
    storageCleanupFailed?: boolean;
    message?: string;
  }>;
}

export async function createSyllabusUnit(
  syllabusId: string,
  unit: Record<string, unknown>
) {
  return requestJson(
    `/api/admin/syllabuses/${encodeURIComponent(syllabusId)}/units`,
    { method: "POST", body: JSON.stringify(unit) }
  ) as Promise<{ syllabus: Syllabus }>;
}

export async function updateSyllabusUnit(
  syllabusId: string,
  unitId: string,
  unit: Record<string, unknown>
) {
  return requestJson(
    `/api/admin/syllabuses/${encodeURIComponent(syllabusId)}/units/${encodeURIComponent(unitId)}`,
    { method: "PATCH", body: JSON.stringify(unit) }
  ) as Promise<{ syllabus: Syllabus }>;
}

export async function deleteSyllabusUnit(syllabusId: string, unitId: string) {
  return requestJson(
    `/api/admin/syllabuses/${encodeURIComponent(syllabusId)}/units/${encodeURIComponent(unitId)}`,
    { method: "DELETE" }
  ) as Promise<{ syllabus: Syllabus; storageCleanupFailed?: boolean; message?: string }>;
}

export async function reorderSyllabusUnits(syllabusId: string, unitIds: string[]) {
  return requestJson(
    `/api/admin/syllabuses/${encodeURIComponent(syllabusId)}/units`,
    { method: "PATCH", body: JSON.stringify({ unit_ids: unitIds }) }
  ) as Promise<{ syllabus: Syllabus }>;
}

export async function createSyllabusMaterial(
  syllabusId: string,
  unitId: string,
  formData: FormData
) {
  return requestJson(
    `/api/admin/syllabuses/${encodeURIComponent(syllabusId)}/units/${encodeURIComponent(unitId)}/materials`,
    { method: "POST", body: formData }
  ) as Promise<{ syllabus: Syllabus }>;
}

export async function updateSyllabusMaterial(
  syllabusId: string,
  unitId: string,
  materialId: string,
  body: Record<string, unknown>
) {
  return requestJson(
    `/api/admin/syllabuses/${encodeURIComponent(syllabusId)}/units/${encodeURIComponent(unitId)}/materials/${encodeURIComponent(materialId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  ) as Promise<{ syllabus: Syllabus }>;
}

export async function deleteSyllabusMaterial(
  syllabusId: string,
  unitId: string,
  materialId: string
) {
  return requestJson(
    `/api/admin/syllabuses/${encodeURIComponent(syllabusId)}/units/${encodeURIComponent(unitId)}/materials/${encodeURIComponent(materialId)}`,
    { method: "DELETE" }
  ) as Promise<{ syllabus: Syllabus; storageCleanupFailed?: boolean; message?: string }>;
}

export async function reorderSyllabusMaterials(
  syllabusId: string,
  unitId: string,
  materialIds: string[]
) {
  return requestJson(
    `/api/admin/syllabuses/${encodeURIComponent(syllabusId)}/units/${encodeURIComponent(unitId)}/materials`,
    { method: "PATCH", body: JSON.stringify({ material_ids: materialIds }) }
  ) as Promise<{ syllabus: Syllabus }>;
}

export async function getTeacherClassSyllabus(classId: string) {
  return requestJson(
    `/api/teacher/classes/${encodeURIComponent(classId)}/syllabus`
  ) as Promise<{ syllabus: Syllabus | null }>;
}

export async function openTeacherSyllabusMaterial(
  classId: string,
  materialId: string
) {
  const payload = await requestJson(
    `/api/teacher/classes/${encodeURIComponent(classId)}/syllabus/materials/${encodeURIComponent(materialId)}/open`,
    { method: "POST" }
  );
  return String(payload.signedUrl || "");
}
