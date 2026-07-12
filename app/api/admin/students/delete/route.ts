import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

type StudentType = "cambridge" | "young_learner";

function formatError(error: any) {
  if (!error) {
    return "Unknown error.";
  }

  const parts = [
    error.message ? `Message: ${error.message}` : "",
    error.details ? `Details: ${error.details}` : "",
    error.hint ? `Hint: ${error.hint}` : "",
    error.code ? `Code: ${error.code}` : "",
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join("\n");
  }

  try {
    const serialized = JSON.stringify(error);

    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    // Fall back below.
  }

  const fallback = String(error);
  return fallback === "[object Object]"
    ? "Unknown error object received from Supabase/Auth."
    : fallback;
}

function jsonError(message: string, status: number, details?: string) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    {
      status,
    }
  );
}

function normalizeStudentType(value: unknown): StudentType | null {
  if (!value) {
    return "cambridge";
  }

  if (value === "cambridge" || value === "young_learner") {
    return value;
  }

  return null;
}

function isAuthUserNotFoundError(error: any) {
  const text = [
    error?.message,
    error?.name,
    error?.status,
    error?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return error?.status === 404 || text.includes("not found");
}

async function deleteWhere(table: string, column: string, value: string) {
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq(column, value);

  if (error) {
    throw new Error(`${table} delete failed.\n${formatError(error)}`);
  }
}

async function deleteIn(table: string, column: string, values: string[]) {
  if (values.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .in(column, values);

  if (error) {
    throw new Error(`${table} delete failed.\n${formatError(error)}`);
  }
}

async function deleteMessagesForStudent(studentId: string) {
  const { error } = await supabaseAdmin
    .from("messages")
    .delete()
    .or(`sender_id.eq.${studentId},receiver_id.eq.${studentId}`);

  if (error) {
    throw new Error(`messages delete failed.\n${formatError(error)}`);
  }
}

async function getFollowUpDocumentIds(
  studentType: StudentType,
  studentId: string
) {
  let query: any = supabaseAdmin
    .from("follow_up_documents")
    .select("id")
    .eq("student_type", studentType);

  query =
    studentType === "young_learner"
      ? query.eq("young_learner_id", studentId)
      : query.eq("student_id", studentId);

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `follow_up_documents lookup failed.\n${formatError(error)}`
    );
  }

  return (data || []).map((row: any) => row.id).filter(Boolean);
}

async function deleteFollowUps(studentType: StudentType, studentId: string) {
  const followUpIds = await getFollowUpDocumentIds(studentType, studentId);

  await deleteIn("follow_up_entries", "follow_up_document_id", followUpIds);

  let query: any = supabaseAdmin
    .from("follow_up_documents")
    .delete()
    .eq("student_type", studentType);

  query =
    studentType === "young_learner"
      ? query.eq("young_learner_id", studentId)
      : query.eq("student_id", studentId);

  const { error } = await query;

  if (error) {
    throw new Error(`follow_up_documents delete failed.\n${formatError(error)}`);
  }
}

async function getFridayTutorialStudentIds(
  studentType: StudentType,
  studentId: string
) {
  let query: any = supabaseAdmin
    .from("friday_tutorial_students")
    .select("id")
    .eq("student_type", studentType);

  query =
    studentType === "young_learner"
      ? query.eq("young_learner_id", studentId)
      : query.eq("profile_student_id", studentId);

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `friday_tutorial_students lookup failed.\n${formatError(error)}`
    );
  }

  return (data || []).map((row: any) => row.id).filter(Boolean);
}

async function deleteFridayTutorials(
  studentType: StudentType,
  studentId: string
) {
  const tutorialStudentIds = await getFridayTutorialStudentIds(
    studentType,
    studentId
  );

  await deleteIn(
    "friday_tutorial_session_students",
    "tutorial_student_id",
    tutorialStudentIds
  );

  let query: any = supabaseAdmin
    .from("friday_tutorial_students")
    .delete()
    .eq("student_type", studentType);

  query =
    studentType === "young_learner"
      ? query.eq("young_learner_id", studentId)
      : query.eq("profile_student_id", studentId);

  const { error } = await query;

  if (error) {
    throw new Error(
      `friday_tutorial_students delete failed.\n${formatError(error)}`
    );
  }
}

async function verifyAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.replace("Bearer ", "")
    : "";

  if (!token) {
    return jsonError("Missing authorization token.", 401);
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    console.error("Delete student auth verification failed:", userError);
    return jsonError(
      "Invalid authorization token.",
      401,
      formatError(userError)
    );
  }

  const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (adminProfileError) {
    console.error("Delete student admin profile lookup failed:", adminProfileError);
    return jsonError(
      "Unable to verify admin user.",
      500,
      formatError(adminProfileError)
    );
  }

  if (adminProfile?.role !== "admin") {
    return jsonError("Only admins can delete students.", 403);
  }

  return null;
}

async function deleteCambridgeStudent(studentId: string) {
  const { data: studentProfile, error: studentProfileError } =
    await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", studentId)
      .single();

  if (studentProfileError || !studentProfile) {
    console.error("Cambridge student profile lookup failed:", studentProfileError);
    return jsonError(
      "Student profile not found.",
      404,
      formatError(studentProfileError)
    );
  }

  if (studentProfile.role !== "student") {
    return jsonError("The selected profile is not a student.", 400);
  }

  await deleteFollowUps("cambridge", studentId);
  await deleteFridayTutorials("cambridge", studentId);
  await deleteMessagesForStudent(studentId);
  await deleteWhere("results", "student_id", studentId);
  await deleteWhere("teacher_notes", "student_id", studentId);
  await deleteWhere("student_homework_reads", "student_id", studentId);
  await deleteWhere("announcement_reads", "user_id", studentId);
  await deleteWhere("class_enrolments", "student_id", studentId);

  const { error: authDeleteError } =
    await supabaseAdmin.auth.admin.deleteUser(studentId);

  if (authDeleteError && !isAuthUserNotFoundError(authDeleteError)) {
    console.error("Cambridge student auth delete failed:", authDeleteError);
    return jsonError(
      "Unable to delete student login account.",
      500,
      formatError(authDeleteError)
    );
  }

  if (authDeleteError) {
    console.warn(
      "Cambridge student auth user was already missing:",
      formatError(authDeleteError)
    );
  }

  const { error: profileDeleteError } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", studentId)
    .eq("role", "student");

  if (profileDeleteError) {
    console.error("Cambridge student profile delete failed:", profileDeleteError);
    return jsonError(
      "Student related data was deleted, but profile deletion failed.",
      500,
      formatError(profileDeleteError)
    );
  }

  return NextResponse.json({
    success: true,
    message: "Cambridge student and related data deleted successfully.",
  });
}

async function deleteYoungLearner(studentId: string) {
  const { data: youngLearner, error: youngLearnerError } = await supabaseAdmin
    .from("young_learners")
    .select("id")
    .eq("id", studentId)
    .single();

  if (youngLearnerError || !youngLearner) {
    console.error("Young Learner lookup failed:", youngLearnerError);
    return jsonError(
      "Young Learner not found.",
      404,
      formatError(youngLearnerError)
    );
  }

  await deleteFollowUps("young_learner", studentId);
  await deleteFridayTutorials("young_learner", studentId);
  await deleteWhere("unit_exam_results", "young_learner_id", studentId);

  const { error: youngLearnerDeleteError } = await supabaseAdmin
    .from("young_learners")
    .delete()
    .eq("id", studentId);

  if (youngLearnerDeleteError) {
    console.error("Young Learner delete failed:", youngLearnerDeleteError);
    return jsonError(
      "Unable to delete Young Learner.",
      500,
      formatError(youngLearnerDeleteError)
    );
  }

  return NextResponse.json({
    success: true,
    message: "Young Learner and related data deleted successfully.",
  });
}

export async function POST(request: NextRequest) {
  try {
    const adminError = await verifyAdmin(request);

    if (adminError) {
      return adminError;
    }

    const body = await request.json();
    const studentId = body.student_id;
    const studentType = normalizeStudentType(body.student_type);

    if (!studentId) {
      return jsonError("student_id is required.", 400);
    }

    if (!studentType) {
      return jsonError("student_type must be cambridge or young_learner.", 400);
    }

    if (studentType === "young_learner") {
      return await deleteYoungLearner(studentId);
    }

    return await deleteCambridgeStudent(studentId);
  } catch (error: any) {
    const details = formatError(error);
    console.error("Delete student route failed:", details);
    return jsonError("Unable to delete student.", 500, details);
  }
}
