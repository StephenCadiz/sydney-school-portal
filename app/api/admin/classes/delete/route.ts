import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

type ClassDeleteBlockers = {
  students: number;
  young_learners: number;
  results: number;
  announcements: number;
  resources: number;
  teacher_notes: number;
  follow_ups: number;
  friday_tutorial_records: number;
  unit_exam_results: number;
};

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
    ? "Unknown error object received from Supabase."
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

async function countLinkedRows(
  table: string,
  column: string,
  classId: string
) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select(column, {
      count: "exact",
      head: true,
    })
    .eq(column, classId);

  if (error) {
    throw new Error(`${table} lookup failed.\n${formatError(error)}`);
  }

  return count || 0;
}

async function cleanOrphanEnrolments(classId: string) {
  const { data: enrolments, error: enrolmentsError } = await supabaseAdmin
    .from("class_enrolments")
    .select("student_id")
    .eq("class_id", classId);

  if (enrolmentsError) {
    throw new Error(
      `class_enrolments lookup failed.\n${formatError(enrolmentsError)}`
    );
  }

  const studentIds = Array.from(
    new Set((enrolments || []).map((row: any) => row.student_id).filter(Boolean))
  );

  if (studentIds.length === 0) {
    return {
      realStudentEnrolments: 0,
      orphanEnrolmentsRemoved: 0,
    };
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "student")
    .in("id", studentIds);

  if (profilesError) {
    throw new Error(`profiles lookup failed.\n${formatError(profilesError)}`);
  }

  const existingStudentIds = new Set((profiles || []).map((row: any) => row.id));
  const orphanStudentIds = studentIds.filter(
    (studentId) => !existingStudentIds.has(studentId)
  );

  if (orphanStudentIds.length > 0) {
    const { error: orphanDeleteError } = await supabaseAdmin
      .from("class_enrolments")
      .delete()
      .eq("class_id", classId)
      .in("student_id", orphanStudentIds);

    if (orphanDeleteError) {
      throw new Error(
        `orphan class_enrolments cleanup failed.\n${formatError(
          orphanDeleteError
        )}`
      );
    }
  }

  return {
    realStudentEnrolments: (enrolments || []).filter((row: any) =>
      existingStudentIds.has(row.student_id)
    ).length,
    orphanEnrolmentsRemoved: (enrolments || []).filter((row: any) =>
      orphanStudentIds.includes(row.student_id)
    ).length,
  };
}

function hasBlockers(blockers: ClassDeleteBlockers) {
  return Object.values(blockers).some((count) => count > 0);
}

export async function POST(request: NextRequest) {
  try {
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
      return jsonError("Invalid authorization token.", 401);
    }

    const { data: adminProfile, error: adminProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (adminProfileError) {
      console.error("Admin profile lookup failed:", adminProfileError);
      return jsonError(
        "Unable to verify admin user.",
        500,
        formatError(adminProfileError)
      );
    }

    if (adminProfile?.role !== "admin") {
      return jsonError("Only admins can delete classes.", 403);
    }

    const body = await request.json();
    const classId = body.class_id;

    if (!classId) {
      return jsonError("class_id is required.", 400);
    }

    const { data: classRecord, error: classLookupError } = await supabaseAdmin
      .from("classes")
      .select("id")
      .eq("id", classId)
      .single();

    if (classLookupError || !classRecord) {
      console.error("Class lookup failed:", classLookupError);
      return jsonError("Class not found.", 404, formatError(classLookupError));
    }

    const { realStudentEnrolments, orphanEnrolmentsRemoved } =
      await cleanOrphanEnrolments(classId);

    const blockers: ClassDeleteBlockers = {
      students: realStudentEnrolments,
      young_learners: await countLinkedRows(
        "young_learners",
        "class_id",
        classId
      ),
      results: await countLinkedRows("results", "class_id", classId),
      announcements: await countLinkedRows(
        "announcements",
        "classes_id",
        classId
      ),
      resources: await countLinkedRows("resources", "class_id", classId),
      teacher_notes: await countLinkedRows("teacher_notes", "class_id", classId),
      follow_ups: await countLinkedRows(
        "follow_up_documents",
        "class_id",
        classId
      ),
      friday_tutorial_records: await countLinkedRows(
        "friday_tutorial_students",
        "class_id",
        classId
      ),
      unit_exam_results: await countLinkedRows(
        "unit_exam_results",
        "class_id",
        classId
      ),
    };

    if (hasBlockers(blockers)) {
      const message =
        "Cannot delete this class because it still has linked data.";

      return NextResponse.json(
        {
          success: false,
          error: message,
          message,
          blockers,
          orphan_enrolments_removed: orphanEnrolmentsRemoved,
        },
        {
          status: 400,
        }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("classes")
      .delete()
      .eq("id", classId);

    if (deleteError) {
      console.error("Class delete failed:", deleteError);
      return jsonError("Unable to delete class.", 500, formatError(deleteError));
    }

    return NextResponse.json({
      success: true,
      message: "Class deleted successfully.",
      orphan_enrolments_removed: orphanEnrolmentsRemoved,
    });
  } catch (error: any) {
    const details = formatError(error);
    console.error("Delete class route failed:", details);
    return jsonError("Unable to delete class.", 500, details);
  }
}
