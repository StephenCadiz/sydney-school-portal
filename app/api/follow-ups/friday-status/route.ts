import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import {
  getFridayTutorialStatusFromRows,
  getTutorialGroupForLevel,
} from "../../../../lib/fridayTutorials";

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

async function verifyStaff(request: NextRequest) {
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
    console.error("Friday status auth failed:", formatError(userError));
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
    console.error("Friday status role lookup failed:", formatError(profileError));
    return {
      error: jsonError("Unable to verify user role.", 403),
    };
  }

  if (!["admin", "teacher"].includes(profile.role)) {
    return {
      error: jsonError("Only admins and teachers can view Friday status.", 403),
    };
  }

  return {
    user,
    role: profile.role,
  };
}

function getFollowUpStudentType(followUp: any) {
  return followUp.student_type ||
    (followUp.young_learner_id ? "young_learner" : "cambridge");
}

function getStudentIdentityKey(followUp: any) {
  const studentType = getFollowUpStudentType(followUp);
  const studentId =
    studentType === "young_learner"
      ? followUp.young_learner_id
      : followUp.student_id;

  return studentId ? `${studentType}:${studentId}` : "";
}

export async function POST(request: NextRequest) {
  try {
    const staffCheck = await verifyStaff(request);

    if ("error" in staffCheck) {
      return staffCheck.error;
    }

    const body = await request.json();
    const followUpDocumentIds = Array.from(
      new Set(
        (Array.isArray(body.follow_up_document_ids)
          ? body.follow_up_document_ids
          : []
        )
          .map((id: unknown) => String(id || "").trim())
          .filter(Boolean)
      )
    );

    if (followUpDocumentIds.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    const { data: followUps, error: followUpError } = await supabaseAdmin
      .from("follow_up_documents")
      .select(
        "id, category, student_type, student_id, young_learner_id, class_id, teacher_id"
      )
      .in("id", followUpDocumentIds);

    if (followUpError) {
      console.error("Friday status follow-up load failed:", formatError(followUpError));
      return jsonError("Unable to load follow-up documents.", 500);
    }

    if ((followUps || []).length !== followUpDocumentIds.length) {
      return jsonError("One or more follow-up documents could not be found.", 404);
    }

    const classIds = Array.from(
      new Set((followUps || []).map((item) => item.class_id).filter(Boolean))
    );

    const { data: classes, error: classError } =
      classIds.length > 0
        ? await supabaseAdmin
            .from("classes")
            .select("id, teacher_id, level_id")
            .in("id", classIds)
        : { data: [], error: null };

    if (classError) {
      console.error("Friday status class load failed:", formatError(classError));
      return jsonError("Unable to load follow-up classes.", 500);
    }

    const classMap = new Map((classes || []).map((item) => [item.id, item]));

    if (staffCheck.role === "teacher") {
      const hasUnauthorizedDocument = (followUps || []).some((followUp) => {
        const classRow = classMap.get(followUp.class_id);
        return classRow?.teacher_id !== staffCheck.user.id;
      });

      if (hasUnauthorizedDocument) {
        return jsonError("You can only view Friday status for your own classes.", 403);
      }
    }

    const levelIds = Array.from(
      new Set((classes || []).map((item) => item.level_id).filter(Boolean))
    );
    const { data: levels, error: levelError } =
      levelIds.length > 0
        ? await supabaseAdmin
            .from("levels")
            .select("id, name")
            .in("id", levelIds)
        : { data: [], error: null };

    if (levelError) {
      console.error("Friday status level load failed:", formatError(levelError));
      return jsonError("Unable to load follow-up levels.", 500);
    }

    const levelMap = new Map(
      (levels || []).map((item) => [String(item.id), item.name])
    );
    const profileStudentIds = Array.from(
      new Set(
        (followUps || [])
          .filter((item) => getFollowUpStudentType(item) === "cambridge")
          .map((item) => item.student_id)
          .filter(Boolean)
      )
    );
    const youngLearnerIds = Array.from(
      new Set(
        (followUps || [])
          .filter((item) => getFollowUpStudentType(item) === "young_learner")
          .map((item) => item.young_learner_id)
          .filter(Boolean)
      )
    );

    const tutorialRows: any[] = [];

    if (profileStudentIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("friday_tutorial_students")
        .select(
          "id, student_type, profile_student_id, young_learner_id, approval_status, active, approved_at, created_at, updated_at, tutorial_group"
        )
        .eq("student_type", "cambridge")
        .in("profile_student_id", profileStudentIds);

      if (error) {
        console.error("Friday status Cambridge rows failed:", formatError(error));
        return jsonError("Unable to load Friday Tutorial status.", 500);
      }

      tutorialRows.push(...(data || []));
    }

    if (youngLearnerIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("friday_tutorial_students")
        .select(
          "id, student_type, profile_student_id, young_learner_id, approval_status, active, approved_at, created_at, updated_at, tutorial_group"
        )
        .eq("student_type", "young_learner")
        .in("young_learner_id", youngLearnerIds);

      if (error) {
        console.error("Friday status Young Learner rows failed:", formatError(error));
        return jsonError("Unable to load Friday Tutorial status.", 500);
      }

      tutorialRows.push(...(data || []));
    }

    const tutorialRowsByIdentity = tutorialRows.reduce<Record<string, any[]>>(
      (groups, row) => {
        const studentType = row.student_type || "cambridge";
        const studentId =
          studentType === "young_learner"
            ? row.young_learner_id
            : row.profile_student_id;
        const key = studentId ? `${studentType}:${studentId}` : "";

        if (!key) {
          return groups;
        }

        return {
          ...groups,
          [key]: [...(groups[key] || []), row],
        };
      },
      {}
    );

    const statuses = (followUps || []).reduce<Record<string, any>>(
      (current, followUp) => {
        const classRow = classMap.get(followUp.class_id);
        const levelName = classRow?.level_id
          ? levelMap.get(String(classRow.level_id))
          : "";
        const studentType = getFollowUpStudentType(followUp);
        const tutorialGroup =
          followUp.category === "Academic"
            ? getTutorialGroupForLevel(levelName, studentType)
            : null;
        const identityKey = getStudentIdentityKey(followUp);
        const matchingRows = tutorialRowsByIdentity[identityKey] || [];

        current[followUp.id] = getFridayTutorialStatusFromRows(
          matchingRows,
          Boolean(tutorialGroup),
          tutorialGroup
        );

        return current;
      },
      {}
    );

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("Friday status route failed:", formatError(error));
    return jsonError("Unable to load Friday Tutorial status.", 500);
  }
}
