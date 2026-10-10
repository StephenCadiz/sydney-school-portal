"use client";

import { Fingerprint, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";

import PwaNotificationToggle from "../../components/pwa/PwaNotificationToggle";
import { passkeyErrorMessage } from "../../../lib/passkeyErrors";
import { supabase } from "../../../lib/supabase";

type BiometricState = "checking" | "enabled" | "disabled" | "saving" | "unavailable";

function supportsBiometrics() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && "credentials" in navigator;
}

function biometricPreferenceKey(userId: string) {
  return `sydney-school-biometric-enabled:${userId}`;
}

function StudentBiometricToggle() {
  const [state, setState] = useState<BiometricState>("checking");
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    if (!supportsBiometrics()) {
      setState("unavailable");
      return;
    }

    let active = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        if (active) setState("unavailable");
        return;
      }
      const { data, error } = await supabase.auth.passkey.list();
      if (!active) return;
      if (error || !data?.length) {
        setUserId(session.user.id);
        setState("disabled");
        if (error) setMessage(passkeyErrorMessage(error, "registration"));
        return;
      }
      setUserId(session.user.id);
      let preference = "1";
      try { preference = localStorage.getItem(biometricPreferenceKey(session.user.id)) || "1"; } catch { /* best effort */ }
      setState(preference === "0" ? "disabled" : "enabled");
    })().catch(() => { if (active) setState("unavailable"); });

    return () => { active = false; };
  }, []);

  async function enable() {
    if (state === "saving" || !userId) return;
    setState("saving");
    setMessage("");
    try {
      const { data, error } = await supabase.auth.passkey.list();
      if (error || !data?.length) {
        const { error: registerError } = await supabase.auth.registerPasskey();
        if (registerError) {
          setState("disabled");
          setMessage(passkeyErrorMessage(registerError, "registration"));
          return;
        }
      }
      try { localStorage.setItem(biometricPreferenceKey(userId), "1"); } catch { /* best effort */ }
      setState("enabled");
      setMessage("Biometrics are enabled for sign-in after logout or session expiry.");
    } catch (error) {
      setState("disabled");
      setMessage(passkeyErrorMessage(error, "registration"));
    }
  }

  function disable() {
    if (!userId) return;
    try { localStorage.setItem(biometricPreferenceKey(userId), "0"); } catch { /* best effort */ }
    setState("disabled");
    setMessage("Biometrics are disabled. Your registered credential remains available if you enable them again.");
  }

  const enabled = state === "enabled";
  const unavailable = state === "unavailable";

  return (
    <div className="student-pwa-setting-row" aria-label="Biometrics">
      <div className="student-pwa-setting-copy">
        <strong><Fingerprint size={18} aria-hidden="true" /> Biometrics</strong>
        <span>Use Face ID or fingerprint after logout or session expiry</span>
        {message && <small role="status">{message}</small>}
      </div>
      <button
        type="button"
        className={`student-pwa-setting-toggle${enabled ? " is-on" : ""}`}
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? "Disable Biometrics" : "Enable Biometrics"}
        onClick={() => void (enabled ? disable() : enable())}
        disabled={state === "checking" || state === "saving" || unavailable}
      >
        <span aria-hidden="true" />
        <span className="student-pwa-setting-toggle-label">{state === "checking" || state === "saving" ? "…" : enabled ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export default function StudentPwaSettingsPage() {
  const [installedPwa, setInstalledPwa] = useState<boolean | null>(null);

  useEffect(() => setInstalledPwa(isStandalonePwa()), []);

  if (installedPwa === null) {
    return <main className="student-pwa-settings-page" aria-busy="true" />;
  }

  if (!installedPwa) {
    return (
      <main className="student-pwa-settings-page student-pwa-settings-browser-message">
        <p>Settings are available in the installed Student app.</p>
      </main>
    );
  }

  return (
    <main className="student-pwa-settings-page">
      <section className="student-pwa-settings-card" aria-labelledby="student-pwa-settings-title">
        <div className="student-pwa-settings-heading">
          <SettingsIcon size={22} aria-hidden="true" />
          <div>
            <span>Student app</span>
            <h1 id="student-pwa-settings-title">Settings</h1>
          </div>
        </div>
        <div className="student-pwa-settings-list">
          <PwaNotificationToggle />
          <StudentBiometricToggle />
        </div>
      </section>
    </main>
  );
}
