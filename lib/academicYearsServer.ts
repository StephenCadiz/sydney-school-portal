import "server-only";

import {
  filterClassesForCurrentTeaching,
  getMadridDateString,
  resolveCurrentStudentClass,
  type AcademicYear,
} from "./academicYearRules";
import { supabaseAdmin } from "./supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validDateOnly(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  return (
    !Number.isNaN(date.valueOf()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isAcademicYearId(value: unknown) {
  return UUID_PATTERN.test(text(value));
}

export function validateAcademicYearDetails(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { value: null, error: "Invalid academic year details." };
  }

  const body = input as Record<string, unknown>;
  const label = text(body.label);
  const startDate = text(body.start_date);
  const endDate = text(body.end_date);

  if (!label) return { value: null, error: "Academic year label is required." };
  if (label.length > 80) {
    return { value: null, error: "Academic year label is too long." };
  }
  if (!validDateOnly(startDate) || !validDateOnly(endDate)) {
    return { value: null, error: "Choose valid start and end dates." };
  }
  if (endDate < startDate) {
    return { value: null, error: "End date must be on or after start date." };
  }

  return {
    value: { label, start_date: startDate, end_date: endDate },
    error: null,
  };
}

export async function getCurrentAcademicYearServer(): Promise<AcademicYear | null> {
  const { data, error } = await supabaseAdmin
    .from("academic_years")
    .select("id, label, start_date, end_date, status, created_at, updated_at")
    .eq("status", "current")
    .maybeSingle();

  if (error) throw error;
  return (data as AcademicYear | null) || null;
}

export async function getAcademicYearsWithClassCounts() {
  const { data: years, error: yearError } = await supabaseAdmin
    .from("academic_years")
    .select("id, label, start_date, end_date, status, created_at, updated_at")
    .order("start_date", { ascending: false });
  if (yearError) throw yearError;

  const { data: classes, error: classError } = await supabaseAdmin
    .from("classes")
    .select("academic_year_id")
    .not("academic_year_id", "is", null);
  if (classError) throw classError;

  const counts = new Map<string, number>();
  for (const classroom of classes || []) {
    const yearId = String(classroom.academic_year_id || "");
    if (yearId) counts.set(yearId, (counts.get(yearId) || 0) + 1);
  }

  return ((years || []) as AcademicYear[]).map((year) => ({
    ...year,
    class_count: counts.get(String(year.id)) || 0,
  }));
}

export async function resolveStudentCurrentClassServer(studentId: string) {
  const { data: enrolments, error: enrolmentError } = await supabaseAdmin
    .from("class_enrolments")
    .select("class_id")
    .eq("student_id", studentId);
  if (enrolmentError) throw enrolmentError;

  const classIds = Array.from(
    new Set(
      (enrolments || [])
        .map((enrolment) => String(enrolment.class_id || ""))
        .filter(Boolean)
    )
  );
  if (!classIds.length) {
    return resolveCurrentStudentClass([], null);
  }

  const [{ data: classes, error: classError }, currentAcademicYear] =
    await Promise.all([
      supabaseAdmin.from("classes").select("*").in("id", classIds),
      getCurrentAcademicYearServer(),
    ]);
  if (classError) throw classError;

  return resolveCurrentStudentClass(
    classes || [],
    currentAcademicYear?.id,
    getMadridDateString()
  );
}

export async function getTeacherCurrentClassesServer(teacherId: string) {
  const [{ data: classes, error }, currentAcademicYear] = await Promise.all([
    supabaseAdmin.from("classes").select("*").eq("teacher_id", teacherId),
    getCurrentAcademicYearServer(),
  ]);
  if (error) throw error;

  return {
    classes: filterClassesForCurrentTeaching(
      classes || [],
      currentAcademicYear?.id
    ),
    currentAcademicYear,
  };
}
