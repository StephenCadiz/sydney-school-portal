import { NextRequest, NextResponse } from "next/server";

import {
  CambridgeExamPartType,
  CambridgeExamResourceType,
  getExamPartLabel,
} from "../../../../lib/cambridgeExamBank";
import { normalizeCambridgeLevel } from "../../../../lib/fridayTutorialResults";
import {
  getFridayTutorialSessionTypeForDate,
  isB1FridayTutorialSession,
} from "../../../../lib/fridayTutorialRotation";
import {
  loadEffectiveFridayTutorialDutyForDate,
  loadFridayTutorialRotationContext,
} from "../../../../lib/fridayTutorialRotationServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getSchoolClosureForDate } from "../../../../lib/schoolClosuresServer";

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

  return { userId: user.id, response: null };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireTeacherOrAdmin(request);
    if (actor.response) return actor.response;

    const today = getMadridDateString();
    const closure = await getSchoolClosureForDate(today);
    if (closure) {
      return NextResponse.json({ notices: [], duty: null, school_closed: true, closure });
    }
    const rotation = await loadFridayTutorialRotationContext({ endDate: today });
    const tutorialGroup = getFridayTutorialSessionTypeForDate(
      rotation.settings || {},
      today,
      rotation.closures
    );
    if (!tutorialGroup) {
      return NextResponse.json({ notices: [], duty: null, school_closed: false });
    }

    const [{ data: sessions, error: sessionError }, duty] =
      await Promise.all([
        supabaseAdmin
          .from("friday_exam_practice_sessions")
          .select(
            "id, session_date, level_name, activity_type, exam_part, note, active, cambridge_exam_part_id, pdf_url, audio_url, key_url"
          )
          .eq("active", true)
          .eq("session_date", today)
          .order("level_name", { ascending: true })
          .order("activity_type", { ascending: true }),
        loadEffectiveFridayTutorialDutyForDate(today),
      ]);

    if (sessionError) {
      return jsonError("Unable to load Friday Tutorial notices.", 500);
    }
    const visibleSessions = (sessions || []).filter(
      (session) =>
        normalizeCambridgeLevel(session.level_name) !== "B1" ||
        isB1FridayTutorialSession(tutorialGroup)
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
        const legacyResources = session.cambridge_exam_part_id
          ? []
          : [
              session.pdf_url
                ? {
                    resource_type: "paper",
                    label: "Question Paper",
                    url: session.pdf_url,
                  }
                : null,
              session.audio_url
                ? {
                    resource_type: "audio",
                    label: "Audio",
                    url: session.audio_url,
                  }
                : null,
              session.key_url
                ? {
                    resource_type: "key",
                    label:
                      normalizeCambridgeLevel(session.activity_type) ===
                      "LISTENING"
                        ? "Key & Transcript"
                        : "Key",
                    url: session.key_url,
                  }
                : null,
            ].filter(Boolean);

        return {
          id: session.id,
          session_date: session.session_date,
          level_name: sessionLevel,
          activity_type: session.activity_type,
          exam_part: session.exam_part || null,
          note: session.note || null,
          exam_bank: null,
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
        resources,
        resources_linked: true,
      };
    });

    return NextResponse.json({
      notices,
      duty: duty ? { ...duty, tutorial_group: tutorialGroup } : null,
      school_closed: false,
    });
  } catch {
    return jsonError("Unable to load Friday Tutorial notices.", 500);
  }
}
