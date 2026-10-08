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

function formatSessionDate(value: string | null | undefined) {
  if (!value) return "Friday date unavailable";
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(date.getTime())) return "Friday date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  return value ? String(value).slice(0, 5) : "";
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
      className="teacher-dashboard-section teacher-dashboard-friday teacher-dashboard-friday-priority teacher-dashboard-exam-practice-workspace"
      aria-label="Active Friday Exam Practice workspace"
    >
      <div className="teacher-dashboard-section-title">
        <div>
          <p className="teacher-dashboard-eyebrow">ACTIVE TEACHER WORKSPACE</p>
          <h2>Friday Exam Practice</h2>
          <p>Open the configured papers, audio, and scoring workflow for this session.</p>
        </div>
      </div>

      <div className="teacher-dashboard-friday-list">
        {sessions.map((session) => (
          <article key={session.id}>
            <div className="teacher-dashboard-friday-row">
              <div>
                <p className="teacher-dashboard-exam-practice-session-time">
                  {formatSessionDate(session.session_date)} · {formatTime(session.start_time)}–{formatTime(session.end_time)}
                </p>
                <h3>
                  {session.level_name} — {session.activity_type} —{" "}
                  {session.exam_part || session.exam_bank?.part_label || "Exam part"}
                </h3>
                {session.exam_bank && (
                  <p>
                    Exam {session.exam_bank.exam_number}
                    {session.exam_bank.exam_title
                      ? ` — ${session.exam_bank.exam_title}`
                      : ""}
                    {session.exam_bank.part_label
                      ? ` · ${session.exam_bank.part_label}`
                      : ""}
                  </p>
                )}
                {session.note && (
                  <p>{session.note}</p>
                )}
                {!session.resources_linked && (
                  <p>Exam Bank resources not linked</p>
                )}
                {session.scoring_links?.length ? (
                  <div className="teacher-dashboard-exam-practice-scoring">
                    <strong>Correction and scoring</strong>
                    <div>
                      {session.scoring_links.map((link: any) => (
                        <a key={link.class_id} href={link.href} className="teacher-dashboard-resource-link">
                          Open scoring · {link.class_name}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="teacher-dashboard-exam-practice-readonly">
                    Scoring opens from the authorised Friday Tutorial Results tab for your class.
                  </p>
                )}
              </div>

              <div className="teacher-dashboard-resource-links">
                {(session.resources || []).map((resource: any) =>
                  resource.url ? (
                    <ResourceButton
                      key={resource.resource_type}
                      href={resource.url}
                    >
                      {resource.label}
                    </ResourceButton>
                  ) : (
                    <span
                      key={resource.resource_type}
                      className="teacher-dashboard-resource-unavailable"
                    >
                      {resource.label}: Not uploaded
                    </span>
                  )
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
