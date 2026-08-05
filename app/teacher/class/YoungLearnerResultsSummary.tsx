"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  getUnitExamResultsForClass,
  isTeensUnitExamLevel,
} from "../../../lib/unitExamResults";

type ResultPart = {
  field: "reading_writing" | "reading" | "writing" | "listening" | "speaking";
  label: string;
};

type LatestPartResult = {
  label: string;
  score: number;
};

type StudentResultSummary = {
  id: string;
  name: string;
  average: number | null;
  parts: LatestPartResult[];
};

function getStudentName(student: any) {
  return `${student?.first_name || ""} ${student?.last_name || ""}`.trim() ||
    "Unnamed student";
}

function getResultParts(levelName: string): ResultPart[] {
  return isTeensUnitExamLevel(levelName)
    ? [
        { field: "reading", label: "Reading" },
        { field: "writing", label: "Writing" },
        { field: "listening", label: "Listening" },
        { field: "speaking", label: "Speaking" },
      ]
    : [
        { field: "reading_writing", label: "Reading/Writing" },
        { field: "listening", label: "Listening" },
        { field: "speaking", label: "Speaking" },
      ];
}

function validScore(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return (
    Math.round(
      (values.reduce((total, value) => total + value, 0) / values.length) * 10
    ) / 10
  );
}

function formatPercentage(value: number | null) {
  if (value === null) return "—";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getPerformanceTone(value: number) {
  if (value >= 75) return "is-positive";
  if (value >= 60) return "is-neutral";
  return "is-warning";
}

function getStudentStatus(parts: LatestPartResult[]) {
  if (parts.length === 0) {
    return { label: "No results", tone: "is-empty" };
  }

  return parts.some((part) => part.score < 60)
    ? { label: "Requires attention", tone: "is-warning" }
    : { label: "On track", tone: "is-positive" };
}

function resultTimestamp(result: any) {
  const assessmentDate = Date.parse(
    String(result?.assessment_date || result?.exam_date || "")
  );
  if (Number.isFinite(assessmentDate)) return assessmentDate;

  const createdAt = Date.parse(String(result?.created_at || ""));
  return Number.isFinite(createdAt) ? createdAt : Number.NEGATIVE_INFINITY;
}

function isCurrentRecord(result: any) {
  return (
    result &&
    result.active !== false &&
    result.deleted_at == null &&
    result.archived_at == null
  );
}

function latestScoreForPart(results: any[], field: ResultPart["field"]) {
  return results.reduce<{ score: number; timestamp: number } | null>(
    (latest, result) => {
      const score = validScore(result?.[field]);
      if (score === null) return latest;

      const candidate = { score, timestamp: resultTimestamp(result) };
      return !latest || candidate.timestamp > latest.timestamp ? candidate : latest;
    },
    null
  );
}

export default function YoungLearnerResultsSummary({
  classId,
  levelName,
  youngLearners,
}: {
  classId: string;
  levelName: string;
  youngLearners: any[];
}) {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadResults() {
      setLoading(true);
      setError("");

      try {
        const data = await getUnitExamResultsForClass(classId);
        if (!active) return;

        setResults(
          (data || []).filter(
            (result) =>
              String(result?.class_id || "") === classId &&
              isCurrentRecord(result)
          )
        );
      } catch (loadError) {
        if (!active) return;
        console.error("Unable to load Young Learner class results:", loadError);
        setError("Class results could not be loaded. Please try again.");
        setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadResults();

    return () => {
      active = false;
    };
  }, [classId]);

  const parts = useMemo(() => getResultParts(levelName), [levelName]);
  const summaries = useMemo(() => {
    const learnerIds = new Set(youngLearners.map((student) => student.id));
    const resultsByLearner = new Map<string, any[]>();

    results.forEach((result) => {
      const learnerId = String(result?.young_learner_id || "");
      if (!learnerIds.has(learnerId)) return;

      resultsByLearner.set(learnerId, [
        ...(resultsByLearner.get(learnerId) || []),
        result,
      ]);
    });

    return youngLearners
      .map((student) => {
        const studentResults = resultsByLearner.get(student.id) || [];
        const latestParts = parts.flatMap((part) => {
          const latest = latestScoreForPart(studentResults, part.field);
          return latest ? [{ label: part.label, score: latest.score }] : [];
        });

        return {
          id: student.id,
          name: getStudentName(student),
          average: average(latestParts.map((part) => part.score)),
          parts: latestParts,
        } satisfies StudentResultSummary;
      })
      .sort((first, second) => first.name.localeCompare(second.name));
  }, [parts, results, youngLearners]);

  const recordedStudents = summaries.filter((student) => student.parts.length > 0);
  const classAverage = average(
    recordedStudents
      .map((student) => student.average)
      .filter((value): value is number => value !== null)
  );
  const partAverages = parts.flatMap((part) => {
    const value = average(
      summaries
        .map((student) =>
          student.parts.find((studentPart) => studentPart.label === part.label)
        )
        .map((studentPart) => studentPart?.score)
        .filter((value): value is number => value !== undefined)
    );

    return value === null ? [] : [{ label: part.label, value }];
  });
  const warnings = summaries
    .map((student) => ({
      ...student,
      parts: student.parts
        .filter((part) => part.score < 60)
        .sort(
          (first, second) =>
            first.score - second.score || first.label.localeCompare(second.label)
        ),
    }))
    .filter((student) => student.parts.length > 0)
    .sort(
      (first, second) =>
        first.parts[0].score - second.parts[0].score ||
        first.name.localeCompare(second.name) ||
        first.parts[0].label.localeCompare(second.parts[0].label)
    );

  return (
    <div className="young-learner-results-summary">
      <header className="young-learner-results-summary-header">
        <div>
          <h2>Young Learner Results</h2>
          <p>
            Latest recorded Unit Exam results for this class. Open an individual
            learner workspace to add or manage results.
          </p>
        </div>
        <span className="young-learner-results-read-only">Read only</span>
      </header>

      <section className="young-learner-results-summary-metrics" aria-label="Class results summary">
        <article>
          <div>
            <span>Students in class</span>
            <strong>{youngLearners.length}</strong>
          </div>
        </article>
        <article>
          <div>
            <span>Students with results</span>
            <strong>{recordedStudents.length}</strong>
          </div>
        </article>
        <article>
          <div>
            <span>Class average</span>
            <strong>{formatPercentage(classAverage)}</strong>
          </div>
        </article>
      </section>

      {loading ? (
        <section className="young-learner-results-summary-card young-learner-results-summary-state" role="status">
          Loading class results…
        </section>
      ) : error ? (
        <section className="young-learner-results-summary-card young-learner-results-summary-state is-error" role="alert">
          {error}
        </section>
      ) : (
        <>
          <section className="young-learner-results-section-card">
            <div className="young-learner-results-section-heading">
              <div>
                <h3>Class averages by result part</h3>
                <p>Each average uses each learner&apos;s latest valid recorded score.</p>
              </div>
            </div>
            {partAverages.length === 0 ? (
              <p className="young-learner-results-empty-state">
                No valid Unit Exam result parts have been recorded for this class.
              </p>
            ) : (
              <div className="young-learner-results-part-averages">
                {partAverages.map((part) => (
                  <article
                    className={getPerformanceTone(part.value)}
                    key={part.label}
                  >
                    <span>{part.label}</span>
                    <strong>{formatPercentage(part.value)}</strong>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="young-learner-results-section-card">
            <div className="young-learner-results-section-heading">
              <div>
                <h3>Student results summary</h3>
                <p>Current summary averages exclude any missing result parts.</p>
              </div>
            </div>
            {summaries.length === 0 ? (
              <p className="young-learner-results-empty-state">
                No students have been added to this class yet.
              </p>
            ) : (
              <div className="young-learner-results-table-wrap">
                <table className="young-learner-results-table">
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Latest result parts</th>
                      <th scope="col">Summary average</th>
                      <th scope="col">Status</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((student) => {
                      const status = getStudentStatus(student.parts);

                      return (
                        <tr key={student.id}>
                          <th data-label="Student" scope="row">
                            <span className="young-learner-results-avatar" aria-hidden="true">
                              {getInitials(student.name)}
                            </span>
                            <strong>{student.name}</strong>
                          </th>
                          <td data-label="Latest result parts">
                            {student.parts.length === 0 ? (
                              <span className="young-learner-results-no-parts">
                                No valid Unit Exam result parts recorded.
                              </span>
                            ) : (
                              <dl className="young-learner-results-parts">
                                {student.parts.map((part) => (
                                  <div key={part.label}>
                                    <dt>{part.label}</dt>
                                    <dd>{formatPercentage(part.score)}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </td>
                          <td data-label="Summary average">
                            <strong className="young-learner-results-average">
                              {formatPercentage(student.average)}
                            </strong>
                          </td>
                          <td data-label="Status">
                            <span className={`young-learner-results-status ${status.tone}`}>
                              {status.label}
                            </span>
                          </td>
                          <td data-label="Action">
                            <Link
                              href={`/teacher/class/young-learner/${encodeURIComponent(
                                student.id
                              )}?classId=${encodeURIComponent(classId)}`}
                              className="young-learner-results-open-link"
                            >
                              Open workspace
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="young-learner-results-section-card young-learner-results-attention">
            <div className="young-learner-results-section-heading">
              <div>
                <h3>Students Requiring Attention</h3>
                <p>Latest recorded result parts below 60%.</p>
              </div>
            </div>
            {warnings.length === 0 ? (
              <p className="young-learner-results-summary-muted">
                No recorded result parts are currently below 60%.
              </p>
            ) : (
              <div className="young-learner-results-warning-list">
                {warnings.map((student) => (
                  <article key={student.id}>
                    <div>
                      <strong>{student.name}</strong>
                      <ul>
                        {student.parts.map((part) => (
                          <li key={part.label}>
                            {part.label} — {formatPercentage(part.score)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Link
                      href={`/teacher/class/young-learner/${encodeURIComponent(
                        student.id
                      )}?classId=${encodeURIComponent(classId)}`}
                      className="young-learner-results-open-link"
                    >
                      Open workspace
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
