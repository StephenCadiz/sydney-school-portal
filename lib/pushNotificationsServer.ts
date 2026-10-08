import "server-only";

import webpush from "web-push";
import { NextRequest } from "next/server";
import { resolveProfileIdForAuthUser } from "./cambridgeStudentAccessServer";
import { supabaseAdmin } from "./supabaseAdmin";

export type PortalRole = "teacher" | "student";
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
  if (!profile || (profile.role !== "teacher" && profile.role !== "student") || profile.active === false) return null;
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
};

export type PushDeliveryResult = {
  sent: number;
  skipped: boolean;
  reason?: "vapid_not_configured" | "subscription_store_unavailable" | "delivery_failed" | "no_subscriptions";
};

export async function sendPortalPush(recipientProfileIds: string[], notification: PushNotification) {
  if (!recipientProfileIds.length) return { sent: 0, skipped: true, reason: "no_subscriptions" } satisfies PushDeliveryResult;
  if (!vapidReady()) return { sent: 0, skipped: true, reason: "vapid_not_configured" } satisfies PushDeliveryResult;
  let sent = 0;
  try {
    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, expiration_time, p256dh, auth")
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
    for (const subscription of subscriptions || []) {
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
    return { sent, skipped: sent === 0, ...(sent === 0 ? { reason: "delivery_failed" as const } : {}) } satisfies PushDeliveryResult;
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
