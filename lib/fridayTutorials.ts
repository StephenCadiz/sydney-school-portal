import { supabase } from "./supabase";

const sessionLabels: Record<string, string> = {
  kids2_junior3: "Kids 2 - Junior 3",
  junior4_teens_b1: "Junior 4 - Teens + B1 Training",
};

const registerStatusValues = ["choose", "yes", "no"];

const sessionStudentUpdateFields = [
  "reason",
  "whatsapp_sent_status",
  "parent_confirmed_status",
  "material_received_status",
  "student_attended_status",
  "comment",
];

function addDaysToDateOnly(dateValue: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);

  if (!match) {
    return dateValue;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getNextSessionType(sessionType: string) {
  return sessionType === "kids2_junior3"
    ? "junior4_teens_b1"
    : "kids2_junior3";
}

function getProfileName(profile: any) {
  if (!profile) {
    return "";
  }

  return `${profile.first_name || ""} ${
    profile.last_name || ""
  }`.trim();
}

function formatSupabaseError(action: string, error: any) {
  return [
    `Friday Tutorial ${action} failed: ${
      error?.message || "Unknown Supabase error"
    }`,
    error?.details ? `Details: ${error.details}` : null,
    error?.hint ? `Hint: ${error.hint}` : null,
    error?.code ? `Code: ${error.code}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getTutorialGroupLabel(group: string | null | undefined) {
  return sessionLabels[String(group || "")] || group || "-";
}

function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

function getTutorialGroupForLevel(
  levelName: string | null | undefined,
  studentType: string
) {
  const normalizedLevel = normalizeLevelName(levelName);

  if (studentType === "cambridge") {
    return normalizedLevel === "B1" ? "junior4_teens_b1" : null;
  }

  if (
    ["KIDS 2", "JUNIOR 1", "JUNIOR 2", "JUNIOR 3"].includes(
      normalizedLevel
    )
  ) {
    return "kids2_junior3";
  }

  if (["JUNIOR 4", "TEENS 1"].includes(normalizedLevel)) {
    return "junior4_teens_b1";
  }

  return null;
}

export async function getFridayTutorialSettings() {
  const { data, error } = await supabase
    .from("friday_tutorial_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("getFridayTutorialSettings Supabase error:", error);
    throw error;
  }

  return data;
}

export async function saveFridayTutorialSettings(
  firstFridayDate: string,
  firstSessionType: string
) {
  const { error } = await supabase
    .from("friday_tutorial_settings")
    .upsert({
      id: 1,
      first_friday_date: firstFridayDate,
      first_session_type: firstSessionType,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("saveFridayTutorialSettings Supabase error:", error);
    throw error;
  }
}

export function calculateUpcomingFridayTutorials(
  settings: any,
  count: number
) {
  if (!settings?.first_friday_date || !settings?.first_session_type) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const sessionType =
      index % 2 === 0
        ? settings.first_session_type
        : getNextSessionType(settings.first_session_type);
    const sessionDate = addDaysToDateOnly(settings.first_friday_date, index * 7);
    const sessionLabel = getTutorialGroupLabel(sessionType);

    return {
      session_date: sessionDate,
      tutorial_group: sessionType,
      tutorial_group_label: sessionLabel,
      start_time: "18:00",
      end_time: "19:00",
      date: sessionDate,
      session_type: sessionType,
      session_label: sessionLabel,
      time: "18:00-19:00",
    };
  });
}

export async function getOrCreateFridayTutorialSession(
  sessionDate: string,
  tutorialGroup: string
) {
  const { data: existingSession, error: existingError } = await supabase
    .from("friday_tutorial_sessions")
    .select("*")
    .eq("session_date", sessionDate)
    .maybeSingle();

  if (existingError) {
    throw new Error(formatSupabaseError("session lookup", existingError));
  }

  if (existingSession) {
    return existingSession;
  }

  const { data: newSession, error: insertError } = await supabase
    .from("friday_tutorial_sessions")
    .insert([
      {
        session_date: sessionDate,
        tutorial_group: tutorialGroup,
        start_time: "18:00",
        end_time: "19:00",
      },
    ])
    .select("*")
    .single();

  if (insertError) {
    throw new Error(formatSupabaseError("session create", insertError));
  }

  return newSession;
}

export async function syncApprovedStudentsToSession(
  sessionId: string,
  tutorialGroup: string
) {
  const { data: approvedStudents, error: approvedError } = await supabase
    .from("friday_tutorial_students")
    .select("id")
    .eq("approval_status", "approved")
    .eq("active", true)
    .eq("tutorial_group", tutorialGroup);

  if (approvedError) {
    throw new Error(formatSupabaseError("approved student load", approvedError));
  }

  const rows = (approvedStudents || []).map((student) => ({
    session_id: sessionId,
    tutorial_student_id: student.id,
    reason: "Tutorial",
  }));

  if (rows.length === 0) {
    return;
  }

  const { error: upsertError } = await supabase
    .from("friday_tutorial_session_students")
    .upsert(rows, {
      onConflict: "session_id,tutorial_student_id",
      ignoreDuplicates: true,
    });

  if (upsertError) {
    throw new Error(formatSupabaseError("weekly register sync", upsertError));
  }
}

async function enrichTutorialStudentRows(rows: any[]) {
  if (rows.length === 0) {
    return [];
  }

  const profileStudentIds = Array.from(
    new Set(rows.map((item) => item.profile_student_id).filter(Boolean))
  );
  const youngLearnerIds = Array.from(
    new Set(rows.map((item) => item.young_learner_id).filter(Boolean))
  );
  const teacherIds = Array.from(
    new Set(rows.map((item) => item.teacher_id).filter(Boolean))
  );
  const classIds = Array.from(
    new Set(rows.map((item) => item.class_id).filter(Boolean))
  );
  const profileIds = Array.from(
    new Set([...profileStudentIds, ...teacherIds])
  );

  const { data: profiles, error: profilesError } =
    profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", profileIds)
      : { data: [], error: null };

  if (profilesError) {
    throw new Error(formatSupabaseError("profile load", profilesError));
  }

  const { data: youngLearners, error: youngLearnersError } =
    youngLearnerIds.length > 0
      ? await supabase
          .from("young_learners")
          .select("id, first_name, last_name")
          .in("id", youngLearnerIds)
      : { data: [], error: null };

  if (youngLearnersError) {
    throw new Error(formatSupabaseError("young learner load", youngLearnersError));
  }

  const { data: classes, error: classesError } =
    classIds.length > 0
      ? await supabase
          .from("classes")
          .select("id, level_id")
          .in("id", classIds)
      : { data: [], error: null };

  if (classesError) {
    throw new Error(formatSupabaseError("class load", classesError));
  }

  const levelIds = Array.from(
    new Set((classes || []).map((item) => item.level_id).filter(Boolean))
  );

  const { data: levels, error: levelsError } =
    levelIds.length > 0
      ? await supabase
          .from("levels")
          .select("id, name")
          .in("id", levelIds)
      : { data: [], error: null };

  if (levelsError) {
    throw new Error(formatSupabaseError("level load", levelsError));
  }

  return rows.map((item) => {
    const profileStudent = (profiles || []).find(
      (profile) => profile.id === item.profile_student_id
    );
    const youngLearner = (youngLearners || []).find(
      (student) => student.id === item.young_learner_id
    );
    const teacher = (profiles || []).find(
      (profile) => profile.id === item.teacher_id
    );
    const classRow = (classes || []).find(
      (classItem) => classItem.id === item.class_id
    );
    const level = (levels || []).find(
      (levelItem) => levelItem.id === classRow?.level_id
    );

    return {
      ...item,
      student_name:
        getProfileName(profileStudent) ||
        getProfileName(youngLearner) ||
        "Unknown student",
      level_name: level?.name || "Unknown level",
      teacher_name: getProfileName(teacher) || "No teacher assigned",
      tutorial_group_label: getTutorialGroupLabel(item.tutorial_group),
    };
  });
}

export async function getFridayTutorialStudents() {
  const { data: tutorialRows, error: tutorialError } = await supabase
    .from("friday_tutorial_students")
    .select("*")
    .order("approval_status")
    .order("created_at", { ascending: false });

  if (tutorialError) {
    console.error("getFridayTutorialStudents Supabase error:", tutorialError);
    throw tutorialError;
  }

  const rows = tutorialRows || [];

  if (rows.length === 0) {
    return [];
  }

  const profileStudentIds = Array.from(
    new Set(rows.map((item) => item.profile_student_id).filter(Boolean))
  );
  const youngLearnerIds = Array.from(
    new Set(rows.map((item) => item.young_learner_id).filter(Boolean))
  );
  const teacherIds = Array.from(
    new Set(rows.map((item) => item.teacher_id).filter(Boolean))
  );
  const classIds = Array.from(
    new Set(rows.map((item) => item.class_id).filter(Boolean))
  );

  const profileIds = Array.from(
    new Set([...profileStudentIds, ...teacherIds])
  );

  const { data: profiles, error: profilesError } =
    profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", profileIds)
      : { data: [], error: null };

  if (profilesError) {
    console.error("getFridayTutorialStudents profiles error:", profilesError);
    throw profilesError;
  }

  const { data: youngLearners, error: youngLearnersError } =
    youngLearnerIds.length > 0
      ? await supabase
          .from("young_learners")
          .select("id, first_name, last_name")
          .in("id", youngLearnerIds)
      : { data: [], error: null };

  if (youngLearnersError) {
    console.error(
      "getFridayTutorialStudents young learners error:",
      youngLearnersError
    );
    throw youngLearnersError;
  }

  const { data: classes, error: classesError } =
    classIds.length > 0
      ? await supabase
          .from("classes")
          .select("id, level_id")
          .in("id", classIds)
      : { data: [], error: null };

  if (classesError) {
    console.error("getFridayTutorialStudents classes error:", classesError);
    throw classesError;
  }

  const levelIds = Array.from(
    new Set((classes || []).map((item) => item.level_id).filter(Boolean))
  );

  const { data: levels, error: levelsError } =
    levelIds.length > 0
      ? await supabase
          .from("levels")
          .select("id, name")
          .in("id", levelIds)
      : { data: [], error: null };

  if (levelsError) {
    console.error("getFridayTutorialStudents levels error:", levelsError);
    throw levelsError;
  }

  return rows.map((item) => {
    const profileStudent = (profiles || []).find(
      (profile) => profile.id === item.profile_student_id
    );
    const youngLearner = (youngLearners || []).find(
      (student) => student.id === item.young_learner_id
    );
    const teacher = (profiles || []).find(
      (profile) => profile.id === item.teacher_id
    );
    const classRow = (classes || []).find(
      (classItem) => classItem.id === item.class_id
    );
    const level = (levels || []).find(
      (levelItem) => levelItem.id === classRow?.level_id
    );

    return {
      ...item,
      student_name:
        getProfileName(profileStudent) ||
        getProfileName(youngLearner) ||
        "Unknown student",
      level_name: level?.name || "Unknown level",
      teacher_name: getProfileName(teacher) || "No teacher assigned",
      tutorial_group_label:
        sessionLabels[item.tutorial_group] || item.tutorial_group || "-",
    };
  });
}

export async function getFridayTutorialSessionRegister(
  sessionDate: string,
  tutorialGroup: string
) {
  const session = await getOrCreateFridayTutorialSession(
    sessionDate,
    tutorialGroup
  );

  await syncApprovedStudentsToSession(session.id, tutorialGroup);

  const { data: sessionRows, error: sessionRowsError } = await supabase
    .from("friday_tutorial_session_students")
    .select("*")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  if (sessionRowsError) {
    throw new Error(formatSupabaseError("weekly register load", sessionRowsError));
  }

  const rows = sessionRows || [];

  if (rows.length === 0) {
    return [];
  }

  const tutorialStudentIds = Array.from(
    new Set(rows.map((item) => item.tutorial_student_id).filter(Boolean))
  );

  const { data: tutorialStudents, error: tutorialStudentsError } =
    tutorialStudentIds.length > 0
      ? await supabase
          .from("friday_tutorial_students")
          .select("*")
          .in("id", tutorialStudentIds)
      : { data: [], error: null };

  if (tutorialStudentsError) {
    throw new Error(
      formatSupabaseError("weekly tutorial student load", tutorialStudentsError)
    );
  }

  const tutorialStudentMap = new Map(
    (tutorialStudents || []).map((student) => [student.id, student])
  );
  const enrichedTutorialStudents = await enrichTutorialStudentRows(
    tutorialStudents || []
  );
  const enrichedMap = new Map(
    enrichedTutorialStudents.map((student) => [student.id, student])
  );

  return rows.map((row) => {
    const tutorialStudent = tutorialStudentMap.get(row.tutorial_student_id) || {};
    const enrichedStudent = enrichedMap.get(row.tutorial_student_id) || {};

    return {
      session_student_id: row.id,
      session_id: row.session_id,
      tutorial_student_id: row.tutorial_student_id,
      student_name: enrichedStudent.student_name || "Unknown student",
      level_name: enrichedStudent.level_name || "Unknown level",
      teacher_name: enrichedStudent.teacher_name || "No teacher assigned",
      tutorial_group: tutorialStudent.tutorial_group || tutorialGroup,
      tutorial_group_label: getTutorialGroupLabel(
        tutorialStudent.tutorial_group || tutorialGroup
      ),
      reason: row.reason || "Tutorial",
      whatsapp_sent_status: row.whatsapp_sent_status || "choose",
      parent_confirmed_status: row.parent_confirmed_status || "choose",
      material_received_status: row.material_received_status || "choose",
      student_attended_status: row.student_attended_status || "choose",
      comment: row.comment || "",
    };
  });
}

export async function updateFridayTutorialSessionStudent(
  id: string,
  updates: any
) {
  const safeUpdates = sessionStudentUpdateFields.reduce(
    (current: Record<string, any>, field) => {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        current[field] = updates[field];
      }

      return current;
    },
    {}
  );

  [
    "whatsapp_sent_status",
    "parent_confirmed_status",
    "material_received_status",
    "student_attended_status",
  ].forEach((field) => {
    if (
      safeUpdates[field] &&
      !registerStatusValues.includes(safeUpdates[field])
    ) {
      safeUpdates[field] = "choose";
    }
  });

  const { error } = await supabase
    .from("friday_tutorial_session_students")
    .update({
      ...safeUpdates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(formatSupabaseError("weekly register update", error));
  }
}

export async function removeTutorialStudentFromFutureLists(
  tutorialStudentId: string
) {
  const { error } = await supabase
    .from("friday_tutorial_students")
    .update({
      approval_status: "removed",
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tutorialStudentId);

  if (error) {
    throw new Error(formatSupabaseError("future list removal", error));
  }
}

export async function updateFridayTutorialStudent(
  id: string,
  updates: any
) {
  const { error } = await supabase
    .from("friday_tutorial_students")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateFridayTutorialStudent Supabase error:", error);
    throw error;
  }
}

export async function suggestFridayTutorialFromFollowUp(followUp: any) {
  if (
    followUp?.category !== "Academic" ||
    !followUp?.class_id ||
    !followUp?.teacher_id
  ) {
    return;
  }

  const studentType = followUp.student_type || "cambridge";
  const isYoungLearner = studentType === "young_learner";
  const profileStudentId = isYoungLearner ? null : followUp.student_id;
  const youngLearnerId = isYoungLearner ? followUp.young_learner_id : null;

  if (
    (studentType === "cambridge" && !profileStudentId) ||
    (studentType === "young_learner" && !youngLearnerId)
  ) {
    return;
  }

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, level_id")
    .eq("id", followUp.class_id)
    .single();

  if (classError || !classRow) {
    throw new Error(formatSupabaseError("class lookup", classError));
  }

  const { data: level, error: levelError } = await supabase
    .from("levels")
    .select("name")
    .eq("id", classRow.level_id)
    .single();

  if (levelError || !level?.name) {
    throw new Error(formatSupabaseError("level lookup", levelError));
  }

  const tutorialGroup = getTutorialGroupForLevel(level.name, studentType);

  if (!tutorialGroup) {
    return;
  }

  const duplicateQuery = supabase
    .from("friday_tutorial_students")
    .select("id, approval_status, active")
    .eq("student_type", studentType)
    .limit(1);

  const { data: existingRows, error: existingError } = isYoungLearner
    ? await duplicateQuery.eq("young_learner_id", youngLearnerId)
    : await duplicateQuery.eq("profile_student_id", profileStudentId);

  if (existingError) {
    throw new Error(formatSupabaseError("duplicate check", existingError));
  }

  if (existingRows && existingRows.length > 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("friday_tutorial_students")
    .insert([
      {
        student_type: studentType,
        profile_student_id: profileStudentId,
        young_learner_id: youngLearnerId,
        class_id: followUp.class_id,
        teacher_id: followUp.teacher_id,
        follow_up_document_id: followUp.id,
        tutorial_group: tutorialGroup,
        approval_status: "suggested",
        whatsapp_sent: false,
        parent_confirmed: false,
        active: true,
      },
    ]);

  if (insertError) {
    throw new Error(formatSupabaseError("suggestion insert", insertError));
  }
}
