import { NextRequest, NextResponse } from "next/server";

import {
  CambridgeExamPartType,
  CambridgeExamResourceType,
  getExamPartLabel,
} from "../../../../lib/cambridgeExamBank";
import { normalizeCambridgeLevel } from "../../../../lib/fridayTutorialResults";
import {
  FRIDAY_AT_6_DUTY_LABELS,
  getFridayAt6DutyTypesForTeacher,
} from "../../../../lib/fridayTutorials";
import {
  getFridayTutorialSessionTypeForDate,
  getTutorialGroupLabel,
} from "../../../../lib/fridayTutorialRotation";
import {
  loadEffectiveFridayTutorialDutyForDate,
  loadFridayTutorialRotationContext,
} from "../../../../lib/fridayTutorialRotationServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getSchoolClosureForDate } from "../../../../lib/schoolClosuresServer";
import { sendPortalPush } from "../../../../lib/pushNotificationsServer";

const RESOURCE_ORDER: Record<
  CambridgeExamPartType,
  readonly CambridgeExamResourceType[]
> = {
  reading: ["paper", "key"],
  listening: ["paper", "audio", "key"],
  writing: ["paper", "sample_writing"],
  speaking: ["paper"],
};

const RESOURCE_LABELS: Record<CambridgeExamResourceType, string> = {
  paper: "Question Paper",
  key: "Key",
  audio: "Audio",
  sample_writing: "Writing Samples",
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function one(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function getMadridDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getMadridWeekday(value: string) {
  return new Date(`${value}T12:00:00Z`).getUTCDay();
}

function getMadridClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    minutes:
      Number(values.hour || 0) * 60 +
      Number(values.minute || 0),
  };
}

function timeToMinutes(value: unknown, fallback: number) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})/);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isExamPracticeActiveNow(
  session: { start_time?: string | null; end_time?: string | null },
  now = new Date()
) {
  const start = timeToMinutes(session.start_time, 18 * 60);
  const end = timeToMinutes(session.end_time, 19 * 60);
  if (end <= start) return false;
  const clock = getMadridClock(now);
  return clock.minutes >= start && clock.minutes < end;
}

async function loadDutyReminder(today: string, teacherId: string) {
  const weekday = getMadridWeekday(today);
  if (weekday < 3 || weekday > 5) return null;

  const phase = weekday === 3 ? "wednesday" : weekday === 4 ? "thursday" : "friday";
  const sessionDate = addDays(today, 5 - weekday);
  const rotation = await loadFridayTutorialRotationContext({ endDate: sessionDate });
  const tutorialGroup = getFridayTutorialSessionTypeForDate(
    rotation.settings || {},
    sessionDate,
    rotation.closures
  );
  if (!tutorialGroup) return null;

  const duty = await loadEffectiveFridayTutorialDutyForDate(sessionDate);
  const dutyTypes = getFridayAt6DutyTypesForTeacher(
    duty,
    teacherId,
    tutorialGroup
  );
  if (!duty || dutyTypes.length === 0) return null;

  return {
    duty_id: duty.id,
    session_date: sessionDate,
    phase,
    tutorial_group: tutorialGroup,
    tutorial_group_label: getTutorialGroupLabel(tutorialGroup),
    duty_types: dutyTypes,
    duty_labels: dutyTypes.map((dutyType) => FRIDAY_AT_6_DUTY_LABELS[dutyType]),
    start_time: "18:00",
    end_time: "19:00",
  };
}

async function loadTeacherMaterialReminders(today: string, teacherId: string) {
  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from("friday_tutorial_sessions")
    .select("id, session_date, start_time, end_time")
    .gte("session_date", today)
    .lte("session_date", addDays(today, 7))
    .order("session_date", { ascending: true });
  if (sessionsError) throw sessionsError;
  if (!sessions?.length) return [];

  const sessionById = new Map(sessions.map((session) => [String(session.id), session]));
  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("friday_tutorial_session_students")
    .select("id, session_id, tutorial_student_id, parent_confirmed_status, material_received_status")
    .in("session_id", sessions.map((session) => session.id))
    .eq("parent_confirmed_status", "yes");
  if (rowsError) throw rowsError;

  const pendingRows = (rows || []).filter((row) => row.material_received_status !== "yes");
  if (!pendingRows.length) return [];
  const tutorialIds = Array.from(new Set(pendingRows.map((row) => row.tutorial_student_id).filter(Boolean)));
  const { data: tutorialStudents, error: tutorialError } = await supabaseAdmin
    .from("friday_tutorial_students")
    .select("id, student_type, young_learner_id, teacher_id, class_id, active")
    .in("id", tutorialIds)
    .eq("student_type", "young_learner")
    .eq("active", true)
    .eq("teacher_id", teacherId);
  if (tutorialError) throw tutorialError;
  if (!tutorialStudents?.length) return [];

  const youngLearnerIds = tutorialStudents.map((student) => student.young_learner_id).filter(Boolean);
  const classIds = tutorialStudents.map((student) => student.class_id).filter(Boolean);
  const [{ data: learners, error: learnerError }, { data: classes, error: classError }] = await Promise.all([
    youngLearnerIds.length
      ? supabaseAdmin.from("young_learners").select("id, first_name, last_name").in("id", youngLearnerIds)
      : Promise.resolve({ data: [], error: null }),
    classIds.length
      ? supabaseAdmin.from("classes").select("id, class_name, level_id").in("id", classIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (learnerError) throw learnerError;
  if (classError) throw classError;
  const levelIds = Array.from(new Set((classes || []).map((classRow) => classRow.level_id).filter(Boolean)));
  const { data: levels, error: levelError } = levelIds.length
    ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };
  if (levelError) throw levelError;

  const markerRows = await supabaseAdmin
    .from("messages")
    .select("message")
    .eq("receiver_id", teacherId)
    .eq("subject", "Friday Tutorial: prepare activities")
    .order("created_at", { ascending: false })
    .limit(500);
  if (markerRows.error) throw markerRows.error;
  const messages = markerRows.data || [];
  const learnerById = new Map((learners || []).map((learner) => [String(learner.id), learner]));
  const classById = new Map((classes || []).map((classRow) => [String(classRow.id), classRow]));
  const levelById = new Map((levels || []).map((level) => [String(level.id), level]));
  const tutorialById = new Map(tutorialStudents.map((student) => [String(student.id), student]));

  return pendingRows.flatMap((row) => {
    const tutorialStudent = tutorialById.get(String(row.tutorial_student_id));
    const session = sessionById.get(String(row.session_id));
    if (!tutorialStudent || !session) return [];
    const marker = `[friday-tutorial-parent-confirmed:${row.id}]`;
    if (messages.some((item) => String(item.message || "").includes(marker))) return [];
    const learner = learnerById.get(String(tutorialStudent.young_learner_id));
    const classRow = classById.get(String(tutorialStudent.class_id));
    const level = levelById.get(String(classRow?.level_id));
    return [{
      id: String(row.id),
      student_name: `${learner?.first_name || ""} ${learner?.last_name || ""}`.trim() || "Young Learner",
      session_date: session.session_date,
      start_time: session.start_time || null,
      end_time: session.end_time || null,
      level_name: level?.name || "Young Learner",
      class_name: classRow?.class_name || "",
    }];
  });
}

async function loadTeacherScoringLinks(teacherId: string, levelNames: string[]) {
  const levels = Array.from(new Set(levelNames.map(normalizeCambridgeLevel).filter(Boolean)));
  if (!teacherId || levels.length === 0) return new Map<string, any[]>();
  const { data: classes, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, class_name, level_id, teacher_id, is_cambridge")
    .eq("teacher_id", teacherId)
    .eq("is_cambridge", true);
  if (classError) throw classError;
  const levelIds = Array.from(new Set((classes || []).map((row) => row.level_id).filter(Boolean)));
  const { data: levelRows, error: levelError } = levelIds.length
    ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };
  if (levelError) throw levelError;
  const levelById = new Map((levelRows || []).map((row) => [String(row.id), normalizeCambridgeLevel(row.name)]));
  const result = new Map<string, any[]>();
  for (const classRow of classes || []) {
    const level = levelById.get(String(classRow.level_id));
    if (!level || !levels.includes(level)) continue;
    const link = {
      class_id: String(classRow.id),
      class_name: classRow.class_name || "Assigned class",
      href: `/teacher/class?id=${encodeURIComponent(String(classRow.id))}&tab=friday-tutorial-results`,
    };
    result.set(level, [...(result.get(level) || []), link]);
  }
  return result;
}

async function requireTeacherOrAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) {
    return { userId: "", response: jsonError("Authentication required.", 401) };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    return { userId: "", response: jsonError("Authentication required.", 401) };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      userId: "",
      response: jsonError("Unable to verify dashboard access.", 500),
    };
  }
  if (profile?.role !== "teacher" && profile?.role !== "admin") {
    return {
      userId: "",
      response: jsonError("Teacher access required.", 403),
    };
  }

  return { userId: user.id, role: profile.role, response: null };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireTeacherOrAdmin(request);
    if (actor.response) return actor.response;

    const today = getMadridDateString();
    const dutyReminder = await loadDutyReminder(today, actor.userId);
    const teacherMaterialReminders = actor.userId
      ? await loadTeacherMaterialReminders(today, actor.userId)
      : [];
    const closure = await getSchoolClosureForDate(today);
    if (closure) {
      return NextResponse.json({
        notices: [],
        duty: null,
        duty_reminder: dutyReminder,
        teacher_material_reminders: teacherMaterialReminders,
        school_closed: true,
        closure,
      });
    }
    if (getMadridWeekday(today) !== 5) {
      return NextResponse.json({
        notices: [],
        duty: null,
        duty_reminder: dutyReminder,
        teacher_material_reminders: teacherMaterialReminders,
        school_closed: false,
      });
    }
    const rotation = await loadFridayTutorialRotationContext({ endDate: today });
    const tutorialGroup = getFridayTutorialSessionTypeForDate(
      rotation.settings || {},
      today,
      rotation.closures
    );

    const [{ data: sessions, error: sessionError }, duty] =
      await Promise.all([
        supabaseAdmin
          .from("friday_exam_practice_sessions")
          // Keep this compatible with pre-times deployments; the migration
          // adds start_time/end_time while legacy rows remain readable.
          .select("*")
          .eq("active", true)
          .eq("session_date", today)
          .order("level_name", { ascending: true })
          .order("activity_type", { ascending: true }),
        loadEffectiveFridayTutorialDutyForDate(today),
      ]);

    if (sessionError) {
      return jsonError("Unable to load Friday Tutorial notices.", 500);
    }
    // Exam Practice is an independent event source. It is not restricted by
    // the Friday Tutorial A/B rotation or by the Friday duty teacher.
    const visibleSessions = (sessions || []).filter((session) =>
      isExamPracticeActiveNow(session)
    );
    if (actor.role === "teacher") {
      for (const session of visibleSessions) {
        await sendPortalPush([actor.userId], {
          eventKey: `teacher-exam-practice:${session.id}`,
          title: "Friday Exam Practice is active",
          body: `${normalizeCambridgeLevel(session.level_name)} · ${session.activity_type || "Exam practice"} · open your Teacher Dashboard workspace.`,
          url: "/teacher",
          tag: `teacher-exam-practice:${session.id}`,
        });
      }
      for (const reminder of teacherMaterialReminders) {
        await sendPortalPush([actor.userId], {
          eventKey: `teacher-material-reminder:${reminder.id}`,
          title: "Friday Tutorial material reminder",
          body: "Prepare activities for the student and send them to Admin as soon as possible.",
          url: "/teacher",
          tag: `teacher-material-reminder:${reminder.id}`,
        });
      }
    }
    const scoringLinksByLevel = await loadTeacherScoringLinks(
      actor.userId,
      visibleSessions.map((session) => session.level_name)
    );

    const partIds = Array.from(
      new Set(
        visibleSessions
          .map((session) => session.cambridge_exam_part_id)
          .filter(Boolean)
      )
    );

    const { data: parts, error: partError } = partIds.length
      ? await supabaseAdmin
          .from("cambridge_exam_parts")
          .select(`
            id,
            part_type,
            exam:cambridge_exam_sets!cambridge_exam_parts_exam_set_id_fkey (
              id,
              exam_number,
              title,
              active,
              archived_at,
              level:levels!cambridge_exam_sets_level_id_fkey (
                id,
                name
              )
            )
          `)
          .in("id", partIds)
      : { data: [], error: null };

    if (partError) {
      return jsonError("Unable to load Friday Tutorial resources.", 500);
    }

    const validParts = new Map<string, any>();
    for (const part of parts || []) {
      const exam = one(part.exam);
      if (exam?.active === true && !exam?.archived_at) {
        validParts.set(String(part.id), part);
      }
    }

    const validPartIds = Array.from(validParts.keys());
    const { data: resourceRows, error: resourceError } = validPartIds.length
      ? await supabaseAdmin
          .from("cambridge_exam_part_resources")
          .select("exam_part_id, resource_type, external_url")
          .in("exam_part_id", validPartIds)
          .in("resource_type", ["paper", "key", "audio", "sample_writing"])
      : { data: [], error: null };

    if (resourceError) {
      return jsonError("Unable to load Friday Tutorial resources.", 500);
    }

    const resourcesByPart = new Map<string, any[]>();
    for (const resource of resourceRows || []) {
      const partId = String(resource.exam_part_id);
      resourcesByPart.set(partId, [
        ...(resourcesByPart.get(partId) || []),
        resource,
      ]);
    }

    const notices = visibleSessions.map((session) => {
      const partId = String(session.cambridge_exam_part_id || "");
      const part = validParts.get(partId);
      const exam = one(part?.exam);
      const level = one(exam?.level);
      const sessionLevel = normalizeCambridgeLevel(session.level_name);
      const examLevel = normalizeCambridgeLevel(level?.name);
      const partType = part?.part_type as CambridgeExamPartType | undefined;
      const allowed = partType ? RESOURCE_ORDER[partType] : undefined;
      const exactLinkValid =
        Boolean(part && exam && allowed) && sessionLevel === examLevel;

      if (!exactLinkValid || !partType || !allowed) {
        const isListening = /listening/i.test(String(session.activity_type || ""));
        const legacyResources = session.cambridge_exam_part_id
          ? [
              { resource_type: "paper", label: "Question Paper", url: null },
              ...(isListening
                ? [{ resource_type: "audio", label: "Audio", url: null }]
                : []),
            ]
          : [
              { resource_type: "paper", label: "Question Paper", url: session.pdf_url || null },
              ...(isListening
                ? [{ resource_type: "audio", label: "Audio", url: session.audio_url || null }]
                : []),
              {
                resource_type: "key",
                label: isListening ? "Key & Transcript" : "Key",
                url: session.key_url || null,
              },
            ];

        return {
          id: session.id,
          session_date: session.session_date,
          start_time: session.start_time || "18:00:00",
          end_time: session.end_time || "19:00:00",
          level_name: sessionLevel,
          activity_type: session.activity_type,
          exam_part: session.exam_part || null,
          note: session.note || null,
          exam_bank: null,
          scoring_links: (
            scoringLinksByLevel.get(normalizeCambridgeLevel(session.level_name)) ||
            []
          ).map((link) => ({
            ...link,
            href: `${link.href}&friday_session_id=${encodeURIComponent(String(session.id))}`,
          })),
          resources: legacyResources,
          resources_linked: false,
        };
      }

      const availableByType = new Map(
        (resourcesByPart.get(partId) || []).map((resource) => [
          resource.resource_type,
          resource.external_url,
        ])
      );
      const resources = allowed.map((resourceType) => ({
        resource_type: resourceType,
        label:
          partType === "listening" && resourceType === "key"
            ? "Key & Transcript"
            : RESOURCE_LABELS[resourceType],
        url: availableByType.get(resourceType) || null,
      }));

      return {
        id: session.id,
        session_date: session.session_date,
        start_time: session.start_time || "18:00:00",
        end_time: session.end_time || "19:00:00",
        level_name: sessionLevel,
        activity_type: session.activity_type,
        exam_part: session.exam_part || null,
        note: session.note || null,
        exam_bank: {
          exam_number: exam.exam_number,
          exam_title: exam.title || null,
          part_type: partType,
          part_label: getExamPartLabel(sessionLevel, partType),
        },
        scoring_links: (scoringLinksByLevel.get(sessionLevel) || []).map((link) => ({
          ...link,
          href: `${link.href}&friday_session_id=${encodeURIComponent(String(session.id))}`,
        })),
        resources,
        resources_linked: true,
      };
    });

    return NextResponse.json({
      notices,
      duty: duty ? { ...duty, tutorial_group: tutorialGroup } : null,
      duty_reminder: dutyReminder,
      teacher_material_reminders: teacherMaterialReminders,
      school_closed: false,
    });
  } catch {
    return jsonError("Unable to load Friday Tutorial notices.", 500);
  }
}
