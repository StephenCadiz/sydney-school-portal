import { NextRequest, NextResponse } from "next/server";

import { formatClockRange } from "../../../../lib/timeDisplay";
import {
  authenticatePortalActor,
  tokenFromRequest,
} from "../../../../lib/pushNotificationsServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const actor = await authenticatePortalActor(tokenFromRequest(request));
  if (!actor || actor.role !== "teacher") {
    return jsonError("Teacher access required.", 403);
  }

  try {
    const { data: documents, error: documentError } = await supabaseAdmin
      .from("follow_up_documents")
      .select(
        "id, class_id, student_type, student_id, young_learner_id, category, last_admin_action_at, teacher_action_seen_at"
      )
      .eq("teacher_id", actor.profileId)
      .not("last_admin_action_at", "is", null)
      .order("last_admin_action_at", { ascending: false });

    if (documentError) throw documentError;

    const pendingDocuments = (documents || []).filter((document) => {
      if (!document.last_admin_action_at) return false;
      if (!document.teacher_action_seen_at) return true;
      return (
        new Date(document.last_admin_action_at).getTime() >
        new Date(document.teacher_action_seen_at).getTime()
      );
    });

    if (!pendingDocuments.length) {
      return NextResponse.json(
        { reminders: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const profileIds = pendingDocuments
      .filter((document) => document.student_type !== "young_learner")
      .map((document) => document.student_id)
      .filter(Boolean);
    const youngLearnerIds = pendingDocuments
      .filter(
        (document) =>
          document.student_type === "young_learner" || document.young_learner_id
      )
      .map((document) => document.young_learner_id)
      .filter(Boolean);
    const classIds = pendingDocuments.map((document) => document.class_id).filter(Boolean);

    const [profilesResult, learnersResult, classesResult] = await Promise.all([
      profileIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      youngLearnerIds.length
        ? supabaseAdmin
            .from("young_learners")
            .select("id, first_name, last_name")
            .in("id", youngLearnerIds)
        : Promise.resolve({ data: [], error: null }),
      classIds.length
        ? supabaseAdmin
            .from("classes")
            .select("id, class_name, level_id, days, start_time, end_time")
            .in("id", classIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (learnersResult.error) throw learnersResult.error;
    if (classesResult.error) throw classesResult.error;

    const levelIds = Array.from(
      new Set(
        (classesResult.data || []).map((classRow) => classRow.level_id).filter(Boolean)
      )
    );
    const { data: levels, error: levelsError } = levelIds.length
      ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
      : { data: [], error: null };
    if (levelsError) throw levelsError;

    const profileById = new Map(
      (profilesResult.data || []).map((profile) => [String(profile.id), profile])
    );
    const learnerById = new Map(
      (learnersResult.data || []).map((learner) => [String(learner.id), learner])
    );
    const classById = new Map(
      (classesResult.data || []).map((classRow) => [String(classRow.id), classRow])
    );
    const levelById = new Map(
      (levels || []).map((level) => [String(level.id), level])
    );

    const reminders = pendingDocuments.map((document) => {
      const isYoungLearner =
        document.student_type === "young_learner" || Boolean(document.young_learner_id);
      const student = isYoungLearner
        ? learnerById.get(String(document.young_learner_id))
        : profileById.get(String(document.student_id));
      const classRow = classById.get(String(document.class_id));
      const level = levelById.get(String(classRow?.level_id));
      const studentName =
        `${student?.first_name || ""} ${student?.last_name || ""}`.trim() ||
        "Student";
      const classLabel = [
        level?.name || classRow?.class_name || "Class",
        classRow?.days,
        classRow?.start_time && classRow?.end_time
          ? formatClockRange(classRow.start_time, classRow.end_time, "–")
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const studentType = isYoungLearner ? "young_learner" : "cambridge";
      const studentId = isYoungLearner
        ? document.young_learner_id
        : document.student_id;

      return {
        id: document.id,
        student_name: studentName,
        class_label: classLabel,
        category: document.category || "Other",
        action_at: document.last_admin_action_at,
        url: `/teacher/class?id=${encodeURIComponent(String(document.class_id))}&tab=follow-up&follow_up_id=${encodeURIComponent(String(document.id))}&student_id=${encodeURIComponent(String(studentId))}&student_type=${encodeURIComponent(studentType)}`,
      };
    });

    return NextResponse.json(
      { reminders },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Teacher follow-up action notices failed:", error);
    return jsonError("Unable to load follow-up notifications.", 500);
  }
}
