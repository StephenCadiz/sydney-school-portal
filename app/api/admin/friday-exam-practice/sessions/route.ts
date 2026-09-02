import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import {
  CAMBRIDGE_EXAM_PARTS,
  isDateOnly,
  isEligibleCambridgeExamLevel,
  isValidExternalUrl,
} from "../../../../../lib/cambridgeExamBank";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { getSchoolClosureForDate } from "../../../../../lib/schoolClosuresServer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function serializeSession(row: any) {
  const part = one(row?.exam_bank_part);
  const exam = one(part?.exam);
  const level = one(exam?.level);

  return {
    id: row.id,
    session_date: row.session_date,
    level_name: row.level_name,
    activity_type: row.activity_type,
    exam_part: row.exam_part,
    pdf_url: row.pdf_url,
    audio_url: row.audio_url,
    key_url: row.key_url,
    note: row.note,
    active: row.active,
    cambridge_exam_part_id: row.cambridge_exam_part_id,
    exam_bank: part
      ? {
          exam_id: exam?.id,
          exam_number: exam?.exam_number,
          exam_title: exam?.title || null,
          level_name: String(level?.name || "").trim().toUpperCase(),
          part_type: part.part_type,
        }
      : null,
  };
}

const sessionSelect = `
  id,
  session_date,
  level_name,
  activity_type,
  exam_part,
  pdf_url,
  audio_url,
  key_url,
  note,
  active,
  cambridge_exam_part_id,
  exam_bank_part:cambridge_exam_parts!friday_exam_practice_sessions_cambridge_exam_part_id_fkey (
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
  )
`;

async function validatePayload(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { value: null, error: "Invalid Friday Tutorial payload." };
  }

  const body = input as Record<string, unknown>;
  const allowed = new Set([
    "session_date",
    "level_name",
    "activity_type",
    "exam_part",
    "pdf_url",
    "audio_url",
    "key_url",
    "note",
    "active",
    "cambridge_exam_part_id",
  ]);

  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { value: null, error: "The request contains unsupported fields." };
  }

  const sessionDate = String(body.session_date || "").trim();
  const levelName = String(body.level_name || "").trim().toUpperCase();
  const activityType = String(body.activity_type || "").trim();
  const examPart = String(body.exam_part || "").trim();
  const partId = String(body.cambridge_exam_part_id || "").trim();
  const pdfUrl = String(body.pdf_url || "").trim();
  const audioUrl = String(body.audio_url || "").trim();
  const keyUrl = String(body.key_url || "").trim();
  const note = String(body.note || "").trim();

  if (!isDateOnly(sessionDate)) {
    return { value: null, error: "Choose a valid session date." };
  }
  const closure = await getSchoolClosureForDate(sessionDate);
  if (closure) {
    return {
      value: null,
      error: `School is closed on this date for ${closure.name}. No Friday Tutorial session is required.`,
    };
  }
  if (!isEligibleCambridgeExamLevel(levelName)) {
    return { value: null, error: "Level must be B1, B2, C1 or C2." };
  }
  if (!activityType) {
    return { value: null, error: "Choose an activity type." };
  }
  if (!examPart) {
    return { value: null, error: "Add the tutorial exam-part detail." };
  }
  if (!UUID_PATTERN.test(partId)) {
    return {
      value: null,
      error: "Choose the exact Exam Bank exam and part.",
    };
  }
  for (const [label, url] of [
    ["PDF", pdfUrl],
    ["Audio", audioUrl],
    ["Key", keyUrl],
  ] as const) {
    if (url && !isValidExternalUrl(url)) {
      return { value: null, error: `${label} link must be a valid URL.` };
    }
  }
  if (typeof body.active !== "boolean") {
    return { value: null, error: "Choose whether the tutorial is active." };
  }

  const { data: part, error: partError } = await supabaseAdmin
    .from("cambridge_exam_parts")
    .select(`
      id,
      part_type,
      exam:cambridge_exam_sets!cambridge_exam_parts_exam_set_id_fkey (
        id,
        active,
        archived_at,
        level:levels!cambridge_exam_sets_level_id_fkey (
          id,
          name
        )
      )
    `)
    .eq("id", partId)
    .maybeSingle();

  if (partError) {
    return { value: null, error: "Unable to verify the selected Exam Bank part." };
  }

  const exam = one(part?.exam);
  const level = one(exam?.level);
  if (
    !part ||
    !CAMBRIDGE_EXAM_PARTS.includes(part.part_type as any) ||
    exam?.active !== true ||
    exam?.archived_at ||
    String(level?.name || "").trim().toUpperCase() !== levelName
  ) {
    return {
      value: null,
      error:
        "The selected Exam Bank part is unavailable or does not match the tutorial level.",
    };
  }

  return {
    value: {
      session_date: sessionDate,
      level_name: levelName,
      activity_type: activityType,
      exam_part: examPart,
      pdf_url: pdfUrl || null,
      audio_url: audioUrl || null,
      key_url: keyUrl || null,
      note: note || null,
      active: body.active,
      cambridge_exam_part_id: partId,
    },
    error: null,
  };
}

async function ensureNoDuplicate(
  sessionDate: string,
  levelName: string,
  excludedId?: string
) {
  let query = supabaseAdmin
    .from("friday_exam_practice_sessions")
    .select("id")
    .eq("session_date", sessionDate)
    .eq("level_name", levelName)
    .limit(1);

  if (excludedId) query = query.neq("id", excludedId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    return examBankJsonError("Unable to validate the tutorial session.", 500);
  }
  if (data) {
    return examBankJsonError(
      "A Friday Tutorial session already exists for this date and level.",
      409
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  const { data, error } = await supabaseAdmin
    .from("friday_exam_practice_sessions")
    .select(sessionSelect)
    .order("session_date", { ascending: true })
    .order("level_name", { ascending: true });

  if (error) {
    return examBankJsonError("Unable to load Friday Tutorial sessions.", 500);
  }

  return NextResponse.json({ sessions: (data || []).map(serializeSession) });
}

export async function POST(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return examBankJsonError("Invalid JSON request body.", 400);
  }

  const validation = await validatePayload(body);
  if (!validation.value) {
    return examBankJsonError(validation.error, 422);
  }

  const duplicate = await ensureNoDuplicate(
    validation.value.session_date,
    validation.value.level_name
  );
  if (duplicate) return duplicate;

  const { data, error } = await supabaseAdmin
    .from("friday_exam_practice_sessions")
    .insert({ ...validation.value, created_by: admin.userId })
    .select(sessionSelect)
    .single();

  if (error) {
    return examBankJsonError("Unable to save the Friday Tutorial session.", 500);
  }

  return NextResponse.json({ session: serializeSession(data) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return examBankJsonError("Invalid JSON request body.", 400);
  }

  const record = body as Record<string, unknown>;
  const id = String(record?.id || "").trim();
  if (!UUID_PATTERN.test(id)) {
    return examBankJsonError("Choose a valid Friday Tutorial session.", 400);
  }

  const { id: _id, ...payload } = record;
  const validation = await validatePayload(payload);
  if (!validation.value) {
    return examBankJsonError(validation.error, 422);
  }

  const duplicate = await ensureNoDuplicate(
    validation.value.session_date,
    validation.value.level_name,
    id
  );
  if (duplicate) return duplicate;

  const { data, error } = await supabaseAdmin
    .from("friday_exam_practice_sessions")
    .update({ ...validation.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(sessionSelect)
    .maybeSingle();

  if (error) {
    return examBankJsonError("Unable to update the Friday Tutorial session.", 500);
  }
  if (!data) {
    return examBankJsonError("Friday Tutorial session not found.", 404);
  }

  return NextResponse.json({ session: serializeSession(data) });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return examBankJsonError("Invalid JSON request body.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return examBankJsonError("Invalid Friday Tutorial delete request.", 400);
  }

  const record = body as Record<string, unknown>;
  const allowed = new Set(["id", "delete_linked_results"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    return examBankJsonError("The request contains unsupported fields.", 400);
  }

  const id = String(record.id || "").trim();
  if (!UUID_PATTERN.test(id)) {
    return examBankJsonError("Choose a valid Friday Tutorial session.", 400);
  }

  if (
    record.delete_linked_results !== undefined &&
    typeof record.delete_linked_results !== "boolean"
  ) {
    return examBankJsonError("Invalid linked-results deletion confirmation.", 400);
  }

  const deleteLinkedResults = record.delete_linked_results === true;

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("friday_exam_practice_sessions")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (sessionError) {
    console.error("Friday Tutorial delete lookup failed:", sessionError);
    return examBankJsonError("Unable to verify the Friday Tutorial session.", 500);
  }
  if (!session) {
    return examBankJsonError("Friday Tutorial session not found.", 404);
  }

  const { count: linkedResultSheetCount, error: sheetCountError } =
    await supabaseAdmin
      .from("friday_tutorial_result_sheets")
      .select("id", { count: "exact", head: true })
      .eq("tutorial_session_id", id);

  if (sheetCountError) {
    console.error("Friday Tutorial result-sheet count failed:", sheetCountError);
    return examBankJsonError("Unable to verify submitted tutorial results.", 500);
  }

  const linkedResultSheets = linkedResultSheetCount || 0;
  if (linkedResultSheets > 0 && !deleteLinkedResults) {
    return NextResponse.json(
      {
        error:
          "This activity has submitted tutorial result sheets. Permanently deleting it will also delete all associated result sheets and student results. This cannot be undone.",
        requires_delete_linked_results: true,
        linked_result_sheet_count: linkedResultSheets,
      },
      { status: 409 }
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("friday_exam_practice_sessions")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("Friday Tutorial delete failed:", deleteError);
    return examBankJsonError("Unable to delete the Friday Tutorial session.", 500);
  }

  const { data: remainingSession, error: verificationError } =
    await supabaseAdmin
      .from("friday_exam_practice_sessions")
      .select("id")
      .eq("id", id)
      .maybeSingle();

  if (verificationError) {
    console.error("Friday Tutorial delete verification failed:", verificationError);
    return examBankJsonError("Unable to verify the Friday Tutorial deletion.", 500);
  }
  if (remainingSession) {
    console.error("Friday Tutorial session remained after deletion:", { id });
    return examBankJsonError("Unable to verify the Friday Tutorial deletion.", 500);
  }

  return NextResponse.json({
    deleted: true,
    deleted_linked_results: deleteLinkedResults && linkedResultSheets > 0,
    linked_result_sheet_count: linkedResultSheets,
  });
}
