import { NextRequest, NextResponse } from "next/server";
import { authenticateMonitoringActor, callMonitoringRpc, loadMonitoringEnrolments, loadMonitoringRecords } from "../../../../lib/studentMonitoringServer";

export async function GET(request: NextRequest) {
  const auth = await authenticateMonitoringActor(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.actor?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const records = await loadMonitoringRecords(auth.actor.id, "admin");
    if (new URL(request.url).searchParams.get("summary") === "1") {
      const feedback = records
        .filter((record) => record.status === "feedback_submitted")
        .map((record) => ({
          id: record.id,
          student_name: record.student_name || "Student",
          class_name: record.class_name || "Class",
          level_name: record.level_name || "Level",
          teacher_name: record.teacher_name || "Teacher",
          submitted_at: record.submitted_at,
        }));
      return NextResponse.json({
        feedbackCount: feedback.length,
        overdueCount: records.filter((record) => record.status === "overdue").length,
        feedback,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load monitoring records." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateMonitoringActor(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.actor?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json();
    const studentId = String(body.student_id || "");
    const studentType = body.student_type === "young_learner" ? "young_learner" : "profile";
    const requestedClassId = String(body.class_id || "");
    const enrolments = await loadMonitoringEnrolments(studentType, studentId);
    const enrolment = enrolments.find((item) => item.class_id === requestedClassId);
    if (!enrolment) {
      return NextResponse.json({ error: "Select an active enrolment for this student." }, { status: 400 });
    }
    const record = await callMonitoringRpc("create_student_monitoring", {
      p_actor_id: auth.actor.id,
      p_student_type: studentType,
      p_profile_student_id: studentType === "profile" ? studentId : null,
      p_young_learner_id: studentType === "young_learner" ? studentId : null,
      p_class_id: enrolment.class_id,
      p_level_id: enrolment.level_id,
      p_reason: String(body.reason || ""),
      p_feedback_due_on: String(body.feedback_due_on || ""),
    });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create monitoring record." }, { status: 400 });
  }
}
