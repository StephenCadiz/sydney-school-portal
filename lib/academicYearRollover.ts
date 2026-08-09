import type {
  AcademicYearReadiness,
  AcademicYearRollover,
  AcademicYearRolloverDecision,
  AcademicYearRolloverWorkspace,
} from "./academicYearRolloverRules";
import type { AcademicYear } from "./academicYearRules";
import { supabase } from "./supabase";

async function accessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("You must be logged in as an Admin.");
  return session.access_token;
}

async function adminRequest(path: string, init?: RequestInit) {
  const token = await accessToken();
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Unable to complete the rollover request.");
    Object.assign(error, { payload, status: response.status });
    throw error;
  }
  return payload;
}

export async function getAcademicYearRolloverLanding(): Promise<{
  academic_years: AcademicYear[];
  rollovers: AcademicYearRollover[];
}> {
  return adminRequest("/api/admin/academic-years/rollover");
}

export async function createAcademicYearRollover(input: {
  source_academic_year_id: string;
  target_academic_year_id: string;
}) {
  const payload = await adminRequest("/api/admin/academic-years/rollover", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return payload.rollover as AcademicYearRollover;
}

export async function getAcademicYearRolloverWorkspace(id: string) {
  const payload = await adminRequest(
    `/api/admin/academic-years/rollover/${encodeURIComponent(id)}`
  );
  return payload.workspace as AcademicYearRolloverWorkspace;
}

export async function copyAcademicYearRolloverClasses(
  rolloverId: string,
  classes: Array<{
    source_class_id: string;
    teacher_id: string;
    classroom_id: string | null;
  }>
) {
  return adminRequest(
    `/api/admin/academic-years/rollover/${encodeURIComponent(
      rolloverId
    )}/copy-classes`,
    { method: "POST", body: JSON.stringify({ classes }) }
  );
}

export async function saveAcademicYearRolloverDecisions(
  rolloverId: string,
  decisions: Array<{
    id: string;
    decision: AcademicYearRolloverDecision;
    target_class_id: string | null;
    notes: string;
  }>
) {
  return adminRequest(
    `/api/admin/academic-years/rollover/${encodeURIComponent(
      rolloverId
    )}/students`,
    { method: "PATCH", body: JSON.stringify({ decisions }) }
  );
}

export async function applyAcademicYearRollover(rolloverId: string) {
  return adminRequest(
    `/api/admin/academic-years/rollover/${encodeURIComponent(rolloverId)}/apply`,
    { method: "POST" }
  );
}

export async function getAcademicYearReadiness(academicYearId: string) {
  const payload = await adminRequest(
    `/api/admin/academic-years/${encodeURIComponent(academicYearId)}/readiness`
  );
  return payload.readiness as AcademicYearReadiness;
}
