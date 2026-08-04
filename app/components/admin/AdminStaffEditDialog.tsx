"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { supabase } from "../../../lib/supabase";

export type AdminStaffAccountTarget = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  isCurrentAdmin: boolean;
};

export type UpdatedAdminStaffAccount = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  auth_linked: boolean;
};

export default function AdminStaffEditDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: AdminStaffAccountTarget;
  onClose: () => void;
  onSuccess: (account: UpdatedAdminStaffAccount, message: string) => void;
}) {
  const firstNameRef = useRef<HTMLInputElement | null>(null);
  const [firstName, setFirstName] = useState(target.first_name || "");
  const [lastName, setLastName] = useState(target.last_name || "");
  const [email, setEmail] = useState(target.email);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const focusTimer = window.setTimeout(() => firstNameRef.current?.focus());
    return () => window.clearTimeout(focusTimer);
  }, []);

  function closeDialog() {
    if (!submitting) onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setErrorMessage("");

    if (!firstName.trim()) {
      setErrorMessage("First name is required.");
      return;
    }
    if (!lastName.trim()) {
      setErrorMessage("Last name is required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErrorMessage("Admin authentication is required.");
        return;
      }

      const response = await fetch(
        `/api/admin/admin-staff/${encodeURIComponent(target.id)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim().toLowerCase(),
          }),
        }
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.account) {
        setErrorMessage(result?.error || "Unable to update the Admin account.");
        return;
      }

      onSuccess(
        result.account as UpdatedAdminStaffAccount,
        result.message || "Admin account updated."
      );
    } catch (error) {
      console.error("Unable to update Admin account:", error);
      setErrorMessage("Unable to update the Admin account.");
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
        className="account-password-dialog admin-staff-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-busy={submitting}
        aria-labelledby="admin-staff-edit-dialog-title"
      >
        <header>
          <div>
            <h2 id="admin-staff-edit-dialog-title">Edit Admin Account</h2>
            <p>Update the existing Admin profile and its login email.</p>
          </div>
          <button
            type="button"
            className="account-password-dialog-close"
            aria-label="Close Edit Admin Account dialog"
            onClick={closeDialog}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          {target.isCurrentAdmin && (
            <div className="account-password-self-warning" role="note">
              You are editing your own Admin account. Use any changed login email
              the next time you sign in.
            </div>
          )}

          <div className="account-password-fields">
            <label htmlFor="admin-staff-edit-first-name">First name</label>
            <input
              ref={firstNameRef}
              id="admin-staff-edit-first-name"
              autoComplete="given-name"
              maxLength={120}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />

            <label htmlFor="admin-staff-edit-last-name">Last name</label>
            <input
              id="admin-staff-edit-last-name"
              autoComplete="family-name"
              maxLength={120}
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />

            <label htmlFor="admin-staff-edit-email">Login email</label>
            <input
              id="admin-staff-edit-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {errorMessage && (
            <p className="account-password-request-error" role="alert">
              {errorMessage}
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
              {submitting ? "Saving…" : "Save Changes"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
