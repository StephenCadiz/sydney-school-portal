import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "./supabaseAdmin";
import {
  classCanReceiveSyllabus,
  isSyllabusCourseTypeEligible,
  isSyllabusUuid,
} from "./syllabusValidation";

export const SYLLABUS_STORAGE_BUCKET = "teacher-resources";
export const SYLLABUS_SIGNED_URL_SECONDS = 120;

export const SYLLABUS_SELECT = `
  id,
  academic_year_id,
  level_id,
  title,
  status,
  created_by,
  updated_by,
  published_by,
  published_at,
  created_at,
  updated_at,
  academic_year:academic_years!syllabuses_academic_year_id_fkey (
    id,
    label,
    start_date,
    end_date,
    status
  ),
  level:levels!syllabuses_level_id_fkey (
    id,
    name
  ),
  units:syllabus_units!syllabus_units_syllabus_id_fkey (
    id,
    syllabus_id,
    title,
    pages_text,
    content_text,
    target_completion_date,
    exam_week_start_date,
    exam_week_end_date,
    exam_information,
    sort_order,
    created_at,
    updated_at,
    materials:syllabus_unit_materials!syllabus_unit_materials_unit_id_fkey (
      id,
      unit_id,
      material_type,
      label,
      description,
      external_url,
      storage_path,
      original_filename,
      mime_type,
      file_size,
      sort_order,
      created_at,
      updated_at
    )
  )
`;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function relation(value: unknown) {
  return record(Array.isArray(value) ? value[0] : value);
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function formatError(error: unknown) {
  const value = record(error);
  return [value.message, value.details, value.hint, value.code]
    .filter(Boolean)
    .map(String)
    .join(" | ") || String(error || "Unknown error");
}

export function syllabusJsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function authenticatedProfile(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return { userId: "", role: "", error: "Authentication required." };

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return { userId: "", role: "", error: "Authentication required." };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Syllabus profile lookup failed:", formatError(profileError));
    return {
      userId: authData.user.id,
      role: "",
      error: "Unable to verify account access.",
    };
  }

  return {
    userId: authData.user.id,
    role: String(profile?.role || "").trim().toLowerCase(),
    error: "",
  };
}

export async function requireSyllabusAdmin(request: NextRequest) {
  const profile = await authenticatedProfile(request);
  if (profile.error) {
    return {
      userId: "",
      response: syllabusJsonError(
        profile.error,
        profile.userId ? 500 : 401
      ),
    };
  }
  if (profile.role !== "admin") {
    return {
      userId: "",
      response: syllabusJsonError("Admin access required.", 403),
    };
  }
  return { userId: profile.userId, response: null };
}

export type TeacherSyllabusClassContext = {
  userId: string;
  classId: string;
  academicYearId: string;
  levelId: number;
  courseType: string;
};

export async function requireTeacherSyllabusClass(
  request: NextRequest,
  classId: string
): Promise<
  | { context: TeacherSyllabusClassContext; response: null }
  | { context: null; response: NextResponse }
> {
  if (!isSyllabusUuid(classId)) {
    return {
      context: null,
      response: syllabusJsonError("Choose a valid class.", 400),
    };
  }

  const profile = await authenticatedProfile(request);
  if (profile.error) {
    return {
      context: null,
      response: syllabusJsonError(
        profile.error,
        profile.userId ? 500 : 401
      ),
    };
  }
  if (profile.role !== "teacher") {
    return {
      context: null,
      response: syllabusJsonError("Teacher access required.", 403),
    };
  }

  const { data: classroom, error } = await supabaseAdmin
    .from("classes")
    .select("id, teacher_id, academic_year_id, level_id, course_type")
    .eq("id", classId)
    .maybeSingle();
  if (error) {
    console.error("Teacher syllabus class lookup failed:", formatError(error));
    return {
      context: null,
      response: syllabusJsonError("Unable to verify class access.", 500),
    };
  }
  if (!classroom) {
    return {
      context: null,
      response: syllabusJsonError("Class was not found.", 404),
    };
  }
  if (String(classroom.teacher_id || "") !== profile.userId) {
    return {
      context: null,
      response: syllabusJsonError(
        "You can only view the syllabus for your assigned classes.",
        403
      ),
    };
  }
  if (!isSyllabusCourseTypeEligible(classroom.course_type)) {
    return {
      context: null,
      response: syllabusJsonError(
        "Syllabuses are not available for this course type.",
        403
      ),
    };
  }
  if (
    !classCanReceiveSyllabus({
      academicYearId: classroom.academic_year_id,
      levelId: classroom.level_id,
      courseType: classroom.course_type,
    })
  ) {
    return {
      context: null,
      response: syllabusJsonError(
        "This class does not have a valid academic year and level.",
        409
      ),
    };
  }

  return {
    context: {
      userId: profile.userId,
      classId: String(classroom.id),
      academicYearId: String(classroom.academic_year_id),
      levelId: Number(classroom.level_id),
      courseType: String(classroom.course_type || "").trim().toLowerCase(),
    },
    response: null,
  };
}

export function serializeSyllabus(rowValue: unknown, teacherView = false) {
  const row = record(rowValue);
  const academicYear = relation(row.academic_year);
  const level = relation(row.level);
  const units = recordList(row.units)
    .sort(
      (first, second) =>
        Number(first.sort_order || 0) - Number(second.sort_order || 0) ||
        String(first.id || "").localeCompare(String(second.id || ""))
    )
    .map((unit) => ({
      id: String(unit.id || ""),
      syllabus_id: String(unit.syllabus_id || ""),
      title: String(unit.title || ""),
      pages_text: String(unit.pages_text || ""),
      content_text: String(unit.content_text || ""),
      target_completion_date: String(unit.target_completion_date || ""),
      exam_week_start_date: unit.exam_week_start_date
        ? String(unit.exam_week_start_date)
        : null,
      exam_week_end_date: unit.exam_week_end_date
        ? String(unit.exam_week_end_date)
        : null,
      exam_information: String(unit.exam_information || ""),
      sort_order: Number(unit.sort_order || 0),
      created_at: String(unit.created_at || ""),
      updated_at: String(unit.updated_at || ""),
      materials: recordList(unit.materials)
        .sort(
          (first, second) =>
            Number(first.sort_order || 0) - Number(second.sort_order || 0) ||
            String(first.id || "").localeCompare(String(second.id || ""))
        )
        .map((material) => ({
          id: String(material.id || ""),
          unit_id: String(material.unit_id || ""),
          material_type: String(material.material_type || ""),
          label: String(material.label || ""),
          description: String(material.description || ""),
          external_url: material.external_url
            ? String(material.external_url)
            : null,
          ...(teacherView
            ? { has_private_file: Boolean(material.storage_path) }
            : {
                storage_path: material.storage_path
                  ? String(material.storage_path)
                  : null,
              }),
          original_filename: material.original_filename
            ? String(material.original_filename)
            : null,
          mime_type: material.mime_type ? String(material.mime_type) : null,
          file_size:
            material.file_size === null || material.file_size === undefined
              ? null
              : Number(material.file_size),
          sort_order: Number(material.sort_order || 0),
          created_at: String(material.created_at || ""),
          updated_at: String(material.updated_at || ""),
        })),
    }));

  return {
    id: String(row.id || ""),
    academic_year_id: String(row.academic_year_id || ""),
    level_id: Number(row.level_id || 0),
    title: String(row.title || ""),
    status: String(row.status || "draft"),
    ...(teacherView
      ? {}
      : {
          created_by: String(row.created_by || ""),
          updated_by: String(row.updated_by || ""),
          published_by: row.published_by ? String(row.published_by) : null,
        }),
    published_at: row.published_at ? String(row.published_at) : null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
    academic_year: {
      id: String(academicYear.id || row.academic_year_id || ""),
      label: String(academicYear.label || ""),
      start_date: String(academicYear.start_date || ""),
      end_date: String(academicYear.end_date || ""),
      status: String(academicYear.status || ""),
    },
    level: {
      id: Number(level.id || row.level_id || 0),
      name: String(level.name || ""),
    },
    units,
  };
}

export async function loadSyllabusById(id: string, teacherView = false) {
  const { data, error } = await supabaseAdmin
    .from("syllabuses")
    .select(SYLLABUS_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? serializeSyllabus(data, teacherView) : null;
}

export function logSyllabusFailure(stage: string, error: unknown) {
  console.error("Syllabus request failed:", { stage, error: formatError(error) });
}
