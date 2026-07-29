import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getMadridDateString } from "../../../../lib/homework";
import {
  isFridayTutorialCambridgeLevel,
  normalizeCambridgeLevel,
} from "../../../../lib/fridayTutorialResults";
import {
  buildTeacherStudentProgress,
  type FollowUpProgressSource,
  type FridayProgressSource,
} from "../../../../lib/teacherStudentProgress";
import { loadTeacherClassHomework } from "../../../../lib/teacherHomeworkServer";

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function formatError(error: any) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(" ") || String(error || "Unknown error");
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function authenticate(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return { actorId: "", role: "", response: jsonError("Authentication required.", 401) };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { actorId: "", role: "", response: jsonError("Invalid authentication token.", 401) };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .single();

  if (
    profileError ||
    (profile?.role !== "teacher" && profile?.role !== "admin")
  ) {
    return {
      actorId: "",
      role: profile?.role || "",
      response: jsonError("Teacher or admin access required.", 403),
    };
  }

  return {
    actorId: data.user.id,
    role: String(profile.role),
    response: null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const classId = String(searchParams.get("class_id") || "").trim();
  const studentId = String(searchParams.get("student_id") || "").trim();

  if (!classId || !studentId) {
    return jsonError("Class and student are required.", 400);
  }

  try {
    const { data: classRow, error: classError } = await supabaseAdmin
      .from("classes")
      .select(
        "id, teacher_id, level_id, class_name, course_type, days, is_cambridge"
      )
      .eq("id", classId)
      .single();

    if (classError || !classRow) {
      return jsonError("Class was not found.", 404);
    }

    if (
      auth.role === "teacher" &&
      String(classRow.teacher_id || "") !== auth.actorId
    ) {
      return jsonError("You can only view students in your own classes.", 403);
    }

    if (classRow.is_cambridge !== true) {
      return jsonError("Progress Overview is available for Cambridge classes only.", 400);
    }

    const { data: levelRow, error: levelError } = await supabaseAdmin
      .from("levels")
      .select("id, name")
      .eq("id", classRow.level_id)
      .single();

    if (levelError || !levelRow) {
      return jsonError("Unable to verify the class level.", 500);
    }

    const level = normalizeCambridgeLevel(levelRow.name);
    if (!isFridayTutorialCambridgeLevel(level)) {
      return jsonError("Progress Overview supports B1, B2, C1 and C2 only.", 400);
    }

    const [studentResult, enrolmentResult] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("id", studentId)
        .eq("role", "student")
        .maybeSingle(),
      supabaseAdmin
        .from("class_enrolments")
        .select("class_id, student_id")
        .eq("class_id", classId)
        .eq("student_id", studentId)
        .maybeSingle(),
    ]);

    if (studentResult.error || !studentResult.data) {
      return jsonError("Student was not found.", 404);
    }

    if (enrolmentResult.error || !enrolmentResult.data) {
      return jsonError("The student is not enrolled in this class.", 403);
    }

    const todayMadrid = getMadridDateString();
    const normalizedCourseType = String(classRow.course_type || "")
      .trim()
      .toLowerCase();
    const teacherHomework = await loadTeacherClassHomework({
      actorId: auth.actorId,
      role: auth.role as "teacher" | "admin",
      classId,
      classDays: String(classRow.days || ""),
      levelId: Number(classRow.level_id),
      level,
      courseType: normalizedCourseType,
      supported: true,
    });
    const [
      assignmentResultsResult,
      mockResultsResult,
      sheetsResult,
      followUpsResult,
    ] =
      await Promise.all([
        supabaseAdmin
          .from("results")
          .select("*")
          .eq("class_id", classId)
          .eq("student_id", studentId)
          .eq("result_type", "homework")
          .not("cambridge_exam_assignment_id", "is", null)
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("exam_date", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .limit(500),
        supabaseAdmin
          .from("results")
          .select("*")
          .eq("class_id", classId)
          .eq("student_id", studentId)
          .eq("result_type", "mock")
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("exam_date", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .limit(500),
        supabaseAdmin
          .from("friday_tutorial_result_sheets")
          .select("id, tutorial_session_id, submitted_at")
          .eq("class_id", classId)
          .not("submitted_at", "is", null),
        supabaseAdmin
          .from("follow_up_documents")
          .select("id, category, status, created_at, updated_at")
          .eq("class_id", classId)
          .eq("student_type", "cambridge")
          .eq("student_id", studentId)
          .order("updated_at", { ascending: false }),
      ]);

    const loadError =
      assignmentResultsResult.error ||
      mockResultsResult.error ||
      sheetsResult.error ||
      followUpsResult.error;
    if (loadError) throw loadError;

    const assignmentResults = assignmentResultsResult.data || [];
    const historicalAssignmentIds = Array.from(
      new Set(
        assignmentResults
          .map((row) => String(row.cambridge_exam_assignment_id || ""))
          .filter(Boolean)
      )
    );
    const historicalAssignmentsResult = historicalAssignmentIds.length
      ? await supabaseAdmin
          .from("cambridge_exam_assignments")
          .select(`
            id,
            course_type,
            release_date,
            due_date,
            active,
            archived_at,
            part:cambridge_exam_parts!cambridge_exam_assignments_exam_part_id_fkey (
              id,
              part_type,
              exam:cambridge_exam_sets!cambridge_exam_parts_exam_set_id_fkey (
                id,
                exam_number,
                title,
                active,
                archived_at,
                level:levels!cambridge_exam_sets_level_id_fkey (
                  name
                )
              )
            )
          `)
          .in("id", historicalAssignmentIds)
          .limit(500)
      : { data: [], error: null };
    if (historicalAssignmentsResult.error) {
      console.error(
        "Teacher historical assignment metadata load failed:",
        formatError(historicalAssignmentsResult.error)
      );
    }

    const one = (value: any) => (Array.isArray(value) ? value[0] : value);
    const currentAssignments = teacherHomework.homework
      .filter((item) => item.source === "assignment")
      .map((item) => ({ ...item, progress_current: true }));
    const assignmentMetadataById = new Map<string, any>(
      currentAssignments.map((item) => [String(item.id), item])
    );
    for (const row of historicalAssignmentsResult.data || []) {
      const assignmentId = String(row.id);
      if (assignmentMetadataById.has(assignmentId)) continue;
      const part = one(row.part);
      const exam = one(part?.exam);
      const historicalLevel = one(exam?.level);
      assignmentMetadataById.set(assignmentId, {
        id: assignmentId,
        source: "assignment",
        exam: {
          id: String(exam?.id || ""),
          number: Number(exam?.exam_number),
          title: exam?.title ? String(exam.title) : null,
        },
        part: {
          id: String(part?.id || ""),
          type: String(part?.part_type || ""),
          label: String(part?.part_type || ""),
        },
        level: String(historicalLevel?.name || ""),
        course_type: String(row.course_type || ""),
        release_date: row.release_date || null,
        due_date: row.due_date || null,
        active: row.active === true,
        archived_at: row.archived_at || null,
        exam_active: exam?.active === true,
        exam_archived_at: exam?.archived_at || null,
        progress_current: false,
      });
    }
    for (const assignmentId of historicalAssignmentIds) {
      if (assignmentMetadataById.has(assignmentId)) continue;
      console.error(
        "Teacher historical assignment metadata unavailable:",
        assignmentId
      );
      assignmentMetadataById.set(assignmentId, {
        id: assignmentId,
        source: "assignment",
        exam: { id: "", number: null, title: null },
        part: { id: "", type: "", label: "Historical assignment details unavailable" },
        release_date: null,
        due_date: null,
        progress_current: false,
        metadata_unavailable: true,
      });
    }
    const results = [
      ...assignmentResults,
      ...(mockResultsResult.data || []),
    ];

    const sheets = sheetsResult.data || [];
    const followUpDocuments = followUpsResult.data || [];
    const sheetIds = sheets.map((row) => String(row.id)).filter(Boolean);
    const followUpIds = followUpDocuments
      .map((row) => String(row.id))
      .filter(Boolean);
    const [fridayResultsResult, followUpEntriesResult] = await Promise.all([
      sheetIds.length
        ? supabaseAdmin
            .from("friday_tutorial_results")
            .select("id, result_sheet_id, percentage, attended")
            .eq("student_id", studentId)
            .in("result_sheet_id", sheetIds)
        : Promise.resolve({ data: [], error: null }),
      followUpIds.length
        ? supabaseAdmin
            .from("follow_up_entries")
            .select(
              "id, follow_up_document_id, teacher_id, entry_date, details, action_plan, comment, created_at"
            )
            .in("follow_up_document_id", followUpIds)
            .order("entry_date", { ascending: false })
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (fridayResultsResult.error) throw fridayResultsResult.error;
    if (followUpEntriesResult.error) throw followUpEntriesResult.error;

    const fridayResults = fridayResultsResult.data || [];
    const relevantSheetIds = new Set(
      fridayResults.map((row) => String(row.result_sheet_id))
    );
    const sessionIds = sheets
      .filter((sheet) => relevantSheetIds.has(String(sheet.id)))
      .map((sheet) => String(sheet.tutorial_session_id))
      .filter(Boolean);
    const entries = followUpEntriesResult.data || [];
    const teacherIds = Array.from(
      new Set(entries.map((entry) => String(entry.teacher_id || "")).filter(Boolean))
    );
    const [sessionsResult, teachersResult] = await Promise.all([
      sessionIds.length
        ? supabaseAdmin
            .from("friday_exam_practice_sessions")
            .select(
              "id, session_date, level_name, activity_type, exam_part, active"
            )
            .in("id", sessionIds)
            .eq("active", true)
            .lte("session_date", todayMadrid)
        : Promise.resolve({ data: [], error: null }),
      teacherIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", teacherIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (sessionsResult.error) throw sessionsResult.error;
    if (teachersResult.error) throw teachersResult.error;

    const sessionById = new Map(
      (sessionsResult.data || [])
        .filter(
          (session) => normalizeCambridgeLevel(session.level_name) === level
        )
        .map((session) => [String(session.id), session])
    );
    const sheetById = new Map(
      sheets.map((sheet) => [String(sheet.id), sheet])
    );
    const fridayRows: FridayProgressSource[] = fridayResults
      .map((result) => {
        const sheet = sheetById.get(String(result.result_sheet_id));
        const session = sheet
          ? sessionById.get(String(sheet.tutorial_session_id))
          : null;
        if (!sheet || !session) return null;
        return {
          id: String(result.id),
          result_sheet_id: String(result.result_sheet_id),
          session_id: String(session.id),
          session_date: String(session.session_date || ""),
          level_name: String(session.level_name || ""),
          activity_type: String(session.activity_type || ""),
          exam_part: session.exam_part ? String(session.exam_part) : null,
          percentage:
            result.percentage === null || result.percentage === undefined
              ? null
              : Number(result.percentage),
          attended: result.attended === true,
        };
      })
      .filter((row): row is FridayProgressSource => row !== null);
    const teacherNames = new Map(
      (teachersResult.data || []).map((teacher) => [
        String(teacher.id),
        `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() ||
          "Unknown teacher",
      ])
    );
    const entriesByDocument = new Map<string, any[]>();
    for (const entry of entries) {
      const documentId = String(entry.follow_up_document_id || "");
      entriesByDocument.set(documentId, [
        ...(entriesByDocument.get(documentId) || []),
        {
          id: String(entry.id),
          entry_date: entry.entry_date || null,
          created_at: entry.created_at || null,
          details: String(entry.details || ""),
          action_plan: String(entry.action_plan || ""),
          comment: String(entry.comment || ""),
          teacher_name:
            teacherNames.get(String(entry.teacher_id || "")) ||
            "Unknown teacher",
        },
      ]);
    }
    const followUps: FollowUpProgressSource[] = followUpDocuments.map(
      (document) => ({
        id: String(document.id),
        category: String(document.category || "Other"),
        status: String(document.status || "Open"),
        updated_at: document.updated_at || document.created_at || null,
        entries: entriesByDocument.get(String(document.id)) || [],
      })
    );
    const student = studentResult.data;
    const studentName =
      `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
      "Selected student";

    return NextResponse.json({
      progress: buildTeacherStudentProgress({
        student: {
          id: studentId,
          name: studentName,
          level,
          course_type: normalizedCourseType,
          class_context: [
            level,
            normalizedCourseType
              ? normalizedCourseType.charAt(0).toUpperCase() +
                normalizedCourseType.slice(1)
              : "",
            classRow.days || "",
          ]
            .filter(Boolean)
            .join(" · "),
        },
        todayMadrid,
        results,
        assignmentMetadata: Array.from(assignmentMetadataById.values()),
        fridayRows,
        followUps,
      }),
    });
  } catch (error) {
    console.error("Teacher student progress load failed:", formatError(error));
    return jsonError("Unable to load student progress.", 500);
  }
}
