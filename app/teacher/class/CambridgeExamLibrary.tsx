"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";

type ExamResource = {
  type: string;
  label: string;
  url: string;
};

type ExamPart = {
  id: string | null;
  type: string;
  label: string;
  resources: ExamResource[];
};

type Exam = {
  id: string;
  exam_number: number;
  title: string | null;
  parts: ExamPart[];
};

const stateStyle = {
  background: "#f8fafd",
  border: "1px dashed var(--ss-border, #dbe7f3)",
  borderRadius: "12px",
  color: "#667085",
  lineHeight: 1.5,
  padding: "18px",
} as const;

const resourceLinkStyle = {
  alignItems: "center",
  background: "var(--ss-blue, #2f7db8)",
  borderRadius: "9px",
  color: "#ffffff",
  display: "inline-flex",
  fontSize: "14px",
  fontWeight: 700,
  justifyContent: "center",
  minHeight: "42px",
  padding: "10px 14px",
  textDecoration: "none",
} as const;

export default function CambridgeExamLibrary({ classId }: { classId: string }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!classId) {
      setExams([]);
      setSupported(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired.");

      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(classId)}/cambridge-exams`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load Cambridge exams.");
      }

      setSupported(payload?.class?.supported === true);
      setExams(payload?.class?.supported === true ? payload.exams || [] : []);
    } catch (loadError) {
      console.error("Cambridge Exam library load failed:", loadError);
      setExams([]);
      setSupported(null);
      setError("Cambridge exams could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loading && supported === false) return null;

  return (
    <section
      aria-labelledby="official-cambridge-exams-heading"
      style={{ display: "grid", gap: "16px", marginTop: "8px" }}
    >
      <header style={{ display: "grid", gap: "6px" }}>
        <h3
          id="official-cambridge-exams-heading"
          style={{
            color: "var(--ss-blue-dark, #1f3c88)",
            fontSize: "20px",
            margin: 0,
          }}
        >
          Cambridge Exams
        </h3>
        <p style={{ color: "#667085", lineHeight: 1.5, margin: 0 }}>
          Access the complete active Cambridge Exam Bank for this class level,
          including papers, keys, audio and sample answers.
        </p>
      </header>

      {loading ? (
        <div style={stateStyle}>Loading Cambridge exams...</div>
      ) : error ? (
        <div role="alert" style={{ ...stateStyle, display: "grid", gap: "12px" }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            style={{ ...resourceLinkStyle, border: 0, cursor: "pointer", width: "fit-content" }}
          >
            Retry
          </button>
        </div>
      ) : exams.length === 0 ? (
        <div style={stateStyle}>
          No Cambridge exams are currently available for this class level.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {exams.map((exam, index) => {
            const usableResourceCount = exam.parts.reduce(
              (count, part) => count + part.resources.length,
              0
            );

            return (
              <details
                key={exam.id}
                open={index === 0}
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--ss-border, #dbe7f3)",
                  borderRadius: "14px",
                  boxShadow: "0 4px 14px rgba(31,60,136,0.06)",
                  overflow: "hidden",
                }}
              >
                <summary
                  style={{
                    color: "var(--ss-blue-dark, #1f3c88)",
                    cursor: "pointer",
                    fontSize: "17px",
                    fontWeight: 800,
                    lineHeight: 1.4,
                    padding: "16px 18px",
                  }}
                >
                  Exam {exam.exam_number}
                  {exam.title ? ` · ${exam.title}` : ""}
                </summary>
                <div
                  style={{
                    borderTop: "1px solid var(--ss-border, #dbe7f3)",
                    display: "grid",
                    gap: "12px",
                    padding: "16px",
                  }}
                >
                  {usableResourceCount === 0 && (
                    <p style={{ color: "#667085", margin: 0 }}>
                      No resources have been uploaded for this exam.
                    </p>
                  )}
                  {exam.parts.map((part) => (
                    <section
                      key={part.type}
                      aria-labelledby={`exam-${exam.id}-part-${part.type}`}
                      style={{
                        background: "#f8fafd",
                        border: "1px solid #e6eaf2",
                        borderRadius: "11px",
                        display: "grid",
                        gap: "10px",
                        minWidth: 0,
                        padding: "14px",
                      }}
                    >
                      <h4
                        id={`exam-${exam.id}-part-${part.type}`}
                        style={{
                          color: "#344054",
                          fontSize: "15px",
                          margin: 0,
                        }}
                      >
                        {part.label}
                      </h4>
                      {part.resources.length === 0 ? (
                        <span style={{ color: "#98a2b3", fontSize: "14px" }}>
                          Not uploaded
                        </span>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "9px",
                          }}
                        >
                          {part.resources.map((resource) => (
                            <a
                              key={`${part.type}-${resource.type}`}
                              href={resource.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={resourceLinkStyle}
                            >
                              {resource.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
