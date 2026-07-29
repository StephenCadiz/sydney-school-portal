"use client";

import { useEffect, useState } from "react";

export type GoogleMeetState = {
  classId: string;
  loading: boolean;
  error: string;
  supported: boolean;
  meetLink: string | null;
};

const actionStyle = {
  alignItems: "center",
  borderRadius: "9px",
  display: "inline-flex",
  fontSize: "15px",
  fontWeight: 700,
  justifyContent: "center",
  minHeight: "44px",
  padding: "10px 16px",
  textDecoration: "none",
} as const;

export default function GoogleMeetTab({
  state,
  onRetry,
}: {
  state: GoogleMeetState;
  onRetry: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    setCopyStatus("");
    setCopyError("");
  }, [state.classId, state.meetLink]);

  async function copyMeetingLink() {
    if (!state.meetLink) return;

    setCopyStatus("");
    setCopyError("");
    try {
      await navigator.clipboard.writeText(state.meetLink);
      setCopyStatus("Meeting link copied.");
      window.setTimeout(() => setCopyStatus(""), 3000);
    } catch {
      setCopyError("The meeting link could not be copied. Please try again.");
    }
  }

  return (
    <section
      aria-labelledby="google-meet-heading"
      style={{ display: "grid", gap: "18px", minWidth: 0 }}
    >
      <header style={{ display: "grid", gap: "6px" }}>
        <h3
          id="google-meet-heading"
          style={{
            color: "var(--ss-blue-dark, #1f3c88)",
            fontSize: "22px",
            margin: 0,
          }}
        >
          Google Meet
        </h3>
        <p style={{ color: "#667085", lineHeight: 1.5, margin: 0 }}>
          Open the online classroom for this class.
        </p>
      </header>

      {state.loading ? (
        <p style={{ color: "#667085", margin: 0 }}>
          Loading Google Meet information...
        </p>
      ) : state.error ? (
        <div role="alert" style={{ display: "grid", gap: "12px" }}>
          <p style={{ color: "#b42318", margin: 0 }}>{state.error}</p>
          <button
            type="button"
            onClick={onRetry}
            style={{
              ...actionStyle,
              background: "var(--ss-blue, #2f7db8)",
              border: 0,
              color: "#ffffff",
              cursor: "pointer",
              width: "fit-content",
            }}
          >
            Retry
          </button>
        </div>
      ) : !state.meetLink ? (
        <div
          style={{
            background: "#f8fafd",
            border: "1px solid var(--ss-border, #dbe7f3)",
            borderRadius: "12px",
            color: "#475467",
            display: "grid",
            gap: "6px",
            padding: "18px",
          }}
        >
          <p style={{ lineHeight: 1.5, margin: 0 }}>
            No Google Meet link has been added for this class. Please contact
            Admin.
          </p>
          <small>Meeting links are managed by Admin.</small>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <a
              href={state.meetLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...actionStyle,
                background: "var(--ss-blue, #2f7db8)",
                color: "#ffffff",
              }}
            >
              Join Google Meet
            </a>
            <button
              type="button"
              onClick={() => void copyMeetingLink()}
              style={{
                ...actionStyle,
                background: "#ffffff",
                border: "1px solid var(--ss-blue, #2f7db8)",
                color: "var(--ss-blue-dark, #1f3c88)",
                cursor: "pointer",
              }}
            >
              Copy meeting link
            </button>
          </div>
          <div aria-live="polite">
            {copyStatus && (
              <p style={{ color: "#17603d", margin: 0 }}>{copyStatus}</p>
            )}
            {copyError && (
              <p role="alert" style={{ color: "#b42318", margin: 0 }}>
                {copyError}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
