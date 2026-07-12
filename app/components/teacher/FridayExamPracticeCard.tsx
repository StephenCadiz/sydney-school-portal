"use client";

import type { ReactNode } from "react";

function ResourceButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-block",
        background: "var(--ss-blue)",
        color: "#ffffff",
        borderRadius: "8px",
        padding: "8px 12px",
        textDecoration: "none",
        fontWeight: 700,
        fontSize: "14px",
      }}
    >
      {children}
    </a>
  );
}

export default function FridayExamPracticeCard({
  sessions,
}: {
  sessions: any[];
}) {
  if (!sessions.length) {
    return null;
  }

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid var(--ss-border)",
        borderLeft: "5px solid var(--ss-blue)",
        borderRadius: "14px",
        padding: "22px",
        boxShadow: "0 8px 24px rgba(31,60,136,0.06)",
        marginBottom: "22px",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <h2
          style={{
            color: "var(--ss-blue-dark)",
            margin: "0 0 6px",
            fontSize: "22px",
          }}
        >
          Friday Exam Practice
        </h2>
        <p style={{ color: "#4b5563", margin: 0 }}>
          Today · 18:00–19:00
        </p>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {sessions.map((session) => (
          <article
            key={session.id}
            style={{
              border: "1px solid var(--ss-border)",
              borderRadius: "12px",
              padding: "15px",
              background: "#f8fafd",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h3
                  style={{
                    color: "var(--ss-blue-dark)",
                    margin: "0 0 4px",
                    fontSize: "17px",
                  }}
                >
                  {session.level_name} — {session.activity_type}
                </h3>
                {session.note && (
                  <p style={{ color: "#4b5563", margin: "6px 0 0" }}>
                    {session.note}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {session.pdf_url && (
                  <ResourceButton href={session.pdf_url}>PDF</ResourceButton>
                )}
                {session.audio_url && (
                  <ResourceButton href={session.audio_url}>Audio</ResourceButton>
                )}
                {session.key_url && (
                  <ResourceButton href={session.key_url}>Key</ResourceButton>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
