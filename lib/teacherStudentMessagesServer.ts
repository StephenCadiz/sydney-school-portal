import { NextRequest } from "next/server";

import { supabaseAdmin } from "./supabaseAdmin";

export type StudentClassInfo = {
  studentId: string;
  name: string;
  classId: string;
  className: string;
  levelName: string;
  courseType: string;
};

type TeacherAuthenticationResult = {
  teacherId: string;
  error: { message: string; status: number } | null;
};

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function profileName(profile: any) {
  return `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    "Student";
}

function formatCourseType(value: unknown) {
  const courseType = String(value || "").trim();
  return courseType
    ? `${courseType.charAt(0).toUpperCase()}${courseType.slice(1)}`
    : "";
}

export function logTeacherStudentMessageFailure(stage: string, error: unknown) {
  console.error("Teacher student messages request failed:", { stage, error });
}

export async function authenticateTeacherMessageRequest(
  request: NextRequest
): Promise<TeacherAuthenticationResult> {
  const token = bearerToken(request);
  if (!token) {
    return {
      teacherId: "",
      error: { message: "Authentication required.", status: 401 },
    };
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    logTeacherStudentMessageFailure("authentication", authError);
    return {
      teacherId: "",
      error: { message: "Authentication required.", status: 401 },
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    logTeacherStudentMessageFailure("teacher-profile", profileError);
    return {
      teacherId: "",
      error: { message: "Unable to verify teacher access.", status: 500 },
    };
  }
  if (profile?.role !== "teacher") {
    return {
      teacherId: "",
      error: { message: "Teacher access required.", status: 403 },
    };
  }

  return { teacherId: authData.user.id, error: null };
}

export async function loadTeacherAuthorisedStudentClassInfo(
  teacherId: string,
  studentIds: string[]
): Promise<Map<string, StudentClassInfo>> {
  const uniqueStudentIds = Array.from(new Set(studentIds.filter(Boolean)));
  if (!uniqueStudentIds.length) return new Map();

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, role")
    .in("id", uniqueStudentIds)
    .eq("role", "student");
  if (profilesError) throw profilesError;

  const students = profiles || [];
  if (!students.length) return new Map();

  const eligibleStudentIds = students.map((student) => String(student.id));
  const { data: enrolments, error: enrolmentError } = await supabaseAdmin
    .from("class_enrolments")
    .select("student_id, class_id")
    .in("student_id", eligibleStudentIds);
  if (enrolmentError) throw enrolmentError;

  const classIds = Array.from(
    new Set(
      (enrolments || []).map((enrolment) => enrolment.class_id).filter(Boolean)
    )
  );
  if (!classIds.length) return new Map();

  const { data: classes, error: classesError } = await supabaseAdmin
    .from("classes")
    .select("id, class_name, level_id, course_type")
    .in("id", classIds)
    .eq("teacher_id", teacherId);
  if (classesError) throw classesError;

  const assignedClasses = classes || [];
  if (!assignedClasses.length) return new Map();

  const levelIds = Array.from(
    new Set(
      assignedClasses.map((classroom) => classroom.level_id).filter(Boolean)
    )
  );
  const { data: levels, error: levelsError } = levelIds.length
    ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };
  if (levelsError) throw levelsError;

  const studentById = new Map(
    students.map((student) => [String(student.id), student])
  );
  const classById = new Map(
    assignedClasses.map((classroom) => [String(classroom.id), classroom])
  );
  const levelNameById = new Map(
    (levels || []).map((level) => [String(level.id), String(level.name || "")])
  );
  const matchesByStudent = new Map<string, any[]>();

  for (const enrolment of enrolments || []) {
    const studentId = String(enrolment.student_id || "");
    const classroom = classById.get(String(enrolment.class_id || ""));
    if (!studentById.has(studentId) || !classroom) continue;
    matchesByStudent.set(studentId, [
      ...(matchesByStudent.get(studentId) || []),
      classroom,
    ]);
  }

  const infoByStudent = new Map<string, StudentClassInfo>();
  for (const [studentId, matchingClasses] of matchesByStudent) {
    const classroom = [...matchingClasses].sort((first, second) =>
      `${first.class_name || ""}:${first.id}`.localeCompare(
        `${second.class_name || ""}:${second.id}`
      )
    )[0];
    const student = studentById.get(studentId);
    if (!classroom || !student) continue;

    infoByStudent.set(studentId, {
      studentId,
      name: profileName(student),
      classId: String(classroom.id),
      className: String(classroom.class_name || "Class"),
      levelName: levelNameById.get(String(classroom.level_id)) || "Level not set",
      courseType: formatCourseType(classroom.course_type),
    });
  }

  return infoByStudent;
}

export async function getTeacherAuthorisedStudentUnreadCount(teacherId: string) {
  const { data: messages, error } = await supabaseAdmin
    .from("messages")
    .select("sender_id")
    .eq("receiver_id", teacherId)
    .is("recipient_group", null)
    .is("read_at", null)
    .is("recipient_deleted_at", null);
  if (error) throw error;

  const studentInfoById = await loadTeacherAuthorisedStudentClassInfo(
    teacherId,
    (messages || []).map((message) => String(message.sender_id || ""))
  );

  return (messages || []).filter((message) =>
    studentInfoById.has(String(message.sender_id || ""))
  ).length;
}
