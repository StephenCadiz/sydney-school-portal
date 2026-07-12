"use client";

import { useEffect, useState } from "react";

import StudentMenu from "../StudentMenu";
import { getStudentResults } from "../../../lib/progress";
import {
  getCurrentStudentCourseInfo,
  getCurrentUser,
} from "../../../lib/user";

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e6eaf2",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
};

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function average(values: Array<number | null>) {
  const numericValues = values.filter(
    (value): value is number => value !== null
  );

  if (numericValues.length === 0) {
    return null;
  }

  return (
    numericValues.reduce((total, value) => total + value, 0) /
    numericValues.length
  );
}

function formatPercent(value: number | null) {
  if (value === null) return "-";

  return `${Math.round(value)}%`;
}

function getMotivation(value: number | null) {
  if (value === null) return "Keep going - your progress will appear here.";
  if (value >= 80) return "Excellent progress";
  if (value >= 70) return "Very good progress";
  if (value >= 60) return "Good progress";
  if (value >= 50) return "Keep going - you are improving";

  return "Keep practising - small improvements matter";
}

function ProgressBar({
  value,
  strong = false,
}: {
  value: number | null;
  strong?: boolean;
}) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div
      style={{
        height: "9px",
        background: "#eef2f7",
        borderRadius: "999px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${width}%`,
          height: "100%",
          background: strong ? "#1f3c88" : "#5f7dcc",
          borderRadius: "999px",
        }}
      />
    </div>
  );
}

function SkillProgressCard({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "14px",
          marginBottom: "12px",
        }}
      >
        <h3
          style={{
            color: "#1f3c88",
            margin: 0,
            fontSize: "17px",
          }}
        >
          {label}
        </h3>

        <strong style={{ color: "#1f3c88" }}>
          {formatPercent(value)}
        </strong>
      </div>

      <ProgressBar value={value} />
    </div>
  );
}

export default function ProgressPage() {
  const [results, setResults] = useState<any[]>([]);
  const [level, setLevel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const readingLabel =
    level === "B1" ? "Reading" : "Reading and Use of English";

  const weeklyResults = results.filter(
    (result) => result.result_type === "homework"
  );
  const mockResults = results.filter(
    (result) => result.result_type === "mock"
  );

  const weeklyOverallAverage = average(
    weeklyResults.map((result) => toNumber(result.percentage))
  );

  const weeklySkillAverages = {
    reading: average(
      weeklyResults
        .filter((result) => result.skill === "reading")
        .map((result) => toNumber(result.percentage))
    ),
    listening: average(
      weeklyResults
        .filter((result) => result.skill === "listening")
        .map((result) => toNumber(result.percentage))
    ),
    writing: average(
      weeklyResults
        .filter((result) => result.skill === "writing")
        .map((result) => toNumber(result.percentage))
    ),
  };

  useEffect(() => {
    async function loadProgress() {
      try {
        const user = await getCurrentUser();
        const courseInfo = await getCurrentStudentCourseInfo();
        const data = await getStudentResults(user.id);

        setLevel(courseInfo.level);
        setResults(data);
      } catch (error) {
        console.error(error);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    loadProgress();
  }, []);

  function getMockAverage(result: any) {
    const reading = toNumber(result.reading);
    const writing = toNumber(result.writing);
    const listening = toNumber(result.listening);
    const speaking = toNumber(result.speaking);

    if (
      reading !== null &&
      writing !== null &&
      listening !== null &&
      speaking !== null
    ) {
      return average([reading, writing, listening, speaking]);
    }

    return toNumber(result.overall);
  }

  function getMockTitle(result: any) {
    if (result.mock_number) {
      return `Mock Exam ${result.mock_number}`;
    }

    return result.title || "Mock Exam";
  }

  function renderMockSkill(label: string, value: number | null) {
    return (
      <div
        style={{
          display: "grid",
          gap: "7px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            color: "#333",
            fontSize: "14px",
          }}
        >
          <span>{label}</span>
          <strong>{formatPercent(value)}</strong>
        </div>

        <ProgressBar value={value} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f5f7fa",
      }}
    >
      <StudentMenu />

      <main
        style={{
          flex: 1,
          padding: "40px",
        }}
      >
        <h1
          style={{
            color: "#1f3c88",
            fontSize: "34px",
            margin: "0 0 10px",
          }}
        >
          Student Progress
        </h1>

        <p
          style={{
            color: "#667085",
            marginBottom: "30px",
            fontSize: "17px",
          }}
        >
          Track your exam practice, mock exam results and overall
          progress.
        </p>

        {loading && (
          <div style={cardStyle}>
            <p style={{ margin: 0 }}>Loading progress...</p>
          </div>
        )}

        {!loading && error && (
          <div style={cardStyle}>
            <p style={{ margin: 0 }}>Unable to load progress.</p>
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <div style={cardStyle}>
            <p style={{ margin: 0 }}>No progress results yet.</p>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <>
            <section
              style={{
                ...cardStyle,
                marginBottom: "26px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "24px",
                  alignItems: "center",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <h2
                    style={{
                      color: "#1f3c88",
                      margin: "0 0 6px",
                      fontSize: "20px",
                    }}
                  >
                    Overall Weekly Practice Average
                  </h2>

                  <p
                    style={{
                      color: "#667085",
                      margin: 0,
                      fontSize: "14px",
                    }}
                  >
                    {getMotivation(weeklyOverallAverage)}
                  </p>
                </div>

                <strong
                  style={{
                    color: "#1f3c88",
                    fontSize: "34px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPercent(weeklyOverallAverage)}
                </strong>
              </div>

              <ProgressBar value={weeklyOverallAverage} strong />
            </section>

            <section style={{ marginBottom: "32px" }}>
              <h2
                style={{
                  color: "#1f3c88",
                  margin: "0 0 16px",
                  fontSize: "23px",
                }}
              >
                Weekly Practice Progress
              </h2>

              {weeklyResults.length === 0 ? (
                <div style={cardStyle}>
                  <p style={{ margin: 0 }}>
                    No weekly practice results yet.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "16px",
                  }}
                >
                  <SkillProgressCard
                    label={readingLabel}
                    value={weeklySkillAverages.reading}
                  />
                  <SkillProgressCard
                    label="Listening"
                    value={weeklySkillAverages.listening}
                  />
                  <SkillProgressCard
                    label="Writing"
                    value={weeklySkillAverages.writing}
                  />
                </div>
              )}
            </section>

            <section style={{ marginBottom: "32px" }}>
              <h2
                style={{
                  color: "#1f3c88",
                  margin: "0 0 16px",
                  fontSize: "23px",
                }}
              >
                Mock Exam Progress
              </h2>

              {mockResults.length === 0 ? (
                <div style={cardStyle}>
                  <p style={{ margin: 0 }}>
                    No mock exam results yet.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "18px",
                  }}
                >
                  {mockResults.map((result) => {
                    const reading = toNumber(result.reading);
                    const writing = toNumber(result.writing);
                    const listening = toNumber(result.listening);
                    const speaking = toNumber(result.speaking);
                    const mockAverage = getMockAverage(result);

                    return (
                      <article key={result.id} style={cardStyle}>
                        <h3
                          style={{
                            color: "#1f3c88",
                            margin: "0 0 16px",
                            fontSize: "19px",
                          }}
                        >
                          {getMockTitle(result)}
                        </h3>

                        <div
                          style={{
                            display: "grid",
                            gap: "13px",
                          }}
                        >
                          {renderMockSkill(readingLabel, reading)}
                          {renderMockSkill("Writing", writing)}
                          {renderMockSkill("Listening", listening)}
                          {renderMockSkill("Speaking", speaking)}

                          <div
                            style={{
                              borderTop: "1px solid #eef2f7",
                              paddingTop: "13px",
                              display: "grid",
                              gap: "8px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                color: "#1f3c88",
                                fontWeight: 800,
                              }}
                            >
                              <span>Average</span>
                              <span>{formatPercent(mockAverage)}</span>
                            </div>

                            <ProgressBar value={mockAverage} strong />
                          </div>
                        </div>

                        {result.comments && (
                          <p
                            style={{
                              color: "#667085",
                              margin: "16px 0 0",
                              lineHeight: 1.55,
                              fontSize: "14px",
                            }}
                          >
                            {result.comments}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <h2
                style={{
                  color: "#1f3c88",
                  margin: "0 0 16px",
                  fontSize: "23px",
                }}
              >
                Recent Practice Results
              </h2>

              {weeklyResults.length === 0 ? (
                <div style={cardStyle}>
                  <p style={{ margin: 0 }}>
                    No weekly practice results yet.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  {weeklyResults.slice(0, 5).map((result) => {
                    const score = toNumber(result.percentage);
                    const skillLabel =
                      result.skill === "reading"
                        ? readingLabel
                        : result.skill === "listening"
                        ? "Listening"
                        : result.skill === "writing"
                        ? "Writing"
                        : "Practice";

                    return (
                      <div
                        key={result.id}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #e6eaf2",
                          borderRadius: "10px",
                          padding: "14px 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "18px",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <strong style={{ color: "#1f3c88" }}>
                            {result.title || "Weekly practice"}
                          </strong>
                          <div
                            style={{
                              color: "#667085",
                              fontSize: "14px",
                              marginTop: "4px",
                            }}
                          >
                            {skillLabel}
                          </div>
                        </div>

                        <strong
                          style={{
                            color: "#1f3c88",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatPercent(score)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
