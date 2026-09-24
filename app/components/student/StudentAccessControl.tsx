"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Props = {
  studentId: string;
  classId?: string;
  teacherMode?: boolean;
  onChanged?: () => void;
};

type Access = {
  email: string | null;
  portal_access_active: boolean;
  invitation_sent: boolean;
  invitation_sent_at: string | null;
  invitation_pending: boolean;
  auth_confirmed: boolean;
};

export default function StudentAccessControl({ studentId, classId, teacherMode = false, onChanged }: Props) {
  const [access, setAccess] = useState<Access | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const savedEmail = (access?.email || "").trim().toLowerCase();
  const enteredEmail = email.trim().toLowerCase();
  const passwordResetHref = savedEmail
    ? `/forgot-password?email=${encodeURIComponent(savedEmail)}`
    : "/forgot-password";

  async function request(action?: string, value?: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired.");
    const path = teacherMode
      ? `/api/teacher/classes/${encodeURIComponent(classId || "")}/student-access`
      : `/api/admin/students/${encodeURIComponent(studentId)}/access-control`;
    const requestPath = teacherMode && !action
      ? `${path}?student_id=${encodeURIComponent(studentId)}`
      : path;
    const response = await fetch(requestPath, {
      method: action ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(action ? { "Content-Type": "application/json" } : {}),
      },
      ...(action ? { body: JSON.stringify({ action, email: value, student_id: studentId }) } : {}),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load student access.");
    return payload as Access;
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    request().then((next) => {
      if (!active) return;
      setAccess(next);
      setEmail(next.email || "");
    }).catch((loadError: any) => {
      if (active) setError(loadError?.message || "Unable to load student access.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [studentId, classId, teacherMode]);

  async function runAction(action: "save-email" | "send-invitation" | "resend-invitation") {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setMessage(""); setError("");
    try {
      const next = await request(action, email);
      setAccess(next); setEmail(next.email || "");
      setMessage(
        action === "save-email"
          ? "Email saved successfully."
          : action === "resend-invitation"
            ? "Invitation sent again successfully."
            : "Invitation sent successfully."
      );
      onChanged?.();
    } catch (actionError: any) {
      setError(actionError?.message || "Unable to update student access.");
    } finally { busyRef.current = false; setBusy(false); }
  }

  if (loading) return <section className="student-access-control"><p>Loading portal access…</p></section>;
  return (
    <section className="student-access-control" aria-labelledby="student-access-control-title">
      <div className="student-access-control-heading">
        <div><h3 id="student-access-control-title">Access Control</h3><p>Portal access requires a valid email and an explicit invitation or account setup.</p></div>
      </div>
      {error && <p className="student-access-control-error" role="alert">{error}</p>}
      {message && <p className="student-access-control-success" role="status">{message}</p>}
      <label><span>Email address</span><input type="email" value={email} placeholder="No email added" disabled={busy} onChange={(event) => setEmail(event.target.value)} /></label>
      <p className="student-access-control-status"><strong>{access?.portal_access_active ? "Student Portal access active" : "No active Student Portal access"}</strong>{access?.invitation_pending ? <> · Invitation pending{access.invitation_sent_at ? ` ${new Date(access.invitation_sent_at).toLocaleString()}` : ""}</> : access?.invitation_sent ? <> · Invitation sent{access.invitation_sent_at ? ` ${new Date(access.invitation_sent_at).toLocaleString()}` : ""}</> : null}</p>
      <div className="student-access-control-actions">
        <button type="button" onClick={() => void runAction("save-email")} disabled={busy}>{busy ? "Saving…" : "Save email"}</button>
        {access?.auth_confirmed ? (
          <a className="student-access-control-reset-link" href={passwordResetHref}>Use password reset</a>
        ) : (
          <button type="button" onClick={() => void runAction(access?.invitation_pending ? "resend-invitation" : "send-invitation")} disabled={busy || !email || enteredEmail !== savedEmail}>{access?.invitation_pending ? "Resend invitation" : "Send invitation"}</button>
        )}
      </div>
    </section>
  );
}
