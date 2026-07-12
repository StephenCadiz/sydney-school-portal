"use client";

import TeacherLayout from "../../components/layout/TeacherLayout";

const adminTaskLinks = [
  {
    title: "Aqadem",
    description:
      "Open Aqadem teacher platform for registers, reports and admin tasks.",
    href: "https://sydneyschool.aqadem.com/profesores",
    external: true,
  },
];

export default function TeacherAdminTasksPage() {
  return (
    <TeacherLayout>
      <section
        style={{
          marginBottom: "28px",
        }}
      >
        <h1
          style={{
            color: "#1f3c88",
            margin: "0 0 8px",
            fontSize: "32px",
          }}
        >
          Admin Tasks
        </h1>

        <p
          style={{
            color: "#667085",
            margin: 0,
            fontSize: "16px",
          }}
        >
          Quick access to teacher platforms and administrative tools.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "18px",
        }}
      >
        {adminTaskLinks.map((link) => (
          <a
            key={link.title}
            href={link.href}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noopener noreferrer" : undefined}
            style={{
              background: "#ffffff",
              border: "1px solid #e6eaf2",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
              textDecoration: "none",
              display: "block",
            }}
          >
            <h2
              style={{
                color: "#1f3c88",
                margin: "0 0 10px",
                fontSize: "22px",
              }}
            >
              {link.title}
            </h2>

            <p
              style={{
                color: "#667085",
                margin: "0 0 18px",
                lineHeight: 1.5,
              }}
            >
              {link.description}
            </p>

            <span
              style={{
                display: "inline-block",
                background: "#1f3c88",
                color: "#ffffff",
                borderRadius: "8px",
                padding: "10px 16px",
                fontWeight: 700,
              }}
            >
              Open {link.title} →
            </span>
          </a>
        ))}
      </section>
    </TeacherLayout>
  );
}
