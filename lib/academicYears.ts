import type { AcademicYear } from "./academicYearRules";
import { supabase } from "./supabase";

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You must be logged in.");
  }

  return session.access_token;
}

export async function getCurrentAcademicYear(): Promise<AcademicYear | null> {
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, label, start_date, end_date, status, created_at, updated_at")
    .eq("status", "current")
    .maybeSingle();

  if (error) {
    console.error("Unable to load the current academic year:", error);
    throw new Error("Unable to load the current academic year.");
  }

  return (data as AcademicYear | null) || null;
}

export async function getAcademicYears(): Promise<AcademicYear[]> {
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, label, start_date, end_date, status, created_at, updated_at")
    .order("start_date", { ascending: false });

  if (error) {
    console.error("Unable to load academic years:", error);
    throw new Error("Unable to load academic years.");
  }

  return (data || []) as AcademicYear[];
}

export async function getAdminAcademicYears(): Promise<AcademicYear[]> {
  const token = await getAccessToken();
  const response = await fetch("/api/admin/academic-years", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load academic years.");
  }

  return (payload.academic_years || []) as AcademicYear[];
}

export async function createAcademicYear(input: {
  label: string;
  start_date: string;
  end_date: string;
}) {
  const token = await getAccessToken();
  const response = await fetch("/api/admin/academic-years", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Unable to create the academic year.");
  }

  return payload.academic_year as AcademicYear;
}

export async function updateAcademicYear(
  id: string,
  input:
    | { action: "update"; label: string; start_date: string; end_date: string }
    | { action: "set_current" }
    | { action: "archive" }
) {
  const token = await getAccessToken();
  const response = await fetch(
    `/api/admin/academic-years/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Unable to update the academic year.");
  }

  return payload.academic_year as AcademicYear;
}
