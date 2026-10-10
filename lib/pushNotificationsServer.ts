import "server-only";

import webpush from "web-push";
import { NextRequest } from "next/server";
import { resolveProfileIdForAuthUser } from "./cambridgeStudentAccessServer";
import { supabaseAdmin } from "./supabaseAdmin";

export type PortalRole = "teacher" | "student" | "admin";
export type PushSubscriptionRecord = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

function vapidReady() {
  const subject = process.env.PUSH_VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch (error: any) {
    console.error("Portal push configuration unavailable:", {
      stage: "vapid-config",
      message: error?.message || null,
      code: error?.code || null,
    });
    return false;
  }
}

export function pushPublicKey() {
  return process.env.NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY || "";
}

export function tokenFromRequest(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function authenticatePortalActor(token: string) {
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const authUser = data.user;
  let profileId = authUser.id;
  const { data: direct } = await supabaseAdmin
    .from("profiles")
    .select("id, role, active, email")
    .eq("id", authUser.id)
    .maybeSingle();
  let profile = direct;
  if (!profile && authUser.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("profiles")
      .select("id, role, active, email")
      .ilike("email", authUser.email)
      .limit(2);
    if ((byEmail || []).length === 1) profile = byEmail![0];
  }
  if (profile?.role === "student") {
    try { profileId = await resolveProfileIdForAuthUser(authUser.id); } catch { return null; }
  }
  if (!profile || (profile.role !== "teacher" && profile.role !== "student" && profile.role !== "admin") || profile.active === false) return null;
  return { authUserId: authUser.id, profileId, role: profile.role as PortalRole };
}

export async function savePushSubscription(actor: { profileId: string; role: PortalRole }, subscription: PushSubscriptionRecord, userAgent: string | null) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("A valid browser push subscription is required.");
  }
  const { error } = await supabaseAdmin.from("push_subscriptions").upsert({
    user_id: actor.profileId,
    role: actor.role,
    endpoint: subscription.endpoint,
    expiration_time: subscription.expirationTime ?? null,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    user_agent: userAgent,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,endpoint" });
  if (error) throw error;
}

export async function removePushSubscription(profileId: string, endpoint: string) {
  const { error } = await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", profileId).eq("endpoint", endpoint);
  if (error) throw error;
}

export type PushNotification = {
  eventKey: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Direct person-to-person messages are allowed outside automated quiet hours. */
  deliveryPolicy?: "automated" | "direct_message";
};

export type PushDeliveryResult = {
  sent: number;
  skipped: boolean;
  queued?: number;
  reason?:
    | "vapid_not_configured"
    | "subscription_store_unavailable"
    | "delivery_failed"
    | "no_subscriptions"
    | "queued"
    | "queue_unavailable";
};

type PushDeliveryOptions = {
  bypassAutomatedQuietHours?: boolean;
};

const madridDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function madridParts(value: Date) {
  const parts = Object.fromEntries(
    madridDateTimeFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function utcForMadridLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
) {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const displayed = madridParts(new Date(naiveUtc));
  const displayedAsUtc = Date.UTC(
    displayed.year,
    displayed.month - 1,
    displayed.day,
    displayed.hour,
    displayed.minute
  );
  return new Date(naiveUtc - (displayedAsUtc - naiveUtc));
}

export function automatedStudentPushAvailable(now = new Date()) {
  const { hour, minute } = madridParts(now);
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 10 * 60 && totalMinutes < 22 * 60;
}

export function nextAutomatedStudentPushWindow(now = new Date()) {
  if (automatedStudentPushAvailable(now)) return now;

  const current = madridParts(now);
  const nextLocalDay = new Date(
    Date.UTC(
      current.year,
      current.month - 1,
      current.day + (current.hour * 60 + current.minute >= 22 * 60 ? 1 : 0)
    )
  );
  const targetDay = madridParts(nextLocalDay);
  return utcForMadridLocal(targetDay.year, targetDay.month, targetDay.day, 10, 0);
}

async function queueAutomatedStudentPushes(
  subscriptions: Array<{ user_id: string }>,
  notification: PushNotification,
  availableAt: Date
) {
  const userIds = Array.from(new Set(subscriptions.map((subscription) => String(subscription.user_id))));
  if (!userIds.length) return { queued: 0, error: null };

  const { error } = await supabaseAdmin.from("push_notification_queue").upsert(
    userIds.map((userId) => ({
      user_id: userId,
      event_key: notification.eventKey,
      title: notification.title,
      body: notification.body,
      url: notification.url || "/",
      tag: notification.tag || notification.eventKey,
      available_at: availableAt.toISOString(),
    })),
    { onConflict: "user_id,event_key", ignoreDuplicates: true }
  );

  return { queued: error ? 0 : userIds.length, error };
}

async function deliverPortalPushNow(
  recipientProfileIds: string[],
  notification: PushNotification,
  options: PushDeliveryOptions = {}
) {
  if (!recipientProfileIds.length) return { sent: 0, skipped: true, reason: "no_subscriptions" } satisfies PushDeliveryResult;
  if (!vapidReady()) return { sent: 0, skipped: true, reason: "vapid_not_configured" } satisfies PushDeliveryResult;
  let sent = 0;
  try {
    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id, role, endpoint, expiration_time, p256dh, auth")
      .in("user_id", recipientProfileIds);
    if (error) {
      console.error("Portal push delivery unavailable:", {
        stage: "subscription-lookup",
        message: error.message || null,
        code: error.code || null,
        details: error.details || null,
        hint: error.hint || null,
        recipientCount: recipientProfileIds.length,
      });
      return { sent: 0, skipped: true, reason: "subscription_store_unavailable" } satisfies PushDeliveryResult;
    }
    if (!subscriptions?.length) return { sent: 0, skipped: true, reason: "no_subscriptions" } satisfies PushDeliveryResult;

    const automatedStudentPush = notification.deliveryPolicy !== "direct_message";
    const shouldQueue =
      automatedStudentPush &&
      !options.bypassAutomatedQuietHours &&
      !automatedStudentPushAvailable();
    let queued = 0;
    let subscriptionsToDeliver = subscriptions || [];
    if (shouldQueue) {
      const studentSubscriptions = subscriptionsToDeliver.filter(
        (subscription) => String(subscription.role || "") === "student"
      );
      if (studentSubscriptions.length) {
        const queuedResult = await queueAutomatedStudentPushes(
          studentSubscriptions,
          notification,
          nextAutomatedStudentPushWindow()
        );
        if (queuedResult.error) {
          console.error("Portal push queue unavailable:", {
            stage: "queue-insert",
            message: queuedResult.error.message || null,
            code: queuedResult.error.code || null,
            details: queuedResult.error.details || null,
            hint: queuedResult.error.hint || null,
            recipientCount: studentSubscriptions.length,
          });
          return { sent: 0, skipped: true, reason: "queue_unavailable" } satisfies PushDeliveryResult;
        }
        queued = queuedResult.queued;
        const queuedUserIds = new Set(studentSubscriptions.map((subscription) => String(subscription.user_id)));
        subscriptionsToDeliver = subscriptionsToDeliver.filter(
          (subscription) => !queuedUserIds.has(String(subscription.user_id))
        );
      }
    }

    for (const subscription of subscriptionsToDeliver) {
      const { data: delivery, error: deliveryError } = await supabaseAdmin
        .from("push_notification_deliveries")
        .insert({ subscription_id: subscription.id, user_id: subscription.user_id, event_key: notification.eventKey })
        .select("id")
        .maybeSingle();
      if (deliveryError?.code === "23505") continue;
      if (deliveryError) {
        console.error("Portal push delivery unavailable:", {
          stage: "delivery-record",
          message: deliveryError.message || null,
          code: deliveryError.code || null,
          details: deliveryError.details || null,
          hint: deliveryError.hint || null,
        });
        continue;
      }
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, expirationTime: subscription.expiration_time, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
          title: notification.title,
          body: notification.body,
          icon: "/LOGO.png",
          badge: "/LOGO.png",
          url: notification.url || "/",
          tag: notification.tag || notification.eventKey,
        }));
        sent += 1;
        await supabaseAdmin.from("push_notification_deliveries").update({ delivered_at: new Date().toISOString() }).eq("id", delivery?.id);
      } catch (error: any) {
        console.error("Portal push delivery failed:", {
          stage: "provider-delivery",
          message: error?.message || null,
          code: error?.code || null,
          statusCode: error?.statusCode || null,
        });
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", subscription.id);
        } else {
          await supabaseAdmin.from("push_notification_deliveries").delete().eq("id", delivery?.id);
        }
      }
    }
    if (queued > 0 && sent === 0) {
      return { sent: 0, queued, skipped: true, reason: "queued" } satisfies PushDeliveryResult;
    }
    return { sent, queued, skipped: sent === 0, ...(sent === 0 ? { reason: "delivery_failed" as const } : {}) } satisfies PushDeliveryResult;
  } catch (error: any) {
    console.error("Portal push delivery unavailable:", {
      stage: "unexpected",
      message: error?.message || null,
      code: error?.code || null,
      details: error?.details || null,
      hint: error?.hint || null,
      recipientCount: recipientProfileIds.length,
    });
    return { sent, skipped: true, reason: "delivery_failed" } satisfies PushDeliveryResult;
  }
}

export async function sendPortalPush(
  recipientProfileIds: string[],
  notification: PushNotification,
  options: PushDeliveryOptions = {}
) {
  if (options.bypassAutomatedQuietHours) {
    return deliverPortalPushNow(recipientProfileIds, notification, options);
  }
  return deliverPortalPushNow(recipientProfileIds, notification, options);
}

export async function flushQueuedAutomatedStudentPushes(limit = 100) {
  if (!automatedStudentPushAvailable()) return { processed: 0, sent: 0, remaining: 0 };

  const { data: queued, error } = await supabaseAdmin
    .from("push_notification_queue")
    .select("id, user_id, event_key, title, body, url, tag")
    .is("sent_at", null)
    .lte("available_at", new Date().toISOString())
    .order("available_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw error;

  let sent = 0;
  for (const item of queued || []) {
    const result = await deliverPortalPushNow(
      [String(item.user_id)],
      {
        eventKey: String(item.event_key),
        title: String(item.title),
        body: String(item.body),
        url: String(item.url || "/"),
        tag: String(item.tag || item.event_key),
        deliveryPolicy: "automated",
      },
      { bypassAutomatedQuietHours: true }
    );
    if (result.sent > 0) {
      sent += result.sent;
      await supabaseAdmin
        .from("push_notification_queue")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", item.id)
        .is("sent_at", null);
    }
  }

  return {
    processed: (queued || []).length,
    sent,
    remaining: Math.max(0, (queued || []).length - sent),
  };
}
