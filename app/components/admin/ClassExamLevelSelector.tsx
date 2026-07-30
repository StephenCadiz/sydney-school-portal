"use client";

import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";

type ClassExamLevel = {
  id: string | number;
  name: string;
};

type ClassExamLevelSelectorProps = {
  title: string;
  description: string;
  levels: ClassExamLevel[];
  countsByLevelId: Record<string, number>;
  getLevelHref: (level: ClassExamLevel) => string;
  loading?: boolean;
  invalidMessage?: string;
  countLabelSingular?: string;
  countLabelPlural?: string;
  emptyLabel?: string;
};

export default function ClassExamLevelSelector({
  title,
  description,
  levels,
  countsByLevelId,
  getLevelHref,
  loading = false,
  invalidMessage = "",
  countLabelSingular = "exam",
  countLabelPlural = "exams",
  emptyLabel = "No exams",
}: ClassExamLevelSelectorProps) {
  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid var(--ss-border)",
        borderRadius: "14px",
        boxShadow: "0 8px 24px rgba(31,60,136,0.06)",
        padding: "24px",
      }}
    >
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 6px" }}>
          {title}
        </h2>
        <p style={{ color: "#6b7280", margin: 0 }}>{description}</p>
      </div>

      {invalidMessage && (
        <div
          role="status"
          style={{
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: "10px",
            color: "#9a3412",
            padding: "11px 13px",
            marginBottom: "18px",
            fontWeight: 700,
          }}
        >
          {invalidMessage}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#4b5563", margin: 0 }}>Loading levels...</p>
      ) : levels.length === 0 ? (
        <p style={{ color: "#4b5563", margin: 0 }}>
          No supported Class Exam levels are available.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
          }}
        >
          {levels.map((level) => {
            const count = countsByLevelId[String(level.id)] || 0;
            const countText =
              count === 0
                ? emptyLabel
                : `${count} ${count === 1 ? countLabelSingular : countLabelPlural}`;

            return (
              <Link
                key={level.id}
                href={getLevelHref(level)}
                aria-label={`Open ${level.name} Class Exams`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "14px",
                  border: "1px solid var(--ss-border)",
                  borderRadius: "12px",
                  background: "#ffffff",
                  color: "inherit",
                  padding: "16px",
                  textDecoration: "none",
                  minHeight: "92px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "42px",
                      height: "42px",
                      borderRadius: "10px",
                      background: "var(--ss-blue-light)",
                      color: "var(--ss-blue)",
                      flex: "0 0 auto",
                    }}
                  >
                    <BookOpen size={20} strokeWidth={2} />
                  </span>

                  <span>
                    <strong
                      style={{
                        display: "block",
                        color: "var(--ss-blue-dark)",
                        fontSize: "17px",
                        marginBottom: "4px",
                      }}
                    >
                      {level.name}
                    </strong>
                    <span style={{ color: "#6b7280", fontSize: "14px" }}>
                      {countText}
                    </span>
                  </span>
                </div>

                <span
                  aria-hidden="true"
                  style={{
                    color: "var(--ss-blue)",
                    display: "inline-flex",
                    flex: "0 0 auto",
                  }}
                >
                  <ArrowRight size={20} strokeWidth={2.2} />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
