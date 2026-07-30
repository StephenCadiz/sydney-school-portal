import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_LIMIT = 50;
const DEALT_LIMIT = 25;

function logWorkQueueError(stage: string, error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};

  console.error("Admin message work queue failure:", {
    stage,
    name: value.name,
    message: value.message,
    code: value.code,
    details: value.details,
    hint: value.hint,
    status: value.status,
    error,
  });
}

function inboxScope(userId: string) {
  return `receiver_id.eq.${userId},recipient_group.eq.admin`;
}

function getProfileName(profile: any, fallback: string) {
  const name = `${profile?.first_name || ""} ${
    profile?.last_name || ""
  }`.trim();
  return name || fallback;
}

function isMissingDealtWithColumn(error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};

  return (
    value.code === "42703" &&
    typeof value.message === "string" &&
    value.message.includes("dealt_with_at")
  );
}

async function enrichMessages(messages: any[]) {
  const profileIds = Array.from(
    new Set(
      messages
        .flatMap((message) => [
          message.sender_id,
          message.dealt_with_by,
        ])
        .filter(
          (id): id is string =>
            typeof id === "string" && UUID_PATTERN.test(id)
        )
    )
  );

  const { data: profiles, error } = profileIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, role")
        .in("id", profileIds)
    : { data: [], error: null };

  if (error) {
    return { messages: null, error };
  }

  const profilesById = new Map(
    (profiles || []).map((profile) => [profile.id, profile])
  );

  return {
    messages: messages.map((message) => {
    const sender = profilesById.get(message.sender_id);
    const dealtWithAdmin = profilesById.get(message.dealt_with_by);

    return {
      ...message,
      sender_name: getProfileName(sender, "Unknown sender"),
      sender_role: sender?.role || "",
      dealt_with_by_name: message.dealt_with_at
        ? getProfileName(dealtWithAdmin, "Admin")
        : null,
    };
    }),
    error: null,
  };
}

async function getCounts(userId: string) {
  const base = () =>
    supabaseAdmin
      .from("messages")
      .select("id", { count: "exact" })
      .or(inboxScope(userId))
      .limit(1);

  const activeResult = await base().is("dealt_with_at", null);
  if (activeResult.error) {
    return {
      counts: null,
      error: activeResult.error,
      stage: "active-count",
    };
  }

  const dealtResult = await base().not("dealt_with_at", "is", null);
  if (dealtResult.error) {
    return {
      counts: null,
      error: dealtResult.error,
      stage: "dealt-count",
    };
  }

  return {
    counts: {
      active: activeResult.count || 0,
      dealt: dealtResult.count || 0,
    },
    error: null,
    stage: null,
  };
}

async function getLegacyQueue(
  userId: string,
  status: string | null,
  countError: unknown
) {
  logWorkQueueError("schema-compatibility", countError);

  const countResult = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact" })
    .or(inboxScope(userId))
    .limit(1);
  if (countResult.error) {
    logWorkQueueError("legacy-active-count", countResult.error);
    return { response: examBankJsonError("Unable to load Admin messages.", 500) };
  }

  const counts = { active: countResult.count || 0, dealt: 0 };
  if (status === "dealt") {
    return {
      response: NextResponse.json({
        counts,
        dealt_messages: [],
        dealt_has_more: false,
      }),
    };
  }

  const listResult = await supabaseAdmin
    .from("messages")
    .select("*")
    .or(inboxScope(userId))
    .order("created_at", { ascending: false })
    .limit(ACTIVE_LIMIT);
  if (listResult.error) {
    logWorkQueueError("legacy-active-messages-query", listResult.error);
    return { response: examBankJsonError("Unable to load Admin messages.", 500) };
  }

  const enriched = await enrichMessages(listResult.data || []);
  if (enriched.error || !enriched.messages) {
    logWorkQueueError("legacy-profile-enrichment", enriched.error);
    return { response: examBankJsonError("Unable to load Admin messages.", 500) };
  }

  return {
    response: NextResponse.json({
      counts,
      active_messages: enriched.messages,
      dealt_messages: [],
      dealt_has_more: false,
      resolution_status_available: false,
    }),
  };
}

export async function GET(request: NextRequest) {
  let admin: Awaited<ReturnType<typeof requireExamBankAdmin>>;

  try {
    admin = await requireExamBankAdmin(request);
  } catch (error) {
    logWorkQueueError("admin-authentication", error);
    return examBankJsonError("Unable to verify Admin access.", 500);
  }

  if (admin.response) return admin.response;

  try {
    const status = request.nextUrl.searchParams.get("status");
    const offsetValue = Number(request.nextUrl.searchParams.get("offset") || 0);
    const offset =
      Number.isInteger(offsetValue) && offsetValue >= 0 ? offsetValue : 0;

    if (status && status !== "dealt") {
      return examBankJsonError("Invalid message status filter.", 400);
    }

    const countResult = await getCounts(admin.userId);
    if (countResult.error || !countResult.counts) {
      if (isMissingDealtWithColumn(countResult.error)) {
        const legacy = await getLegacyQueue(
          admin.userId,
          status,
          countResult.error
        );
        return legacy.response;
      }

      logWorkQueueError(
        countResult.stage || "message-counts",
        countResult.error
      );
      return examBankJsonError("Unable to load Admin messages.", 500);
    }

    if (status === "dealt") {
      const { data, error } = await supabaseAdmin
        .from("messages")
        .select("*")
        .or(inboxScope(admin.userId))
        .not("dealt_with_at", "is", null)
        .order("dealt_with_at", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + DEALT_LIMIT - 1);

      if (error) {
        logWorkQueueError("dealt-messages-query", error);
        return examBankJsonError("Unable to load Admin messages.", 500);
      }

      const enriched = await enrichMessages(data || []);
      if (enriched.error || !enriched.messages) {
        logWorkQueueError("profile-enrichment", enriched.error);
        return examBankJsonError("Unable to load Admin messages.", 500);
      }

      return NextResponse.json({
        counts: countResult.counts,
        dealt_messages: enriched.messages,
        dealt_has_more: (data || []).length === DEALT_LIMIT,
      });
    }

    const activeResult = await supabaseAdmin
      .from("messages")
      .select("*")
      .or(inboxScope(admin.userId))
      .is("dealt_with_at", null)
      .order("created_at", { ascending: false })
      .limit(ACTIVE_LIMIT);
    if (activeResult.error) {
      logWorkQueueError("active-messages-query", activeResult.error);
      return examBankJsonError("Unable to load Admin messages.", 500);
    }

    const dealtResult = await supabaseAdmin
      .from("messages")
      .select("*")
      .or(inboxScope(admin.userId))
      .not("dealt_with_at", "is", null)
      .order("dealt_with_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(DEALT_LIMIT);
    if (dealtResult.error) {
      logWorkQueueError("dealt-messages-query", dealtResult.error);
      return examBankJsonError("Unable to load Admin messages.", 500);
    }

    const activeEnrichment = await enrichMessages(activeResult.data || []);
    if (activeEnrichment.error || !activeEnrichment.messages) {
      logWorkQueueError("active-profile-enrichment", activeEnrichment.error);
      return examBankJsonError("Unable to load Admin messages.", 500);
    }

    const dealtEnrichment = await enrichMessages(dealtResult.data || []);
    if (dealtEnrichment.error || !dealtEnrichment.messages) {
      logWorkQueueError("dealt-profile-enrichment", dealtEnrichment.error);
      return examBankJsonError("Unable to load Admin messages.", 500);
    }

    return NextResponse.json({
      counts: countResult.counts,
      active_messages: activeEnrichment.messages,
      dealt_messages: dealtEnrichment.messages,
      dealt_has_more: (dealtResult.data || []).length === DEALT_LIMIT,
    });
  } catch (error) {
    logWorkQueueError("unexpected-get-failure", error);
    return examBankJsonError("Unable to load Admin messages.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    let admin: Awaited<ReturnType<typeof requireExamBankAdmin>>;
    try {
      admin = await requireExamBankAdmin(request);
    } catch (error) {
      logWorkQueueError("patch-admin-authentication", error);
      return examBankJsonError("Unable to verify Admin access.", 500);
    }
    if (admin.response) return admin.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return examBankJsonError("Invalid JSON request body.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return examBankJsonError("Invalid message status request.", 400);
    }

    const record = body as Record<string, unknown>;
    if (
      Object.keys(record).some(
        (key) => key !== "message_id" && key !== "action"
      )
    ) {
      return examBankJsonError("The request contains unsupported fields.", 400);
    }

    const messageId = String(record.message_id || "");
    const action = record.action;
    if (
      !UUID_PATTERN.test(messageId) ||
      (action !== "dealt" && action !== "restore")
    ) {
      return examBankJsonError("Invalid message status request.", 400);
    }

    const { data: message, error: lookupError } = await supabaseAdmin
      .from("messages")
      .select("id, receiver_id, recipient_group")
      .eq("id", messageId)
      .or(inboxScope(admin.userId))
      .maybeSingle();

    if (lookupError) {
      logWorkQueueError("status-message-lookup", lookupError);
      return examBankJsonError("Unable to update the message status.", 500);
    }
    if (!message) {
      return examBankJsonError("Admin message not found.", 404);
    }

    const updates =
      action === "dealt"
        ? {
            dealt_with_at: new Date().toISOString(),
            dealt_with_by: admin.userId,
          }
        : {
            dealt_with_at: null,
            dealt_with_by: null,
          };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("messages")
      .update(updates)
      .eq("id", messageId)
      .select("*")
      .single();

    if (updateError) {
      logWorkQueueError("status-message-update", updateError);
      return examBankJsonError("Unable to update the message status.", 500);
    }

    const enriched = await enrichMessages([updated]);
    if (enriched.error || !enriched.messages) {
      logWorkQueueError("status-profile-enrichment", enriched.error);
      return examBankJsonError("Unable to update the message status.", 500);
    }

    return NextResponse.json({ message: enriched.messages[0] });
  } catch (error) {
    logWorkQueueError("unexpected-patch-failure", error);
    return examBankJsonError("Unable to update the message status.", 500);
  }
}
