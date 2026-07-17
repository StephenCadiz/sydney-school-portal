import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  getTutorialGroupForLevel,
  isFridayTutorialSessionRemovable,
  removeFutureFridayTutorialSessionMemberships,
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

function isForeignKeyReferenceError(error: any) {
  const text = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return error?.code === "23503" || text.includes("foreign key");
}

function getDateOnly(value: string | null | undefined) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function getTimeMinutes(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function isSessionAfter(anchorSession: any, candidateSession: any) {
  const anchorDate = getDateOnly(anchorSession?.session_date);
  const candidateDate = getDateOnly(candidateSession?.session_date);

  if (!anchorDate || !candidateDate) {
    return false;
  }

  if (candidateDate > anchorDate) {
    return true;
  }

  if (candidateDate < anchorDate) {
    return false;
  }

  const anchorStart = getTimeMinutes(anchorSession?.start_time);
  const candidateStart = getTimeMinutes(candidateSession?.start_time);

  if (anchorStart === null || candidateStart === null) {
    return false;
  }

  return candidateStart > anchorStart;
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
    console.error("Friday delete auth failed:", formatError(userError));
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
    console.error("Friday delete role lookup failed:", formatError(profileError));
    return {
      error: jsonError("Unable to verify admin user.", 403),
    };
  }

  if (profile.role !== "admin") {
    return {
      error: jsonError("Only admins can remove Friday Tutorial students.", 403),
    };
  }

  return { user };
}

function getStudentIdentity(row: any) {
  const studentType = row?.student_type || "cambridge";

  if (studentType === "young_learner") {
    return {
      studentType,
      studentId: row.young_learner_id,
      followUpColumn: "young_learner_id",
      fridayColumn: "young_learner_id",
    };
  }

  return {
    studentType: "cambridge",
    studentId: row?.profile_student_id,
    followUpColumn: "student_id",
    fridayColumn: "profile_student_id",
  };
}

function buildStudentRowFromSessionStudent(sessionStudent: any, session: any) {
  const studentType =
    sessionStudent?.student_type ||
    (sessionStudent?.young_learner_id ? "young_learner" : "cambridge");

  return {
    id: null,
    student_type: studentType,
    profile_student_id:
      studentType === "young_learner" ? null : sessionStudent?.profile_student_id,
    young_learner_id:
      studentType === "young_learner" ? sessionStudent?.young_learner_id : null,
    class_id: sessionStudent?.class_id || null,
    teacher_id: sessionStudent?.teacher_id || null,
    follow_up_document_id: sessionStudent?.follow_up_document_id || null,
    tutorial_group:
      sessionStudent?.tutorial_group || session?.tutorial_group || null,
  };
}

async function getNewestAcademicFollowUp(fridayStudent: any) {
  const identity = getStudentIdentity(fridayStudent);

  if (!identity.studentId) {
    return { data: null, error: null };
  }

  return supabaseAdmin
    .from("follow_up_documents")
    .select(
      "id, recommend_friday_tutorial, student_type, student_id, young_learner_id, class_id, teacher_id, updated_at, created_at"
    )
    .eq("student_type", identity.studentType)
    .eq("category", "Academic")
    .eq(identity.followUpColumn, identity.studentId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function getDuplicateFridayRows(fridayStudent: any) {
  const identity = getStudentIdentity(fridayStudent);

  if (!identity.studentId) {
    return { data: [], error: null };
  }

  return supabaseAdmin
    .from("friday_tutorial_students")
    .select("id")
    .eq("student_type", identity.studentType)
    .eq(identity.fridayColumn, identity.studentId);
}

async function loadMasterStudent(tutorialStudentId: string) {
  if (!tutorialStudentId) {
    return { data: null, error: null };
  }

  return supabaseAdmin
    .from("friday_tutorial_students")
    .select("*")
    .eq("id", tutorialStudentId)
    .maybeSingle();
}

async function resolveMasterStudent(fridayStudent: any) {
  const identity = getStudentIdentity(fridayStudent);

  if (!identity.studentId) {
    return {
      fridayStudent: null,
      duplicateRows: [],
      error: jsonError("This Friday Tutorial record has no valid student identity.", 400),
    };
  }

  const { data: duplicateRows, error: duplicateError } =
    await getDuplicateFridayRows(fridayStudent);

  if (duplicateError) {
    console.error(
      "Friday delete duplicate lookup failed:",
      formatError(duplicateError)
    );
    return {
      fridayStudent: null,
      duplicateRows: [],
      error: jsonError("Unable to verify the Friday Tutorial record.", 500),
    };
  }

  if ((duplicateRows || []).length > 1) {
    return {
      fridayStudent: null,
      duplicateRows: duplicateRows || [],
      error: jsonError(
        "More than one Friday Tutorial record exists for this student. Please review the list before continuing.",
        409
      ),
    };
  }

  if (fridayStudent?.id) {
    return {
      fridayStudent,
      duplicateRows: duplicateRows || [],
      error: null,
    };
  }

  const duplicateId = duplicateRows?.[0]?.id;

  if (!duplicateId) {
    return {
      fridayStudent: null,
      duplicateRows: [],
      error: null,
    };
  }

  const { data: duplicateStudent, error: duplicateStudentError } =
    await loadMasterStudent(duplicateId);

  if (duplicateStudentError || !duplicateStudent) {
    console.error(
      "Friday delete duplicate master load failed:",
      formatError(duplicateStudentError)
    );
    return {
      fridayStudent: null,
      duplicateRows: [],
      error: jsonError("Unable to verify the Friday Tutorial record.", 500),
    };
  }

  return {
    fridayStudent: duplicateStudent,
    duplicateRows: duplicateRows || [],
    error: null,
  };
}

async function getSuggestedInsertData(fridayStudent: any, newestFollowUp: any) {
  const identity = getStudentIdentity(fridayStudent);
  const classId = newestFollowUp?.class_id || fridayStudent?.class_id;

  if (!classId) {
    return {
      data: null,
      error: jsonError("Unable to determine the student's Friday Tutorial class.", 500),
    };
  }

  const { data: classRow, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, teacher_id, level_id")
    .eq("id", classId)
    .single();

  if (classError || !classRow) {
    console.error("Friday delete class lookup failed:", formatError(classError));
    return {
      data: null,
      error: jsonError("Unable to load the student's Friday Tutorial class.", 500),
    };
  }

  const { data: level, error: levelError } = await supabaseAdmin
    .from("levels")
    .select("name")
    .eq("id", classRow.level_id)
    .single();

  if (levelError || !level?.name) {
    console.error("Friday delete level lookup failed:", formatError(levelError));
    return {
      data: null,
      error: jsonError("Unable to load the student's Friday Tutorial level.", 500),
    };
  }

  const tutorialGroup =
    fridayStudent?.tutorial_group ||
    getTutorialGroupForLevel(level.name, identity.studentType);

  if (!tutorialGroup) {
    return {
      data: null,
      error: jsonError("This student is not eligible for Friday Tutorials.", 400),
    };
  }

  return {
    data: {
      student_type: identity.studentType,
      profile_student_id:
        identity.studentType === "cambridge" ? identity.studentId : null,
      young_learner_id:
        identity.studentType === "young_learner" ? identity.studentId : null,
      class_id: classId,
      teacher_id:
        newestFollowUp?.teacher_id || fridayStudent?.teacher_id || classRow.teacher_id,
      follow_up_document_id: newestFollowUp.id,
      tutorial_group: tutorialGroup,
      approval_status: "suggested",
      whatsapp_sent: false,
      parent_confirmed: false,
      active: true,
    },
    error: null,
  };
}

async function removeSelectedAndFutureSessionMemberships(
  tutorialStudentId: string,
  selectedSessionStudentId: string,
  selectedSession: any
) {
  if (!tutorialStudentId) {
    const { error: deleteSelectedError } = await supabaseAdmin
      .from("friday_tutorial_session_students")
      .delete()
      .eq("id", selectedSessionStudentId);

    if (deleteSelectedError) {
      throw new Error(
        formatError(deleteSelectedError)
      );
    }

    return {
      removed: 1,
      retained: 0,
    };
  }

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("friday_tutorial_session_students")
    .select("id, session_id")
    .eq("tutorial_student_id", tutorialStudentId);

  if (membershipError) {
    throw new Error(formatError(membershipError));
  }

  const rows = memberships || [];
  const sessionIds = Array.from(
    new Set(rows.map((item: any) => item.session_id).filter(Boolean))
  );
  const { data: sessions, error: sessionsError } =
    sessionIds.length > 0
      ? await supabaseAdmin
          .from("friday_tutorial_sessions")
          .select("*")
          .in("id", sessionIds)
      : { data: [], error: null };

  if (sessionsError) {
    throw new Error(formatError(sessionsError));
  }

  const sessionMap = new Map(
    (sessions || []).map((session: any) => [session.id, session])
  );
  const membershipIdsToRemove = Array.from(
    new Set(
      [
        selectedSessionStudentId,
        ...rows
        .filter((row: any) => {
          if (row.id === selectedSessionStudentId) {
            return true;
          }

          const session = sessionMap.get(row.session_id);

          return (
            isSessionAfter(selectedSession, session) &&
            isFridayTutorialSessionRemovable(session)
          );
        })
        .map((row: any) => row.id),
      ]
        .filter(Boolean)
    )
  );

  if (membershipIdsToRemove.length === 0) {
    return {
      removed: 0,
      retained: rows.length,
    };
  }

  const { error: deleteError } = await supabaseAdmin
    .from("friday_tutorial_session_students")
    .delete()
    .in("id", membershipIdsToRemove);

  if (deleteError) {
    throw new Error(formatError(deleteError));
  }

  return {
    removed: membershipIdsToRemove.length,
    retained: Math.max(rows.length - membershipIdsToRemove.length, 0),
  };
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(request);

    if ("error" in adminCheck) {
      return adminCheck.error;
    }

    const body = await request.json();
    const tutorialStudentId = String(body.tutorial_student_id || "").trim();
    const sessionStudentId = String(body.session_student_id || "").trim();

    if (!tutorialStudentId && !sessionStudentId) {
      return jsonError(
        "Friday Tutorial student id or weekly list row id is required.",
        400
      );
    }

    let source: "active" | "weekly" = "active";
    let fridayStudent: any = null;
    let sessionStudent: any = null;
    let selectedSession: any = null;
    let resolvedTutorialStudentId = tutorialStudentId;
    let membershipTutorialStudentId = tutorialStudentId;

    if (sessionStudentId) {
      source = "weekly";

      const { data, error: sessionStudentError } = await supabaseAdmin
        .from("friday_tutorial_session_students")
        .select("*")
        .eq("id", sessionStudentId)
        .single();

      if (sessionStudentError || !data) {
        console.error(
          "Friday delete weekly row lookup failed:",
          formatError(sessionStudentError)
        );
        return jsonError("Weekly Friday Tutorial row could not be found.", 404);
      }

      sessionStudent = data;
      resolvedTutorialStudentId = String(sessionStudent.tutorial_student_id || "");
      membershipTutorialStudentId = resolvedTutorialStudentId;

      const { data: session, error: sessionError } = await supabaseAdmin
        .from("friday_tutorial_sessions")
        .select("*")
        .eq("id", sessionStudent.session_id)
        .single();

      if (sessionError || !session) {
        console.error(
          "Friday delete session lookup failed:",
          formatError(sessionError)
        );
        return jsonError("Friday Tutorial session could not be found.", 404);
      }

      selectedSession = session;

      if (!isFridayTutorialSessionRemovable(selectedSession)) {
        return jsonError(
          "This Friday Tutorial session can no longer be changed.",
          409
        );
      }

      const { data: masterStudent, error: masterStudentError } =
        await loadMasterStudent(resolvedTutorialStudentId);

      if (masterStudentError) {
        console.error(
          "Friday delete master lookup failed:",
          formatError(masterStudentError)
        );
        return jsonError("Unable to load the Friday Tutorial student record.", 500);
      }

      const sessionStudentIdentity = buildStudentRowFromSessionStudent(
        sessionStudent,
        selectedSession
      );
      const resolvedMaster = await resolveMasterStudent(
        masterStudent || sessionStudentIdentity
      );

      if (resolvedMaster.error) {
        return resolvedMaster.error;
      }

      fridayStudent = resolvedMaster.fridayStudent || sessionStudentIdentity;
      resolvedTutorialStudentId =
        fridayStudent?.id || resolvedTutorialStudentId || "";
    } else {
      const { data, error: fridayStudentError } =
        await supabaseAdmin
          .from("friday_tutorial_students")
          .select("*")
          .eq("id", tutorialStudentId)
          .single();

      if (fridayStudentError || !data) {
        console.error(
          "Friday delete student lookup failed:",
          formatError(fridayStudentError)
        );
        return jsonError("Friday Tutorial student record could not be found.", 404);
      }

      if (data.approval_status !== "approved" || data.active === false) {
        return jsonError(
          "Only active approved Friday Tutorial students can be removed this way.",
          409
        );
      }

      const resolvedMaster = await resolveMasterStudent(data);

      if (resolvedMaster.error) {
        return resolvedMaster.error;
      }

      fridayStudent = resolvedMaster.fridayStudent;
    }

    if (!fridayStudent) {
      return jsonError("This Friday Tutorial record has no valid student identity.", 400);
    }

    const identity = getStudentIdentity(fridayStudent);

    if (!identity.studentId) {
      return jsonError("This Friday Tutorial record has no valid student identity.", 400);
    }

    const { data: newestFollowUp, error: followUpError } =
      await getNewestAcademicFollowUp(fridayStudent);

    if (followUpError) {
      console.error(
        "Friday delete follow-up lookup failed:",
        formatError(followUpError)
      );
      return jsonError("Unable to check the current Academic Follow-Up.", 500);
    }

    let cleanupResult = {
      removed: 0,
      retained: 0,
    };

    try {
      cleanupResult =
        source === "weekly"
          ? await removeSelectedAndFutureSessionMemberships(
              membershipTutorialStudentId,
              sessionStudentId,
              selectedSession
            )
          : await removeFutureFridayTutorialSessionMemberships(
              resolvedTutorialStudentId,
              supabaseAdmin
            );
    } catch (cleanupError) {
      console.error("Friday delete future cleanup failed:", cleanupError);
      return jsonError("Unable to remove Friday Tutorial sessions.", 500);
    }

    const now = new Date().toISOString();
    const hasMasterRow = Boolean(fridayStudent?.id);

    if (newestFollowUp?.recommend_friday_tutorial === true) {
      if (hasMasterRow) {
        const { error: updateError } = await supabaseAdmin
          .from("friday_tutorial_students")
          .update({
            approval_status: "suggested",
            active: true,
            follow_up_document_id: newestFollowUp.id,
            updated_at: now,
          })
          .eq("id", fridayStudent.id);

        if (updateError) {
          console.error(
            "Friday delete move to suggested failed:",
            formatError(updateError)
          );
          return jsonError("Unable to move student back to Suggested Students.", 500);
        }

        return NextResponse.json({
          success: true,
          action: "moved_to_suggested",
        });
      }

      const duplicateCheck = await resolveMasterStudent(fridayStudent);

      if (duplicateCheck.error) {
        return duplicateCheck.error;
      }

      if (duplicateCheck.fridayStudent) {
        const { error: updateExistingError } = await supabaseAdmin
          .from("friday_tutorial_students")
          .update({
            approval_status: "suggested",
            active: true,
            follow_up_document_id: newestFollowUp.id,
            updated_at: now,
          })
          .eq("id", duplicateCheck.fridayStudent.id);

        if (updateExistingError) {
          console.error(
            "Friday delete duplicate move to suggested failed:",
            formatError(updateExistingError)
          );
          return jsonError("Unable to move student back to Suggested Students.", 500);
        }

        return NextResponse.json({
          success: true,
          action: "moved_to_suggested",
        });
      }

      const { data: suggestedInsertData, error: suggestedInsertDataError } =
        await getSuggestedInsertData(fridayStudent, newestFollowUp);

      if (suggestedInsertDataError) {
        return suggestedInsertDataError;
      }

      if (!suggestedInsertData) {
        return jsonError("Unable to prepare the Suggested Students record.", 500);
      }

      const { error: insertSuggestedError } = await supabaseAdmin
        .from("friday_tutorial_students")
        .insert([suggestedInsertData]);

      if (insertSuggestedError) {
        console.error(
          "Friday delete suggested insert failed:",
          formatError(insertSuggestedError)
        );
        return jsonError("Unable to move student back to Suggested Students.", 500);
      }

      return NextResponse.json({
        success: true,
        action: "moved_to_suggested",
      });
    }

    if (!hasMasterRow) {
      return NextResponse.json({
        success: true,
        action: "deleted",
      });
    }

    if (cleanupResult.retained > 0) {
      const { error: deactivateWithHistoryError } = await supabaseAdmin
        .from("friday_tutorial_students")
        .update({
          approval_status: "removed",
          active: false,
          updated_at: now,
        })
        .eq("id", fridayStudent.id);

      if (deactivateWithHistoryError) {
        console.error(
          "Friday delete history-preserving deactivate failed:",
          formatError(deactivateWithHistoryError)
        );
        return jsonError("Unable to safely deactivate the Friday Tutorial student.", 500);
      }

      return NextResponse.json({
        success: true,
        action: "deactivated",
      });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("friday_tutorial_students")
      .delete()
      .eq("id", fridayStudent.id);

    if (!deleteError) {
      return NextResponse.json({
        success: true,
        action: "deleted",
      });
    }

    if (!isForeignKeyReferenceError(deleteError)) {
      console.error("Friday delete master row failed:", formatError(deleteError));
      return jsonError("Unable to remove the Friday Tutorial student.", 500);
    }

    const { error: deactivateError } = await supabaseAdmin
      .from("friday_tutorial_students")
      .update({
        approval_status: "removed",
        active: false,
        updated_at: now,
      })
      .eq("id", fridayStudent.id);

    if (deactivateError) {
      console.error(
        "Friday delete deactivate fallback failed:",
        formatError(deactivateError)
      );
      return jsonError("Unable to safely deactivate the Friday Tutorial student.", 500);
    }

    return NextResponse.json({
      success: true,
      action: "deactivated",
    });
  } catch (error) {
    console.error("Friday delete route failed:", formatError(error));
    return jsonError("Unable to remove Friday Tutorial student.", 500);
  }
}
