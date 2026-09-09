"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { supabase } from "../../lib/supabase";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const passwordResetSucceeded =
    searchParams.get("password_reset") === "success";

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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile?.role) {
        await supabase.auth.signOut();
        setErrorMessage("Unable to access your portal account. Please try again.");
        return;
      }

      if (profile.role === "admin") {
        router.push("/admin");
        return;
      }

      if (profile.role === "teacher") {
        router.push("/teacher");
        return;
      }

      if (profile.role === "student") {
        router.push("/student");
        return;
      }

      await supabase.auth.signOut();
      setErrorMessage("Unable to access your portal account. Please try again.");
    } catch {
      setErrorMessage(
        "Unable to sign in. Check your email and password and try again."
      );
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
