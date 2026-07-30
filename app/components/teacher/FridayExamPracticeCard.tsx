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
          <h2>Friday Tutorial</h2>
          <p>Today · 18:00–19:00</p>
        </div>
      </div>

      <div className="teacher-dashboard-friday-list">
        {sessions.map((session) => (
          <article key={session.id}>
            <div className="teacher-dashboard-friday-row">
              <div>
                <h3>
                  {session.level_name} —{" "}
                  {session.exam_bank?.part_label || session.activity_type}
                </h3>
                {session.exam_bank && (
                  <p>
                    Exam {session.exam_bank.exam_number}
                    {session.exam_bank.exam_title
                      ? ` — ${session.exam_bank.exam_title}`
                      : ""}
                  </p>
                )}
                {session.note && (
                  <p>{session.note}</p>
                )}
                {!session.resources_linked && (
                  <p>Exam Bank resources not linked</p>
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
