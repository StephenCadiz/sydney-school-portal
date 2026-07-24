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
      className="teacher-dashboard-resource-link"
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
    <section className="teacher-dashboard-section teacher-dashboard-friday teacher-dashboard-friday-priority">
      <div className="teacher-dashboard-section-title">
        <div>
          <h2>Friday Exam Practice</h2>
          <p>Today · 18:00–19:00</p>
        </div>
      </div>

      <div className="teacher-dashboard-friday-list">
        {sessions.map((session) => (
          <article key={session.id}>
            <div className="teacher-dashboard-friday-row">
              <div>
                <h3>
                  {session.level_name} — {session.activity_type}
                </h3>
                {session.note && (
                  <p>{session.note}</p>
                )}
              </div>

              <div className="teacher-dashboard-resource-links">
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
