"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";

const cooldownStorageKey = "ss_password_reset_cooldown_until";
const cooldownSeconds = 60;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function getResetRedirectUrl() {
  const configuredSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";

  if (configuredSiteUrl) {
    return `${normalizeBaseUrl(configuredSiteUrl)}/reset-password`;
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return `${normalizeBaseUrl(window.location.origin)}/reset-password`;
  }

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || "";
  const baseUrl = normalizeBaseUrl(vercelUrl) || "http://localhost:3000";
  return `${baseUrl}/reset-password`;
}

function readCooldownUntil() {
  try {
    return Number(window.localStorage.getItem(cooldownStorageKey) || 0);
  } catch {
    return 0;
  }
}

function storeCooldownUntil(value: number) {
  try {
    window.localStorage.setItem(cooldownStorageKey, String(value));
  } catch {
    // The in-memory cooldown still prevents rapid requests.
  }
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    setCooldownUntil(readCooldownUntil());
  }, []);

  useEffect(() => {
    function updateCountdown() {
      setSecondsRemaining(
        Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      );
    }

    updateCountdown();
    if (cooldownUntil <= Date.now()) return;

    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || secondsRemaining > 0) return;

    const normalizedEmail = normalizeEmail(email);
    setEmailError("");
    setRequestError("");

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      setEmailError("Enter a valid email address.");
      return;
    }

    setEmail(normalizedEmail);
    setSending(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: getResetRedirectUrl() }
      );

      if (error && error.status !== 429) {
        setRequestError(
          "We couldn’t send password-reset instructions right now. Please try again shortly."
        );
        return;
      }

      const nextCooldownUntil = Date.now() + cooldownSeconds * 1000;
      storeCooldownUntil(nextCooldownUntil);
      setCooldownUntil(nextCooldownUntil);
      setConfirmation(true);

      if (error?.status === 429) {
        setRequestError(
          "Please wait before requesting another password-reset email."
        );
      }
    } catch {
      setRequestError(
        "We couldn’t send password-reset instructions right now. Please try again shortly."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="forgot-password-title">
        <img
          className="auth-logo"
          src="/LOGO and NAME.png"
          alt="Sydney School"
        />
        <h1 id="forgot-password-title" className="auth-title">
          Forgot your password?
        </h1>
        <p className="auth-intro">
          Enter the email address connected to your Sydney School account. If
          an account exists, we’ll send instructions for choosing a new
          password.
        </p>

        {confirmation && (
          <div className="auth-message is-success" role="status" aria-live="polite">
            If an account exists for this email, password-reset instructions
            have been sent.
          </div>
        )}

        {requestError && (
          <div className="auth-message is-error" role="alert">
            {requestError}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="forgot-password-email">Email address</label>
          <input
            id="forgot-password-email"
            type="email"
            autoComplete="email"
            value={email}
            aria-invalid={Boolean(emailError)}
            aria-describedby={
              emailError ? "forgot-password-email-error" : undefined
            }
            onChange={(event) => setEmail(event.target.value)}
          />
          {emailError && (
            <span
              id="forgot-password-email-error"
              className="auth-field-error"
            >
              {emailError}
            </span>
          )}

          <button type="submit" disabled={sending || secondsRemaining > 0}>
            {sending
              ? "Sending…"
              : confirmation
                ? "Resend instructions"
                : "Send reset instructions"}
          </button>

          {secondsRemaining > 0 && (
            <p className="auth-cooldown" role="status">
              Try again in {secondsRemaining} second
              {secondsRemaining === 1 ? "" : "s"}.
            </p>
          )}
        </form>

        <Link className="auth-back-link" href="/login">
          {confirmation ? "Return to sign in" : "Back to sign in"}
        </Link>
      </section>
    </main>
  );
}
