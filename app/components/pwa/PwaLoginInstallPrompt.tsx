"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt?: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "windows" | "macos" | "other";

function isStandalone() {
  if (typeof window === "undefined") return false;

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function getPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";

  const userAgent = navigator.userAgent.toLowerCase();
  const isIpad =
    userAgent.includes("ipad") ||
    (userAgent.includes("macintosh") && navigator.maxTouchPoints > 1);

  if (isIpad || /iphone|ipod/.test(userAgent)) return "ios";
  if (userAgent.includes("android")) return "android";
  if (userAgent.includes("windows")) return "windows";
  if (userAgent.includes("macintosh") || userAgent.includes("mac os x")) {
    return "macos";
  }

  return "other";
}

function installationInstructions(platform: Platform) {
  switch (platform) {
    case "ios":
      return "Tap Share, then Add to Home Screen.";
    case "android":
      return "Open your browser menu and choose Install app or Add to Home screen.";
    case "windows":
    case "macos":
      return "Use the install icon in the address bar or your browser menu.";
    default:
      return "Use your browser's Install app or Add to Home screen option.";
  }
}

export default function PwaLoginInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>("other");
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    setPlatform(getPlatform());

    try {
      if (localStorage.getItem("sydney-school-login-install-dismissed") === "1") {
        return;
      }
    } catch {
      // Continue if storage is unavailable.
    }

    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
      setShowInstall(true);
    };

    window.addEventListener("beforeinstallprompt", onInstall);

    // iOS/iPadOS does not expose beforeinstallprompt, so show its guidance
    // immediately. Other browsers receive the same guidance until the native
    // install event is available.
    setShowInstall(true);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  async function install() {
    if (!installEvent?.prompt) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice?.outcome === "accepted") {
      setShowInstall(false);
    }
    setInstallEvent(null);
  }

  function dismiss() {
    setShowInstall(false);
    try {
      localStorage.setItem("sydney-school-login-install-dismissed", "1");
    } catch {
      // Best effort only.
    }
  }

  if (!showInstall || isStandalone()) return null;

  return (
    <aside className="auth-install-card" aria-label="Install Sydney School app">
      <div className="auth-install-card-copy">
        <strong>Install Sydney School</strong>
        <span>Keep the portal one tap away on this device.</span>
        <small>{installationInstructions(platform)}</small>
      </div>
      <div className="auth-install-card-actions">
        {installEvent?.prompt && (
          <button type="button" onClick={() => void install()}>
            Install app
          </button>
        )}
        <button type="button" className="is-secondary" onClick={dismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}
