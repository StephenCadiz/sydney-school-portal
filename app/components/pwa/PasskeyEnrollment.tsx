"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";

import { supabase } from "../../../lib/supabase";
import { isPasskeyDisabled, passkeyErrorMessage } from "../../../lib/passkeyErrors";

type PasskeyState = "checking" | "ready" | "enabled" | "disabled" | "unavailable" | "saving";

function supportsPasskeys() {
  return (
    typeof window !== "undefined" &&
    "PublicKeyCredential" in window &&
    "credentials" in navigator
  );
}

export default function PasskeyEnrollment() {
  const [state, setState] = useState<PasskeyState>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supportsPasskeys()) {
      setState("unavailable");
      return;
    }

    let active = true;
    void supabase.auth.passkey.list().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        if (isPasskeyDisabled(error)) {
          setState("disabled");
          setMessage(passkeyErrorMessage(error, "registration"));
          return;
        }
        setState("ready");
        return;
      }
      setState(data?.length ? "enabled" : "ready");
    });
    return () => {
      active = false;
    };
  }, []);

  async function register() {
    if (state === "saving") return;
    setState("saving");
    setMessage("");
    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) {
        setState("ready");
        setMessage(passkeyErrorMessage(error, "registration"));
        return;
      }
      setState("enabled");
      setMessage("This device can now sign you in with Face ID or fingerprint after logout or session expiry.");
    } catch (error) {
      setState("ready");
      setMessage(passkeyErrorMessage(error, "registration"));
    }
  }

  if (state === "checking" || state === "unavailable") return null;

  return (
    <aside className="pwa-passkey-control" aria-label="Biometric sign-in">
      <div>
        <strong>Secure app sign-in</strong>
        <span>Use Face ID or fingerprint after logout or session expiry.</span>
      </div>
      {state === "disabled" ? (
        <span className="pwa-passkey-status" role="status">Not enabled</span>
      ) : state === "enabled" ? (
        <span className="pwa-passkey-status" role="status">Enabled</span>
      ) : (
        <button type="button" onClick={() => void register()} disabled={state === "saving"}>
          <Fingerprint size={17} aria-hidden="true" />
          {state === "saving" ? "Waiting…" : "Enable biometric sign-in"}
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </aside>
  );
}
