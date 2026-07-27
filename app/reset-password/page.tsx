"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";

type RecoveryState = "checking" | "valid" | "invalid" | "updating";

function cleanSensitiveUrl() {
  window.history.replaceState({}, document.title, "/reset-password");
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [recoveryState, setRecoveryState] =
    useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [updateError, setUpdateError] = useState("");

  useEffect(() => {
    let active = true;
    let recoveryEventReceived = false;
    let codeExchangeSucceeded = false;

    const initialUrl = new URL(window.location.href);
    const code = initialUrl.searchParams.get("code");
    const hashParams = new URLSearchParams(
      initialUrl.hash.startsWith("#")
        ? initialUrl.hash.slice(1)
        : initialUrl.hash
    );
    const hashAccessToken = hashParams.get("access_token");
    const hashIsRecovery = hashParams.get("type") === "recovery";

    function acceptRecovery() {
      if (!active) return;
      cleanSensitiveUrl();
      setRecoveryState("valid");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        recoveryEventReceived = true;
        acceptRecovery();
      }
    });

    async function establishRecoverySession() {
      try {
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          codeExchangeSucceeded = !error && Boolean(data.session);
          cleanSensitiveUrl();
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const matchingHashRecoverySession =
          hashIsRecovery &&
          Boolean(hashAccessToken) &&
          session?.access_token === hashAccessToken;

        if (
          session &&
          (recoveryEventReceived ||
            codeExchangeSucceeded ||
            matchingHashRecoverySession)
        ) {
          acceptRecovery();
          return;
        }

        window.setTimeout(async () => {
          if (!active || recoveryEventReceived) return;

          const {
            data: { session: delayedSession },
          } = await supabase.auth.getSession();
          const delayedHashMatch =
            hashIsRecovery &&
            Boolean(hashAccessToken) &&
            delayedSession?.access_token === hashAccessToken;

          if (
            delayedSession &&
            (codeExchangeSucceeded || delayedHashMatch)
          ) {
            acceptRecovery();
            return;
          }

          cleanSensitiveUrl();
          setRecoveryState("invalid");
        }, 1200);
      } catch {
        cleanSensitiveUrl();
        if (active) setRecoveryState("invalid");
      }
    }

    void establishRecoverySession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveryState !== "valid") return;

    setPasswordError("");
    setUpdateError("");

    if (!password || password.length < 6) {
      setPasswordError("Password must contain at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setRecoveryState("updating");

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setUpdateError(
          "We couldn’t update your password. Request a new password-reset link and try again."
        );
        setRecoveryState("valid");
        return;
      }

      setPassword("");
      setConfirmPassword("");
      await supabase.auth.signOut({ scope: "local" });
      router.replace("/login?password_reset=success");
    } catch {
      setUpdateError(
        "We couldn’t update your password. Request a new password-reset link and try again."
      );
      setRecoveryState("valid");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="reset-password-title">
        <img
          className="auth-logo"
          src="/LOGO and NAME.png"
          alt="Sydney School"
        />
        <h1 id="reset-password-title" className="auth-title">
          Reset your password
        </h1>

        {recoveryState === "checking" && (
          <p className="auth-checking" role="status" aria-live="polite">
            Checking password-reset link…
          </p>
        )}

        {recoveryState === "invalid" && (
          <>
            <div className="auth-message is-error" role="alert">
              This password-reset link is invalid or has expired.
            </div>
            <div className="auth-link-stack">
              <Link href="/forgot-password">
                Request a new password-reset link
              </Link>
              <Link href="/login">Back to sign in</Link>
            </div>
          </>
        )}

        {(recoveryState === "valid" || recoveryState === "updating") && (
          <>
            <p className="auth-intro">
              Choose a new password for your Sydney School account.
            </p>

            {updateError && (
              <div className="auth-message is-error" role="alert">
                {updateError}
              </div>
            )}

            <form className="auth-form" onSubmit={handleUpdatePassword}>
              <label htmlFor="reset-password-new">New password</label>
              <input
                id="reset-password-new"
                type="password"
                autoComplete="new-password"
                value={password}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={
                  passwordError
                    ? "reset-password-error"
                    : "reset-password-guidance"
                }
                onChange={(event) => setPassword(event.target.value)}
              />
              <span id="reset-password-guidance" className="auth-field-help">
                Use at least 6 characters.
              </span>

              <label htmlFor="reset-password-confirm">
                Confirm new password
              </label>
              <input
                id="reset-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={
                  passwordError ? "reset-password-error" : undefined
                }
                onChange={(event) => setConfirmPassword(event.target.value)}
              />

              {passwordError && (
                <span id="reset-password-error" className="auth-field-error">
                  {passwordError}
                </span>
              )}

              <button
                type="submit"
                disabled={recoveryState === "updating"}
              >
                {recoveryState === "updating"
                  ? "Updating password…"
                  : "Update password"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
