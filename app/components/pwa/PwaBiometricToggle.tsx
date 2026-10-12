"use client";

import { Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";

import { passkeyErrorMessage } from "../../../lib/passkeyErrors";
import { supabase } from "../../../lib/supabase";

type BiometricState = "checking" | "enabled" | "disabled" | "saving" | "unavailable";

function supportsBiometrics() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && "credentials" in navigator;
}

function biometricPreferenceKey(userId: string) {
  return `sydney-school-biometric-enabled:${userId}`;
}

export default function PwaBiometricToggle() {
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
      setUserId(session.user.id);
      if (error || !data?.length) {
        setState("disabled");
        if (error) setMessage(passkeyErrorMessage(error, "registration"));
        return;
      }

      let preference = "1";
      try {
        preference = localStorage.getItem(biometricPreferenceKey(session.user.id)) || "1";
      } catch {
        // Local preferences are best effort.
      }
      setState(preference === "0" ? "disabled" : "enabled");
    })().catch(() => {
      if (active) setState("unavailable");
    });

    return () => {
      active = false;
    };
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
      try {
        localStorage.setItem(biometricPreferenceKey(userId), "1");
      } catch {
        // Local preferences are best effort.
      }
      setState("enabled");
      setMessage("Biometrics are enabled for sign-in after logout or session expiry.");
    } catch (error) {
      setState("disabled");
      setMessage(passkeyErrorMessage(error, "registration"));
    }
  }

  function disable() {
    if (!userId) return;
    try {
      localStorage.setItem(biometricPreferenceKey(userId), "0");
    } catch {
      // Local preferences are best effort.
    }
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
