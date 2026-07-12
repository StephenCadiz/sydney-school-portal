"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "../../lib/supabase";

export default function SetPasswordPage() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      setHasSession(Boolean(session));
      setCheckingSession(false);
    }

    checkSession();
  }, []);

  async function redirectByRole(userId: string) {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId);

    if (error || !profiles || profiles.length === 0) {
      router.push("/login");
      return;
    }

    const role = profiles[0].role;

    if (role === "teacher") {
      router.push("/teacher");
      return;
    }

    if (role === "student") {
      router.push("/student");
      return;
    }

    if (role === "admin") {
      router.push("/admin");
      return;
    }

    router.push("/login");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!password) {
      setMessage("Please enter a password.");
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setMessage(error.message || "Unable to set password.");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      await redirectByRole(user.id);
    } catch (error: any) {
      setMessage(error.message || "Unable to set password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background:
          "linear-gradient(135deg,#1695e8 0%,#0b6fb8 100%)",
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          padding: "50px",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "500px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.2)",
          textAlign: "center",
        }}
      >
        <img
          src="/LOGO and NAME.png"
          alt="Sydney School"
          style={{
            width: "100%",
            maxWidth: "350px",
            marginBottom: "20px",
          }}
        />

        <h1
          style={{
            color: "#1f3c88",
            marginBottom: "20px",
          }}
        >
          Set your password
        </h1>

        {checkingSession ? (
          <p
            style={{
              color: "#666",
            }}
          >
            Checking invitation...
          </p>
        ) : !hasSession ? (
          <p
            style={{
              color: "#333",
              lineHeight: 1.5,
            }}
          >
            This invitation link is invalid or has expired. Please ask
            the school for a new invitation.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            {message && (
              <div
                style={{
                  background: "#f8f9fc",
                  borderRadius: "10px",
                  padding: "12px",
                  marginBottom: "18px",
                  color: "#333",
                }}
              >
                {message}
              </div>
            )}

            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{
                width: "100%",
                padding: "14px",
                marginBottom: "15px",
                border: "1px solid #ddd",
                borderRadius: "10px",
                fontSize: "16px",
                color: "#333",
              }}
            />

            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              style={{
                width: "100%",
                padding: "14px",
                marginBottom: "20px",
                border: "1px solid #ddd",
                borderRadius: "10px",
                fontSize: "16px",
                color: "#333",
              }}
            />

            <button
              type="submit"
              disabled={saving}
              style={{
                width: "100%",
                padding: "14px",
                background: "#1695e8",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {saving ? "Saving..." : "Set Password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
