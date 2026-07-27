"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { supabase } from "../../../lib/supabase";

export type PasswordAccountTarget = {
  id: string;
  name: string;
  email: string;
  accountType: "Teacher" | "Cambridge Student" | "Admin";
  isCurrentAdmin?: boolean;
};

export default function SetPasswordDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: PasswordAccountTarget;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const submittingRef = useRef(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  onCloseRef.current = onClose;
  submittingRef.current = submitting;

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => passwordRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submittingRef.current) {
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, []);

  function closeDialog() {
    if (submitting) return;
    setPassword("");
    setConfirmation("");
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFieldError("");
    setRequestError("");

    if (!password || password.length < 6) {
      setFieldError("Password must contain at least 6 characters.");
      return;
    }

    if (!confirmation) {
      setFieldError("Confirm the new password.");
      return;
    }

    if (password !== confirmation) {
      setFieldError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setRequestError("Admin authentication is required.");
        return;
      }

      const response = await fetch(
        `/api/admin/accounts/${encodeURIComponent(target.id)}/set-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            password,
            confirm_password: confirmation,
          }),
        }
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRequestError(
          result.error || "Unable to update the password right now."
        );
        return;
      }

      setPassword("");
      setConfirmation("");
      onSuccess(result.message || "Password updated successfully.");
    } catch {
      setRequestError("Unable to update the password right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="account-password-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div
        className="account-password-dialog"
        role="dialog"
        aria-modal="true"
        aria-busy={submitting}
        aria-labelledby="account-password-dialog-title"
        aria-describedby="account-password-dialog-description"
        ref={dialogRef}
      >
        <header>
          <div>
            <h2 id="account-password-dialog-title">Set New Password</h2>
            <p id="account-password-dialog-description">
              The account holder should use the new password the next time they
              sign in.
            </p>
          </div>
          <button
            type="button"
            className="account-password-dialog-close"
            aria-label="Close password dialog"
            onClick={closeDialog}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <dl className="account-password-identity">
            <div>
              <dt>Account type</dt>
              <dd>{target.accountType}</dd>
            </div>
            <div>
              <dt>Account name</dt>
              <dd>{target.name}</dd>
            </div>
            <div>
              <dt>Login email</dt>
              <dd>{target.email || "No login email recorded"}</dd>
            </div>
          </dl>

          {target.isCurrentAdmin && (
            <div className="account-password-self-warning" role="note">
              You are changing the password for your own Admin account. You
              will need to use the new password the next time you sign in.
            </div>
          )}

          <div className="account-password-fields">
            <label htmlFor="account-new-password">New password</label>
            <div className="account-password-input-wrap">
              <input
                ref={passwordRef}
                id="account-new-password"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                maxLength={256}
                value={password}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={
                  fieldError
                    ? "account-password-field-error"
                    : "account-password-guidance"
                }
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                aria-label={`${showPasswords ? "Hide" : "Show"} new passwords`}
                aria-pressed={showPasswords}
                onClick={() => setShowPasswords((current) => !current)}
              >
                {showPasswords ? "Hide" : "Show"}
              </button>
            </div>
            <small id="account-password-guidance">
              Use at least 6 characters.
            </small>

            <label htmlFor="account-confirm-password">
              Confirm new password
            </label>
            <input
              id="account-confirm-password"
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              maxLength={256}
              value={confirmation}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={
                fieldError ? "account-password-field-error" : undefined
              }
              onChange={(event) => setConfirmation(event.target.value)}
            />

            {fieldError && (
              <small
                className="account-password-field-error"
                id="account-password-field-error"
              >
                {fieldError}
              </small>
            )}
          </div>

          {requestError && (
            <p className="account-password-request-error" role="alert">
              {requestError}
            </p>
          )}

          <footer>
            <button
              type="button"
              className="account-password-secondary"
              onClick={closeDialog}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="account-password-primary"
              disabled={submitting}
            >
              {submitting ? "Setting password…" : "Set Password"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
