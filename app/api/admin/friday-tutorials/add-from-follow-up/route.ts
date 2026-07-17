import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  getFridayTutorialStatusFromRows,
  getTutorialGroupForLevel,
} from "../../../../../lib/fridayTutorials";

function formatError(error: unknown) {
  if (!error) {
    return "Unknown error.";
  }

  if (typeof error === "object") {
    const errorObject = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [
      errorObject.message ? `Message: ${String(errorObject.message)}` : "",
      errorObject.details ? `Details: ${String(errorObject.details)}` : "",
      errorObject.hint ? `Hint: ${String(errorObject.hint)}` : "",
      errorObject.code ? `Code: ${String(errorObject.code)}` : "",
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  const fallback = String(error);
  return fallback && fallback !== "[object Object]" ? fallback : "Unknown error.";
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function verifyAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.replace("Bearer ", "")
    : "";

  if (!token) {
    return {
      error: jsonError("Missing authorization token.", 401),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    console.error("Friday add auth failed:", formatError(userError));
    return {
      error: jsonError("Invalid authorization token.", 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("Friday add role lookup failed:", formatError(profileError));
    return {
      error: jsonError("Unable to verify admin user.", 403),
    };
  }

  if (profile.role !== "admin") {
    return {
      error: jsonError("Only admins can add students to Friday Tutorials.", 403),
    };
  }

  return { user };
}

function getFollowUpStudentType(followUp: any) {
  return followUp.student_type ||
    (followUp.young_learner_id ? "young_learner" : "cambridge");
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(request);

    if ("error" in adminCheck) {
      return adminCheck.error;
    }

    const body = await request.json();
    const followUpDocumentId = String(body.follow_up_document_id || "").trim();

    if (!followUpDocumentId) {
      return jsonError("Follow-up document id is required.", 400);
    }

    const { data: followUp, error: followUpError } = await supabaseAdmin
      .from("follow_up_documents")
      .select(
        "id, category, student_type, student_id, young_learner_id, class_id, teacher_id"
      )
      .eq("id", followUpDocumentId)
      .single();

    if (followUpError || !followUp) {
      console.error("Friday add follow-up load failed:", formatError(followUpError));
      return jsonError("Follow-up document could not be found.", 404);
    }

    if (followUp.category !== "Academic") {
      return jsonError("Only Academic follow-ups can be added to Friday Tutorials.", 400);
    }

    const studentType = getFollowUpStudentType(followUp);
    const isYoungLearner = studentType === "young_learner";
    const profileStudentId = isYoungLearner ? null : followUp.student_id;
    const youngLearnerId = isYoungLearner ? followUp.young_learner_id : null;

    if (
      (studentType === "cambridge" && !profileStudentId) ||
      (studentType === "young_learner" && !youngLearnerId)
    ) {
      return jsonError("This follow-up is missing a valid student reference.", 400);
    }

    if (!followUp.class_id) {
      return jsonError("This follow-up is missing a class reference.", 400);
    }

    const { data: classRow, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id, teacher_id, level_id")
      .eq("id", followUp.class_id)
      .single();

    if (classError || !classRow) {
      console.error("Friday add class load failed:", formatError(classError));
      return jsonError("Unable to load the follow-up class.", 500);
    }

    const { data: level, error: levelError } = await supabaseAdmin
      .from("levels")
      .select("name")
      .eq("id", classRow.level_id)
      .single();

    if (levelError || !level?.name) {
      console.error("Friday add level load failed:", formatError(levelError));
      return jsonError("Unable to load the follow-up level.", 500);
    }

    const tutorialGroup = getTutorialGroupForLevel(level.name, studentType);

    if (!tutorialGroup) {
      return jsonError("This student is not eligible for Friday Tutorials.", 400);
    }

    const duplicateQuery = supabaseAdmin
      .from("friday_tutorial_students")
      .select(
        "id, student_type, profile_student_id, young_learner_id, follow_up_document_id, approval_status, active, approved_at, created_at, updated_at, tutorial_group"
      )
      .eq("student_type", studentType);

    const { data: existingRows, error: existingError } = isYoungLearner
      ? await duplicateQuery.eq("young_learner_id", youngLearnerId)
      : await duplicateQuery.eq("profile_student_id", profileStudentId);

    if (existingError) {
      console.error("Friday add duplicate lookup failed:", formatError(existingError));
      return jsonError("Unable to check the existing Friday list.", 500);
    }

    if ((existingRows || []).length > 1) {
      return NextResponse.json(
        {
          error:
            "More than one Friday Tutorial record exists for this student. Please review the Friday Tutorials list before continuing.",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const existingRow = (existingRows || [])[0];

    if (existingRow?.approval_status === "approved" && existingRow.active === true) {
      return NextResponse.json({
        success: true,
        action: "already_added",
        message: "This student is already on the Friday Tutorial list.",
        status: getFridayTutorialStatusFromRows(
          [existingRow],
          true,
          tutorialGroup
        ),
      });
    }

    if (!existingRow) {
      const { data: insertedRow, error: insertError } = await supabaseAdmin
        .from("friday_tutorial_students")
        .insert([
          {
            student_type: studentType,
            profile_student_id: profileStudentId,
            young_learner_id: youngLearnerId,
            class_id: followUp.class_id,
            teacher_id: followUp.teacher_id || classRow.teacher_id,
            follow_up_document_id: followUp.id,
            tutorial_group: tutorialGroup,
            approval_status: "approved",
            whatsapp_sent: false,
            parent_confirmed: false,
            active: true,
            approved_at: now,
          },
        ])
        .select(
          "id, student_type, profile_student_id, young_learner_id, approval_status, active, approved_at, created_at, updated_at, tutorial_group"
        )
        .single();

      if (insertError || !insertedRow) {
        console.error("Friday add insert failed:", formatError(insertError));
        return jsonError("Unable to add student to Friday Tutorials.", 500);
      }

      return NextResponse.json({
        success: true,
        action: "added",
        message: "Student added to the Friday Tutorial list.",
        status: getFridayTutorialStatusFromRows(
          [insertedRow],
          true,
          tutorialGroup
        ),
      });
    }

    const wasRemoved =
      existingRow.approval_status === "removed" || existingRow.active === false;
    const updatePayload: Record<string, any> = {
      approval_status: "approved",
      active: true,
      approved_at: now,
      updated_at: now,
      class_id: followUp.class_id,
      teacher_id: followUp.teacher_id || classRow.teacher_id,
      tutorial_group: tutorialGroup,
    };

    if (!existingRow.follow_up_document_id) {
      updatePayload.follow_up_document_id = followUp.id;
    }

    const { data: updatedRow, error: updateError } = await supabaseAdmin
      .from("friday_tutorial_students")
      .update(updatePayload)
      .eq("id", existingRow.id)
      .select(
        "id, student_type, profile_student_id, young_learner_id, approval_status, active, approved_at, created_at, updated_at, tutorial_group"
      )
      .single();

    if (updateError || !updatedRow) {
      console.error("Friday add update failed:", formatError(updateError));
      return jsonError("Unable to update the Friday Tutorial list.", 500);
    }

    return NextResponse.json({
      success: true,
      action: wasRemoved ? "readded" : "approved",
      message: wasRemoved
        ? "Student re-added to the Friday Tutorial list."
        : "Student added to the Friday Tutorial list.",
      status: getFridayTutorialStatusFromRows(
        [updatedRow],
        true,
        tutorialGroup
      ),
    });
  } catch (error) {
    console.error("Friday add route failed:", formatError(error));
    return jsonError("Unable to add student to Friday Tutorials.", 500);
  }
}
