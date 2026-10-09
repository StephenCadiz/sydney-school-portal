"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";

import { supabase } from "../../lib/supabase";
import { passkeyErrorMessage } from "../../lib/passkeyErrors";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const passwordResetSucceeded =
    searchParams.get("password_reset") === "success";

  useEffect(() => {
    setPasskeySupported(
      typeof window !== "undefined" &&
        "PublicKeyCredential" in window &&
        "credentials" in navigator
    );
  }, []);

  async function routeAfterAuthentication(userId: string) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.role) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const mappedSessionResponse = await fetch("/api/student/session", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const mappedSession = await mappedSessionResponse.json().catch(() => ({}));
        if (mappedSessionResponse.ok && typeof mappedSession?.id === "string") {
          return "/student";
        }
      }
      return null;
    }

    if (profile.role === "admin") return "/admin";
    if (profile.role === "teacher") return "/teacher";
    if (profile.role === "student") return "/student";
    return null;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (signingIn) return;

    setErrorMessage("");
    setSigningIn(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        setErrorMessage(
          "Unable to sign in. Check your email and password and try again."
        );
        return;
      }

      setPassword("");

      const route = await routeAfterAuthentication(data.user.id);
      if (!route) {
        await supabase.auth.signOut();
        setErrorMessage("Unable to access your portal account. Please try again.");
        return;
      }
      router.push(route);
    } catch {
      setErrorMessage(
        "Unable to sign in. Check your email and password and try again."
      );
    } finally {
      setSigningIn(false);
    }
  }

  async function handlePasskeySignIn() {
    if (signingIn || !passkeySupported) return;
    setErrorMessage("");
    setSigningIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error || !data?.user) {
        setErrorMessage(passkeyErrorMessage(error, "sign-in"));
        return;
      }
      const route = await routeAfterAuthentication(data.user.id);
      if (!route) {
        await supabase.auth.signOut();
        setErrorMessage("Unable to access your portal account. Please use your password instead.");
        return;
      }
      router.push(route);
    } catch (error) {
      setErrorMessage(passkeyErrorMessage(error, "sign-in"));
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <img
          className="auth-logo"
          src="/LOGO and NAME.png"
          alt="Sydney School"
        />
        <h1 id="login-title" className="auth-title">
          Sign in
        </h1>
        <p className="auth-intro">Teacher · Student · Admin Portal</p>

        {passwordResetSucceeded && (
          <div className="auth-message is-success" role="status" aria-live="polite">
            Your password has been updated. Sign in with your new password.
          </div>
        )}

        {errorMessage && (
          <div className="auth-message is-error" role="alert">
            {errorMessage}
          </div>
        )}

        <form className="auth-form" onSubmit={handleLogin}>
          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <div className="auth-password-heading">
            <label htmlFor="login-password">Password</label>
            <Link href="/forgot-password">Forgot your password?</Link>
          </div>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button type="submit" disabled={signingIn}>
            {signingIn ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {passkeySupported && (
          <button
            type="button"
            className="auth-passkey-button"
            onClick={() => void handlePasskeySignIn()}
            disabled={signingIn}
          >
            <Fingerprint size={19} aria-hidden="true" />
            Sign in with Face ID / fingerprint
          </button>
        )}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-page">
          <section className="auth-card" aria-busy="true">
            <p className="auth-checking">Loading sign in…</p>
          </section>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
