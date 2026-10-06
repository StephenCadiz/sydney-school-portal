import { NextRequest, NextResponse } from "next/server";

import { requireExamBankAdmin } from "../../../../../lib/cambridgeExamBankServer";
import { getMadridSchoolDate } from "../../../../../lib/schoolClosures";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  const params = new URL(request.url).searchParams;
  const studentId = String(params.get("student_id") || "").trim();
  const requestedType = String(params.get("student_type") || "").trim();
  if (!["cambridge", "young_learner"].includes(requestedType)) {
    return errorResponse("A valid student type is required.", 400);
  }
  const studentType = requestedType === "young_learner" ? "young_learner" : "cambridge";

  if (!studentId) return errorResponse("Student is required.", 400);

  try {
    if (studentType === "cambridge") {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", studentId)
        .eq("role", "student")
        .maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse("Student was not found.", 404);
    } else {
      const { data, error } = await supabaseAdmin
        .from("young_learners")
        .select("id")
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse("Student was not found.", 404);
    }

    const studentColumn = studentType === "cambridge" ? "profile_student_id" : "young_learner_id";
    const { data: tutorialStudents, error: tutorialError } = await supabaseAdmin
      .from("friday_tutorial_students")
      .select("id")
      .eq(studentColumn, studentId);
    if (tutorialError) throw tutorialError;

    const tutorialIds = (tutorialStudents || []).map((row) => row.id).filter(Boolean);
    if (tutorialIds.length === 0) {
      return NextResponse.json({ invited: false, total_invitations: 0, attended: 0, absent: 0, pending: 0 });
    }

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("friday_tutorial_session_students")
      .select("id, session_id, student_attended_status")
      .in("tutorial_student_id", tutorialIds);
    if (membershipError) throw membershipError;

    const sessionIds = Array.from(new Set((memberships || []).map((row) => row.session_id).filter(Boolean)));
    const { data: sessions, error: sessionError } = sessionIds.length
      ? await supabaseAdmin
          .from("friday_tutorial_sessions")
          .select("id, session_date")
          .in("id", sessionIds)
      : { data: [], error: null };
    if (sessionError) throw sessionError;

    const sessionMap = new Map((sessions || []).map((session) => [String(session.id), session]));
    const today = getMadridSchoolDate();
    const rows = (memberships || []).map((row) => ({
      status: String(row.student_attended_status || "").toLowerCase(),
      session_date: String(sessionMap.get(String(row.session_id))?.session_date || ""),
    }));

    return NextResponse.json(
      {
        invited: rows.length > 0,
        total_invitations: rows.length,
        attended: rows.filter((row) => row.status === "yes").length,
        absent: rows.filter((row) => row.status === "no").length,
        pending: rows.filter(
          (row) => row.session_date >= today && !["yes", "no"].includes(row.status)
        ).length,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Student Friday Tutorial attendance summary failed:", error);
    return errorResponse("Unable to load Friday Tutorial attendance summary.", 500);
  }
}
