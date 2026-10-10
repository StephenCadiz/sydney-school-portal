"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";

type PushState = "checking" | "enabled" | "idle" | "unavailable" | "denied" | "saving";

function base64ToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(value: ArrayBuffer | ArrayBufferView | null | undefined) {
  if (!value) return "";
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function subscriptionMatchesKey(subscription: PushSubscription, publicKey: string) {
  const registeredKey = subscription.options?.applicationServerKey;
  if (registeredKey) return bytesToBase64Url(registeredKey) === publicKey;
  try {
    return localStorage.getItem("sydney-school-push-vapid-key") === publicKey;
  } catch {
    return false;
  }
}

export default function PwaNotificationToggle() {
  const [state, setState] = useState<PushState>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
      setState("unavailable");
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => registration.update())
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          setState("idle");
          return;
        }
        const keyResponse = await fetch("/api/push/public-key", { cache: "no-store" });
        const keyPayload = await keyResponse.json().catch(() => ({}));
        setState(
          keyResponse.ok && keyPayload.publicKey && subscriptionMatchesKey(subscription, keyPayload.publicKey)
            ? "enabled"
            : "idle"
        );
      })
      .catch(() => setState("unavailable"));
  }, []);

  async function enable() {
    if (state === "saving") return;
    setState("saving");
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        setMessage("Notifications are disabled. You can enable them in your device settings.");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setState("denied");
        setMessage("Your session has expired. Sign in again to enable notifications.");
        return;
      }

      const keyResponse = await fetch("/api/push/public-key", { cache: "no-store" });
      const keyPayload = await keyResponse.json().catch(() => ({}));
      if (!keyResponse.ok || !keyPayload.publicKey) {
        setState("unavailable");
        setMessage("Push notifications are not configured on this device yet.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !subscriptionMatchesKey(subscription, keyPayload.publicKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToBytes(keyPayload.publicKey),
        });
      }

      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!response.ok) {
        setState("denied");
        setMessage((await response.json().catch(() => ({}))).error || "Unable to save notification settings.");
        return;
      }

      try { localStorage.setItem("sydney-school-push-vapid-key", keyPayload.publicKey); } catch { /* best effort */ }
      setState("enabled");
      setMessage("Push notifications are enabled on this device.");
    } catch {
      setState("unavailable");
      setMessage("This installed app could not register for push notifications. Try again from the app.");
    }
  }

  async function disable() {
    if (state === "saving") return;
    setState("saving");
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await fetch("/api/push/subscription", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
        }
        await subscription.unsubscribe();
      }
      setState("idle");
      setMessage("Push notifications are disabled on this device.");
    } catch {
      setState("unavailable");
      setMessage("Unable to disable notifications. Try again.");
    }
  }

  const enabled = state === "enabled";
  const unavailable = state === "unavailable";

  return (
    <div className="student-pwa-setting-row" aria-label="Push Notifications">
      <div className="student-pwa-setting-copy">
        <strong>Push Notifications</strong>
        <span>Messages, reminders and class updates</span>
        {message && <small role="status">{message}</small>}
      </div>
      <button
        type="button"
        className={`student-pwa-setting-toggle${enabled ? " is-on" : ""}`}
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? "Disable Push Notifications" : "Enable Push Notifications"}
        onClick={() => void (enabled ? disable() : enable())}
        disabled={state === "checking" || state === "saving" || unavailable}
      >
        <span aria-hidden="true" />
        <span className="student-pwa-setting-toggle-label">{state === "checking" || state === "saving" ? "…" : enabled ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
