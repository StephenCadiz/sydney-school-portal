import "server-only";

import { NextRequest } from "next/server";
import { getMadridDateString } from "./academicYearRules";
import { sortClassesByGlobalOrder } from "./classOrdering";
import { resolveAuthenticatedProfile } from "./syllabusServer";
import { supabaseAdmin } from "./supabaseAdmin";

export type SchoolRosterStudent = {
  id: string;
  name: string;
  student_type: "profile" | "young_learner";
};

export type SchoolRosterClass = {
  id: string;
  programme: "Cambridge" | "Young Learner";
  level: string;
  level_name?: string;
  level_id: number | null;
  class_name: string;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  classroom: string;
  teacher: string;
  teacher_id: string | null;
  coordinator: string;
  students: SchoolRosterStudent[];
};

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function displayName(first: unknown, last: unknown, fallback: string) {
  return `${asText(first)} ${asText(last)}`.trim() || fallback;
}

function isDateBased(courseType: unknown) {
  const value = asText(courseType).toLowerCase();
  return value === "intensive" || value === "express";
}

function isActiveClass(classroom: any, today: string, currentAcademicYearId: string | null) {
  if (isDateBased(classroom.course_type)) {
    const start = asText(classroom.start_date);
    const end = asText(classroom.end_date);
    return !start || !end || (start <= today && today <= end);
  }
  return Boolean(currentAcademicYearId) && asText(classroom.academic_year_id) === currentAcademicYearId;
}

function isCurrentEnrolment(row: any, today: string) {
  return (
    row.active !== false &&
    asText(row.enrolled_at) <= today &&
    (!row.ends_before || today < asText(row.ends_before))
  );
}

function matches(value: unknown, query: string) {
  return asText(value).toLocaleLowerCase().includes(query);
}

function formatTeacher(row: any) {
  return displayName(row.first_name, row.last_name, "Teacher not assigned");
}

export async function authenticateSchoolRosterViewer(request: NextRequest) {
  const profile = await resolveAuthenticatedProfile(request);
  if (profile.error) {
    return { profile: null, error: { message: profile.error, status: profile.userId ? 500 : 401 } };
  }
  if (!["admin", "teacher"].includes(profile.role)) {
    return { profile: null, error: { message: "Roster access denied.", status: 403 } };
  }
  return { profile, error: null };
}

export async function loadSchoolRoster(viewer: { role: string; userId: string }): Promise<SchoolRosterClass[]> {
  const today = getMadridDateString();
  const [{ data: academicYear, error: academicYearError }, { data: classes, error: classesError }] =
    await Promise.all([
      supabaseAdmin.from("academic_years").select("id").eq("status", "current").maybeSingle(),
      supabaseAdmin
        .from("classes")
        .select("id, class_name, days, start_time, end_time, classroom_id, teacher_id, level_id, is_cambridge, course_type, start_date, end_date, academic_year_id, classrooms(id, name)")
        .order("class_name"),
    ]);
  if (academicYearError || classesError) throw academicYearError || classesError;

  const currentAcademicYearId = academicYear?.id ? String(academicYear.id) : null;
  // The endpoint is already restricted to Admins and authenticated Teachers.
  // Teachers may browse the whole active school roster, not only their own classes.
  const visibleClasses = (classes || []).filter((classroom) =>
    isActiveClass(classroom, today, currentAcademicYearId)
  );
  if (!visibleClasses.length) return [] as SchoolRosterClass[];

  const classIds = visibleClasses.map((classroom) => String(classroom.id));
  const levelIds = [...new Set(visibleClasses.map((classroom) => classroom.level_id).filter(Boolean))];
  const teacherIds = [...new Set(visibleClasses.map((classroom) => classroom.teacher_id).filter(Boolean))];
  const [{ data: levels, error: levelsError }, { data: teachers, error: teachersError }, { data: coordinators, error: coordinatorsError }, { data: profileRoster, error: profileRosterError }, { data: youngRoster, error: youngRosterError }] = await Promise.all([
    levelIds.length ? supabaseAdmin.from("levels").select("id, name").in("id", levelIds) : Promise.resolve({ data: [], error: null }),
    teacherIds.length ? supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", teacherIds) : Promise.resolve({ data: [], error: null }),
    levelIds.length ? supabaseAdmin.from("syllabus_coordinators").select("level_id, teacher_id").in("level_id", levelIds).is("revoked_at", null) : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from("class_roster_profiles").select("student_id, class_id, first_name, last_name, active, enrolled_at, ends_before").in("class_id", classIds),
    supabaseAdmin.from("class_roster_young_learners").select("id, class_id, first_name, last_name, active, enrolled_at, ends_before").in("class_id", classIds),
  ]);
  if (levelsError || teachersError || coordinatorsError || profileRosterError || youngRosterError) {
    throw levelsError || teachersError || coordinatorsError || profileRosterError || youngRosterError;
  }

  const levelById = new Map((levels || []).map((row: any) => [String(row.id), asText(row.name) || "Level"]));
  const teacherById = new Map((teachers || []).map((row: any) => [String(row.id), formatTeacher(row)]));
  const coordinatorByLevel = new Map<string, string[]>();
  const coordinatorIds = [...new Set((coordinators || []).map((row: any) => String(row.teacher_id)).filter(Boolean))];
  if (coordinatorIds.length) {
    const { data: coordinatorProfiles, error } = await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", coordinatorIds);
    if (error) throw error;
    const names = new Map((coordinatorProfiles || []).map((row: any) => [String(row.id), formatTeacher(row)]));
    for (const row of coordinators || []) {
      const levelCoordinators = coordinatorByLevel.get(String(row.level_id)) || [];
      const name = names.get(String(row.teacher_id)) || "Coordinator";
      if (!levelCoordinators.includes(name)) levelCoordinators.push(name);
      coordinatorByLevel.set(String(row.level_id), levelCoordinators);
    }
  }
  const studentsByClass = new Map<string, SchoolRosterStudent[]>();
  for (const row of profileRoster || []) {
    if (!isCurrentEnrolment(row, today)) continue;
    const key = String(row.class_id);
    const list = studentsByClass.get(key) || [];
    if (!list.some((student) => student.id === String(row.student_id))) {
      list.push({ id: String(row.student_id), name: displayName(row.first_name, row.last_name, "Student"), student_type: "profile" });
    }
    studentsByClass.set(key, list);
  }
  for (const row of youngRoster || []) {
    if (!isCurrentEnrolment(row, today)) continue;
    const key = String(row.class_id);
    const list = studentsByClass.get(key) || [];
    if (!list.some((student) => student.id === String(row.id) && student.student_type === "young_learner")) {
      list.push({ id: String(row.id), name: displayName(row.first_name, row.last_name, "Student"), student_type: "young_learner" });
    }
    studentsByClass.set(key, list);
  }

  const rosterRows = visibleClasses.map((classroom: any): SchoolRosterClass => ({
    id: String(classroom.id),
    programme: classroom.is_cambridge === true ? "Cambridge" : "Young Learner",
    level: levelById.get(String(classroom.level_id)) || "Level",
    level_name: levelById.get(String(classroom.level_id)) || "Level",
    level_id: classroom.level_id == null ? null : Number(classroom.level_id),
    class_name: asText(classroom.class_name) || "Class",
    days: classroom.days || null,
    start_time: classroom.start_time || null,
    end_time: classroom.end_time || null,
    classroom: classroom.classrooms?.name || (asText(classroom.course_type).toLowerCase() === "online" ? "Online" : "Classroom not assigned"),
    teacher: teacherById.get(String(classroom.teacher_id)) || "Teacher not assigned",
    teacher_id: classroom.teacher_id ? String(classroom.teacher_id) : null,
    coordinator: coordinatorByLevel.get(String(classroom.level_id))?.join(", ") || "Coordinator not assigned",
    students: (studentsByClass.get(String(classroom.id)) || []).sort((a, b) => a.name.localeCompare(b.name)),
  }));
  return sortClassesByGlobalOrder(rosterRows);
}

export function filterSchoolRoster(rows: SchoolRosterClass[], params: URLSearchParams) {
  const query = asText(params.get("q")).toLocaleLowerCase();
  const programme = asText(params.get("programme")).toLocaleLowerCase();
  const level = asText(params.get("level")).toLocaleLowerCase();
  const teacher = asText(params.get("teacher")).toLocaleLowerCase();
  const classroom = asText(params.get("class")).toLocaleLowerCase();
  const day = asText(params.get("day")).toLocaleLowerCase();
  return rows.map((row) => {
    const students = query ? row.students.filter((student) => matches(student.name, query)) : row.students;
    return { ...row, students };
  }).filter((row) =>
    (!query || row.students.length > 0) &&
    (!programme || row.programme.toLocaleLowerCase() === programme) &&
    (!level || matches(row.level, level)) &&
    (!teacher || matches(row.teacher, teacher)) &&
    (!classroom || matches(row.class_name, classroom)) &&
    (!day || matches(row.days, day))
  );
}
