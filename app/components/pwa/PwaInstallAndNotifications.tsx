"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type InstallPromptEvent = Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: "accepted" | "dismissed" }> };

function isPortalPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/teacher" || window.location.pathname.startsWith("/teacher/") || window.location.pathname === "/student" || window.location.pathname.startsWith("/student/");
}

function base64ToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export default function PwaInstallAndNotifications() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [pushState, setPushState] = useState<"idle" | "enabled" | "unavailable" | "denied" | "saving">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isPortalPath()) return;
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest.webmanifest";
      document.head.appendChild(link);
    }
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
      try { if (localStorage.getItem("sydney-school-pwa-install-dismissed") !== "1") setShowInstall(true); } catch { setShowInstall(true); }
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    const dismissed = (() => { try { return localStorage.getItem("sydney-school-pwa-install-dismissed") === "1"; } catch { return false; } })();
    if (!dismissed && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches) setShowInstall(true);
    if (!("Notification" in window) || !("PushManager" in window)) setPushState("unavailable");
    else void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => { if (subscription) setPushState("enabled"); }).catch(() => undefined);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  async function install() {
    if (!installEvent?.prompt) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice?.outcome !== "accepted") dismissInstall();
    else setShowInstall(false);
  }

  function dismissInstall() {
    setShowInstall(false);
    try { localStorage.setItem("sydney-school-pwa-install-dismissed", "1"); } catch { /* best effort */ }
  }

  async function enablePush() {
    if (!("serviceWorker" in navigator) || !("Notification" in window) || !("PushManager" in window)) { setPushState("unavailable"); return; }
    setPushState("saving"); setMessage("");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setPushState("denied"); setMessage("Notifications are disabled. You can enable them in your browser settings."); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setPushState("denied"); setMessage("Your session has expired. Sign in again to enable notifications."); return; }
    const keyResponse = await fetch("/api/push/public-key", { cache: "no-store" });
    const keyPayload = await keyResponse.json().catch(() => ({}));
    if (!keyResponse.ok || !keyPayload.publicKey) { setPushState("unavailable"); setMessage("Push notifications are not configured on this device yet."); return; }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(keyPayload.publicKey) });
    const response = await fetch("/api/push/subscription", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
    if (!response.ok) { setPushState("denied"); setMessage((await response.json().catch(() => ({}))).error || "Unable to save notification settings."); return; }
    setPushState("enabled"); setMessage("Push notifications are enabled on this device.");
  }

  async function disablePush() {
    if (!("serviceWorker" in navigator)) return;
    setPushState("saving"); setMessage("");
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) { setPushState("idle"); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await fetch("/api/push/subscription", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
    }
    await subscription.unsubscribe();
    setPushState("idle"); setMessage("Push notifications are disabled on this device.");
  }

  if (!isPortalPath()) return null;
  return (
    <>
      {showInstall && (
        <aside className="pwa-install-card" aria-label="Install Sydney School Portal">
          <div><strong>Install Sydney School</strong><p>Get quick access to your portal from this device.</p></div>
          <div className="pwa-install-actions">
            {installEvent?.prompt ? <button type="button" onClick={() => void install()}>Install</button> : <span className="pwa-install-help">Use your browser&apos;s Add to Home Screen option.</span>}
            <button type="button" className="is-secondary" onClick={dismissInstall}>Not now</button>
          </div>
        </aside>
      )}
      <aside className="pwa-notification-control" aria-label="Notification settings">
        <div><strong>Portal notifications</strong><span>Messages, reminders and class updates</span></div>
        {pushState === "enabled" ? <><span className="pwa-notification-status">Enabled</span><button type="button" className="is-secondary" onClick={() => void disablePush()}>Disable</button></> : <button type="button" onClick={() => void enablePush()} disabled={pushState === "saving"}>{pushState === "saving" ? "Saving…" : "Enable notifications"}</button>}
        {message && <p role="status">{message}</p>}
      </aside>
    </>
  );
}
