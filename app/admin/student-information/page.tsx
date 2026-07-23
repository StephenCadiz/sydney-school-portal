"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import { getCambridgeReadingSkillLabel } from "../../../lib/homework";
import {
  formatAverage,
  getClassInformation,
  getClassResultsSummary,
  getClassSearchOptions,
  getLevelAnalysis,
  getLevelAnalysisOptions,
  getStudentInformation,
  searchAllStudents,
} from "../../../lib/studentInformation";

const tabs = ["Student Search", "Class Search", "Level Analysis"];

const cardStyle = {
  background: "#ffffff",
  border: "1px solid var(--ss-border)",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
} as const;

const inputStyle = {
  width: "100%",
  padding: "13px 14px",
  border: "1px solid var(--ss-border)",
  borderRadius: "10px",
  color: "#111827",
  background: "#ffffff",
  fontSize: "15px",
  boxSizing: "border-box" as const,
};

function getBadgeStyle(type: string) {
  const isCambridge = type === "cambridge";

  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "5px 10px",
    fontSize: "12px",
    fontWeight: 700,
    background: isCambridge ? "#eaf5fc" : "#edf7f1",
    color: isCambridge ? "var(--ss-blue-dark)" : "#236b3b",
    border: isCambridge ? "1px solid #c8e1f5" : "1px solid #cfe9d8",
  };
}

function getTypeLabel(type: string) {
  return type === "young_learner" ? "Young Learner" : "Cambridge";
}

function getSkillLabel(skill: string, levelName: string) {
  if (skill === "reading") {
    return getCambridgeReadingSkillLabel(levelName);
  }

  if (skill === "listening") return "Listening";
  if (skill === "writing") return "Writing";

  return skill || "Practice";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Date not available";
  }

  const dateValue = value.includes("T") ? value : `${value}T00:00:00`;

  return new Date(dateValue).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPublishedDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function formatFridayTutorialPercent(value: any) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  const rounded = Math.round(number * 10) / 10;

  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

function getMockPublicationBadgeStyle(isPublished: boolean) {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "5px 10px",
    fontSize: "12px",
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: "nowrap" as const,
    background: isPublished ? "#edf7f1" : "#fff7e6",
    border: isPublished ? "1px solid #cfe9d8" : "1px solid #f3d49b",
    color: isPublished ? "#236b3b" : "#8a5a00",
  };
}

function getMockDisplayName(row: any) {
  const mockNumber = Number(row?.mock_number);

  if (!Number.isFinite(mockNumber) || mockNumber <= 0) {
    return "Mock Exam";
  }

  return `Mock ${mockNumber}`;
}

function getMockSortValue(row: any) {
  const mockNumber = Number(row?.mock_number);

  return Number.isFinite(mockNumber) && mockNumber > 0
    ? mockNumber
    : Number.POSITIVE_INFINITY;
}

function formatMockScore(value: any) {
  const formatted = formatAverage(value);
  return formatted === "-" ? formatted : `${formatted}%`;
}

function MockScoreCell({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: any;
  emphasized?: boolean;
}) {
  return (
    <div
      style={{
        border: emphasized
          ? "1px solid #b9d8f0"
          : "1px solid var(--ss-border)",
        borderRadius: "10px",
        padding: "12px",
        background: emphasized ? "#eef6fd" : "#ffffff",
        minWidth: 0,
      }}
    >
      <p
        style={{
          color: emphasized ? "var(--ss-blue-dark)" : "#667085",
          fontSize: "13px",
          fontWeight: emphasized ? 800 : 400,
          lineHeight: 1.35,
          margin: "0 0 6px",
        }}
      >
        {label}
      </p>
      <strong style={{ color: "var(--ss-blue-dark)", fontSize: "22px" }}>
        {formatMockScore(value)}
      </strong>
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--ss-border)",
        borderRadius: "12px",
        padding: "15px",
        background: "#f8fafd",
      }}
    >
      <p style={{ color: "#667085", margin: "0 0 6px", fontSize: "13px" }}>
        {label}
      </p>
      <strong style={{ color: "var(--ss-blue-dark)", fontSize: "22px" }}>
        {value}
      </strong>
    </div>
  );
}

function FridayTutorialAdminSummary({ summary }: { summary: any }) {
  const attendance = summary?.attendance || {};
  const averages = summary?.averages || [];

  return (
    <div>
      <h3 style={{ color: "#111827", margin: "0 0 12px", fontSize: "17px" }}>
        Friday Tutorial Progress
      </h3>

      {!summary?.has_results ? (
        <p style={{ color: "#667085", margin: "12px 0 0" }}>
          No Friday tutorial results found.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: "12px",
            }}
          >
            <StatCard
              label="Attendance"
              value={
                attendance.attendance_percentage === null
                  ? "-"
                  : formatFridayTutorialPercent(attendance.attendance_percentage)
              }
            />
            <StatCard
              label="Tutorials attended"
              value={`${attendance.attended_count || 0} of ${
                attendance.eligible_count || 0
              }`}
            />
            <StatCard label="Absences" value={attendance.absent_count || 0} />
          </div>

          <div
            style={{
              border: "1px solid var(--ss-border)",
              borderRadius: "12px",
              padding: "14px",
              background: "#f8fafd",
            }}
          >
            <h4
              style={{
                color: "var(--ss-blue-dark)",
                fontSize: "15px",
                margin: "0 0 10px",
              }}
            >
              Average Results by Skill & Part
            </h4>

            {averages.length === 0 ? (
              <p style={{ color: "#667085", margin: 0 }}>
                No scored tutorial attempts yet.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px",
                }}
              >
                {averages.map((item: any) => (
                  <div
                    key={item.practice_key}
                    style={{
                      background: "#ffffff",
                      border: "1px solid var(--ss-border)",
                      borderRadius: "10px",
                      padding: "12px",
                    }}
                  >
                    <p
                      style={{
                        color: "#667085",
                        fontSize: "13px",
                        lineHeight: 1.35,
                        margin: "0 0 6px",
                      }}
                    >
                      {item.practice_label || "Tutorial practice"}
                    </p>
                    <strong
                      style={{
                        color: "var(--ss-blue-dark)",
                        fontSize: "22px",
                      }}
                    >
                      {formatFridayTutorialPercent(item.average)}
                    </strong>
                    <p
                      style={{
                        color: "#667085",
                        fontSize: "12px",
                        margin: "6px 0 0",
                      }}
                    >
                      {item.count || 0} attempt{item.count === 1 ? "" : "s"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        color: "var(--ss-blue-dark)",
        margin: "0 0 14px",
        fontSize: "21px",
      }}
    >
      {children}
    </h2>
  );
}

function PlaceholderCard({ title }: { title: string }) {
  return (
    <section style={cardStyle}>
      <SectionTitle>{title}</SectionTitle>
      <p style={{ color: "#667085", margin: 0 }}>{title} coming next.</p>
    </section>
  );
}

function CambridgeResults({
  student,
  section,
}: {
  student: any;
  section: "homework" | "friday" | "mocks";
}) {
  const practice = student.results_summary?.practice || {};
  const mock = student.results_summary?.mock || {};
  const fridayTutorial = student.results_summary?.friday_tutorial || {};
  const readingLabel = getCambridgeReadingSkillLabel(student.level_name);
  const mockRows = [...(mock.rows || [])].sort((first: any, second: any) => {
    const firstSort = getMockSortValue(first);
    const secondSort = getMockSortValue(second);

    if (firstSort !== secondSort) {
      return firstSort - secondSort;
    }

    return String(first.created_at || "").localeCompare(
      String(second.created_at || "")
    );
  });

  return (
    <section style={cardStyle}>
      <SectionTitle>
        {section === "homework"
          ? "Homework Results"
          : section === "friday"
            ? "Friday Tutorial Results"
            : "Mock Exam Results"}
      </SectionTitle>

      <div style={{ display: "grid", gap: "18px" }}>
        {section === "homework" && <div>
          <h3 style={{ color: "#111827", margin: "0 0 12px", fontSize: "17px" }}>
            Practice / Homework Results
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: "12px",
            }}
          >
            {(practice.skill_averages || []).map((item: any) => (
              <StatCard
                key={item.skill}
                label={getSkillLabel(item.skill, student.level_name)}
                value={formatAverage(item.average)}
              />
            ))}
            <StatCard
              label="Overall practice average"
              value={formatAverage(practice.overall_average)}
            />
          </div>

          {(!practice.skill_averages || practice.skill_averages.length === 0) && (
            <p style={{ color: "#667085", margin: "12px 0 0" }}>
              No practice results found.
            </p>
          )}
        </div>}

        {section === "friday" && (
          <FridayTutorialAdminSummary summary={fridayTutorial} />
        )}

        {section === "mocks" && <div>
          <h3 style={{ color: "#111827", margin: "0 0 12px", fontSize: "17px" }}>
            Mock Exam Results
          </h3>

          {mockRows.length > 0 ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {mockRows.map((row: any) => {
                const isPublished = Boolean(row.published_at);
                const publishedDate = formatPublishedDate(row.published_at);

                return (
                  <div
                    key={row.id}
                    style={{
                      border: "1px solid var(--ss-border)",
                      borderRadius: "12px",
                      padding: "14px",
                      background: "#f8fafd",
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(145px, 1fr))",
                      gap: "12px",
                      alignItems: "stretch",
                    }}
                  >
                    <div
                      style={{
                        border: "1px solid var(--ss-border)",
                        borderRadius: "10px",
                        padding: "12px",
                        background: "#ffffff",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <strong style={{ color: "var(--ss-blue-dark)" }}>
                          {getMockDisplayName(row)}
                        </strong>
                        <span style={getMockPublicationBadgeStyle(isPublished)}>
                          {isPublished ? "Published" : "Draft"}
                        </span>
                      </div>

                      <p
                        style={{
                          color: isPublished ? "#236b3b" : "#667085",
                          margin: "8px 0 0",
                          fontSize: "13px",
                          fontWeight: isPublished ? 700 : 500,
                          lineHeight: 1.4,
                        }}
                      >
                        {isPublished
                          ? "Visible to student"
                          : "Not visible to student"}
                      </p>

                      {isPublished && publishedDate && (
                        <p
                          style={{
                            color: "#667085",
                            margin: "4px 0 0",
                            fontSize: "12px",
                            lineHeight: 1.4,
                          }}
                        >
                          Published {publishedDate}
                        </p>
                      )}
                    </div>

                    <MockScoreCell label={readingLabel} value={row.reading} />
                    <MockScoreCell label="Writing" value={row.writing} />
                    <MockScoreCell label="Listening" value={row.listening} />
                    <MockScoreCell label="Speaking" value={row.speaking} />
                    <MockScoreCell
                      label="Average"
                      value={row.row_average}
                      emphasized
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "#667085", margin: "12px 0 0" }}>
              No Mock Exam results found.
            </p>
          )}
        </div>}
      </div>
    </section>
  );
}

function YoungLearnerResults({ student }: { student: any }) {
  const summary = student.results_summary || {};
  const averages = summary.averages || {};
  const rows = summary.rows || [];

  return (
    <section style={cardStyle}>
      <SectionTitle>Unit Exam Results</SectionTitle>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        {summary.is_teens ? (
          <>
            <StatCard label="Reading" value={formatAverage(averages.reading)} />
            <StatCard label="Writing" value={formatAverage(averages.writing)} />
          </>
        ) : (
          <StatCard
            label="Reading/Writing"
            value={formatAverage(averages.reading_writing)}
          />
        )}
        <StatCard label="Listening" value={formatAverage(averages.listening)} />
        <StatCard label="Speaking" value={formatAverage(averages.speaking)} />
        <StatCard label="Overall average" value={formatAverage(averages.overall)} />
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "#667085", margin: 0 }}>
          No Unit Exam results found.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {rows.map((row: any) => (
            <div
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: summary.is_teens
                  ? "1fr repeat(5, minmax(90px, auto))"
                  : "1fr repeat(4, minmax(110px, auto))",
                gap: "10px",
                alignItems: "center",
                border: "1px solid var(--ss-border)",
                borderRadius: "10px",
                padding: "12px",
                background: "#f8fafd",
              }}
            >
              <strong style={{ color: "#111827" }}>
                Unit Exam {row.unit_exam_number || "-"}
              </strong>
              {summary.is_teens ? (
                <>
                  <span>Reading: {formatAverage(row.reading)}</span>
                  <span>Writing: {formatAverage(row.writing)}</span>
                </>
              ) : (
                <span>Reading/Writing: {formatAverage(row.reading_writing)}</span>
              )}
              <span>Listening: {formatAverage(row.listening)}</span>
              <span>Speaking: {formatAverage(row.speaking)}</span>
              <span>Average: {formatAverage(row.row_average)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ClassSummaryCard({ summary, levelName }: { summary: any; levelName: string }) {
  if (!summary?.has_results) {
    return (
      <section style={cardStyle}>
        <SectionTitle>Class Summary</SectionTitle>
        <p style={{ color: "#667085", margin: 0 }}>
          No results have been entered for this class yet.
        </p>
      </section>
    );
  }

  if (summary.type === "cambridge") {
    const practice = summary.practice || {};
    const mock = summary.mock || {};

    return (
      <section style={cardStyle}>
        <SectionTitle>Class Summary</SectionTitle>

        <div style={{ display: "grid", gap: "18px" }}>
          <div>
            <h3 style={{ color: "#111827", margin: "0 0 12px", fontSize: "17px" }}>
              Practice / Homework Results
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "12px",
              }}
            >
              {(practice.skill_averages || []).map((item: any) => (
                <StatCard
                  key={item.skill}
                  label={getSkillLabel(item.skill, levelName)}
                  value={formatAverage(item.average)}
                />
              ))}
              <StatCard
                label="Overall practice average"
                value={formatAverage(practice.overall_average)}
              />
            </div>
          </div>

          <div>
            <h3 style={{ color: "#111827", margin: "0 0 12px", fontSize: "17px" }}>
              Mock Exam Results
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "12px",
              }}
            >
              <StatCard label="Reading" value={formatAverage(mock.reading_average)} />
              <StatCard label="Writing" value={formatAverage(mock.writing_average)} />
              <StatCard label="Listening" value={formatAverage(mock.listening_average)} />
              <StatCard label="Speaking" value={formatAverage(mock.speaking_average)} />
              <StatCard label="Overall" value={formatAverage(mock.overall_average)} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  const averages = summary.averages || {};

  return (
    <section style={cardStyle}>
      <SectionTitle>Class Summary</SectionTitle>
      <h3 style={{ color: "#111827", margin: "0 0 12px", fontSize: "17px" }}>
        Unit Exam Results
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
        }}
      >
        {summary.is_teens ? (
          <>
            <StatCard label="Reading" value={formatAverage(averages.reading)} />
            <StatCard label="Writing" value={formatAverage(averages.writing)} />
          </>
        ) : (
          <StatCard
            label="Reading/Writing"
            value={formatAverage(averages.reading_writing)}
          />
        )}
        <StatCard label="Listening" value={formatAverage(averages.listening)} />
        <StatCard label="Speaking" value={formatAverage(averages.speaking)} />
        <StatCard label="Overall" value={formatAverage(averages.overall)} />
      </div>
    </section>
  );
}

type ClassPickerProgramme = "all" | "cambridge" | "young-learners" | "support";

const classPickerDayOrder = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const classPickerDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getClassPickerProgramme(option: any): Exclude<ClassPickerProgramme, "all"> {
  if (String(option.level_name || "").trim().toLowerCase() === "support classes") {
    return "support";
  }

  return option.is_cambridge ? "cambridge" : "young-learners";
}

function formatClassPickerCourseType(value: any) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "";
}

function getClassPickerDayIndexes(value: any) {
  const normalized = String(value || "").toLowerCase();
  return classPickerDayOrder
    .map((day, index) => normalized.includes(day) ? index : -1)
    .filter((index) => index >= 0);
}

function formatClassPickerDays(value: any) {
  const indexes = getClassPickerDayIndexes(value);
  if (indexes.length === 0) return String(value || "").trim();

  const consecutive = indexes.length >= 3 && indexes.every(
    (index, position) => position === 0 || index === indexes[position - 1] + 1
  );
  if (consecutive) {
    return `${classPickerDayLabels[indexes[0]]}–${classPickerDayLabels[indexes[indexes.length - 1]]}`;
  }

  const labels = indexes.map((index) => classPickerDayLabels[index]);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} & ${labels.at(-1)}`;
}

function formatClassPickerTime(value: any) {
  const match = String(value || "").match(/^(\d{1,2}:\d{2})/);
  return match?.[1] || "";
}

function getClassPickerSchedule(option: any) {
  const days = formatClassPickerDays(option.days);
  const start = formatClassPickerTime(option.start_time);
  const end = formatClassPickerTime(option.end_time);
  const time = start && end ? `${start}–${end}` : start || end;
  return [days, time].filter(Boolean).join(" · ");
}

function getClassPickerPrimaryLabel(option: any) {
  const level = String(option.level_name || "Unknown level").trim();
  const className = String(option.class_name || "").trim();
  const normalizeName = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const classNameContainsSchedule =
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(className) ||
    /\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(className);
  const name = className &&
    normalizeName(className) !== normalizeName(level) &&
    !classNameContainsSchedule
      ? `${level} — ${className}`
      : level;
  const courseType = getClassPickerProgramme(option) === "cambridge"
    ? formatClassPickerCourseType(option.course_type)
    : "";
  return [name, courseType].filter(Boolean).join(" ");
}

function getClassPickerLevelRank(option: any) {
  const level = String(option.level_name || "").trim().toLowerCase();
  const programme = getClassPickerProgramme(option);
  if (programme === "cambridge") {
    const rank = ["b1", "b2", "c1", "c2"].indexOf(level);
    return rank === -1 ? 99 : rank;
  }
  if (programme === "support") return 0;

  const match = /^(pre[-\s]?kids|kids|junior|teens?)\s*(\d+)?/i.exec(level);
  const familyRank: Record<string, number> = {
    "pre-kids": 0,
    "pre kids": 0,
    kids: 1,
    junior: 2,
    teen: 3,
    teens: 3,
  };
  const family = match?.[1]?.toLowerCase() || "";
  return (familyRank[family] ?? 90) * 100 + Number(match?.[2] || 0);
}

function compareClassPickerOptions(first: any, second: any) {
  const programmeOrder = { cambridge: 0, "young-learners": 1, support: 2 };
  const firstProgramme = getClassPickerProgramme(first);
  const secondProgramme = getClassPickerProgramme(second);
  const programmeDifference = programmeOrder[firstProgramme] - programmeOrder[secondProgramme];
  if (programmeDifference !== 0) return programmeDifference;

  const levelDifference = getClassPickerLevelRank(first) - getClassPickerLevelRank(second);
  if (levelDifference !== 0) return levelDifference;

  const levelNameDifference = String(first.level_name || "").localeCompare(
    String(second.level_name || ""), undefined, { numeric: true, sensitivity: "base" }
  );
  if (levelNameDifference !== 0) return levelNameDifference;

  const courseOrder = { regular: 0, intensive: 1, express: 2, online: 3 };
  const firstCourse = String(first.course_type || "").toLowerCase();
  const secondCourse = String(second.course_type || "").toLowerCase();
  const courseDifference = (courseOrder[firstCourse as keyof typeof courseOrder] ?? 9) -
    (courseOrder[secondCourse as keyof typeof courseOrder] ?? 9);
  if (courseDifference !== 0) return courseDifference;

  const dayDifference = getClassPickerDayIndexes(first.days).join("").localeCompare(
    getClassPickerDayIndexes(second.days).join("")
  );
  if (dayDifference !== 0) return dayDifference;

  const timeDifference = String(first.start_time || "").localeCompare(String(second.start_time || ""));
  if (timeDifference !== 0) return timeDifference;

  return `${first.teacher_name || ""}:${first.class_id || ""}`.localeCompare(
    `${second.teacher_name || ""}:${second.class_id || ""}`,
    undefined,
    { numeric: true, sensitivity: "base" }
  );
}

function ClassSearchPicker({
  classOptions,
  selectedClassId,
  loadingOptions,
  onSelectClass,
}: {
  classOptions: any[];
  selectedClassId: string;
  loadingOptions: boolean;
  onSelectClass: (classId: string) => void;
}) {
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [programmeFilter, setProgrammeFilter] = useState<ClassPickerProgramme>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedOption = classOptions.find((option) => option.class_id === selectedClassId);
  const teachers = useMemo(
    () => Array.from(new Set(classOptions.map((option) => option.teacher_name).filter(Boolean)))
      .sort((first, second) => String(first).localeCompare(String(second), undefined, { sensitivity: "base" })),
    [classOptions]
  );
  const filteredOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...classOptions]
      .filter((option) => teacherFilter === "all" || option.teacher_name === teacherFilter)
      .filter((option) => programmeFilter === "all" || getClassPickerProgramme(option) === programmeFilter)
      .filter((option) => {
        if (!normalizedSearch) return true;
        return [
          option.level_name,
          option.class_name,
          option.class_label,
          option.teacher_name,
          option.course_type,
          option.days,
          option.start_time,
          option.end_time,
          option.option_label,
        ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
      })
      .sort(compareClassPickerOptions);
  }, [classOptions, programmeFilter, search, teacherFilter]);
  const groups = useMemo(() => {
    const grouped = new Map<string, { programme: string; level: string; options: any[] }>();
    const programmeLabels = {
      cambridge: "Cambridge",
      "young-learners": "Young Learners",
      support: "Support",
    };
    filteredOptions.forEach((option) => {
      const programme = getClassPickerProgramme(option);
      const level = String(option.level_name || "Unknown level");
      const key = `${programme}:${level}`;
      const existing = grouped.get(key);
      if (existing) existing.options.push(option);
      else grouped.set(key, { programme: programmeLabels[programme], level, options: [option] });
    });
    return Array.from(grouped.values());
  }, [filteredOptions]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 20);
    function handlePointerDown(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!selectedOption) return;
    const matchesTeacher = teacherFilter === "all" || selectedOption.teacher_name === teacherFilter;
    const matchesProgramme = programmeFilter === "all" ||
      getClassPickerProgramme(selectedOption) === programmeFilter;
    if (!matchesTeacher || !matchesProgramme) onSelectClass("");
  }, [onSelectClass, programmeFilter, selectedOption, teacherFilter]);

  function selectClass(classId: string) {
    onSelectClass(classId);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="admin-student-class-picker-controls">
      <div className="admin-student-class-picker-filters">
        <label>
          <span>Teacher</span>
          <select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}>
            <option value="all">All Teachers</option>
            {teachers.map((teacher) => <option value={teacher} key={teacher}>{teacher}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Programme</legend>
          <div className="admin-student-class-picker-programmes">
            {([
              ["all", "All"],
              ["cambridge", "Cambridge"],
              ["young-learners", "Young Learners"],
              ["support", "Support"],
            ] as Array<[ClassPickerProgramme, string]>).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={programmeFilter === value ? "is-active" : ""}
                onClick={() => setProgrammeFilter(value)}
                aria-pressed={programmeFilter === value}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="admin-student-class-picker-field" ref={pickerRef}>
        <label id="admin-student-class-picker-label">Class</label>
        <button
          type="button"
          className="admin-student-class-picker-trigger"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls="admin-student-class-picker-popover"
          aria-labelledby="admin-student-class-picker-label admin-student-class-picker-value"
          disabled={loadingOptions}
        >
          <span id="admin-student-class-picker-value">
            {loadingOptions
              ? "Loading classes..."
              : selectedOption
                ? [getClassPickerPrimaryLabel(selectedOption), getClassPickerSchedule(selectedOption)]
                    .filter(Boolean)
                    .join(" · ")
                : "Search or select a class..."}
          </span>
          <span aria-hidden="true">⌄</span>
        </button>

        {open && (
          <div
            id="admin-student-class-picker-popover"
            className="admin-student-class-picker-popover"
            role="dialog"
            aria-label="Choose a class"
          >
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search classes..."
              aria-label="Search classes"
              autoComplete="off"
            />
            <div className="admin-student-class-picker-results">
              {groups.length === 0 ? (
                <p>No matching classes found.</p>
              ) : groups.map((group, index) => {
                const showProgramme = index === 0 || groups[index - 1].programme !== group.programme;
                return (
                  <section key={`${group.programme}:${group.level}`}>
                    {showProgramme && <h3>{group.programme}</h3>}
                    <h4>{group.level}</h4>
                    {group.options.map((option) => {
                      const selected = option.class_id === selectedClassId;
                      return (
                        <button
                          type="button"
                          key={option.class_id}
                          className={selected ? "is-selected" : ""}
                          onClick={() => selectClass(option.class_id)}
                          aria-label={`Select ${getClassPickerPrimaryLabel(option)}, ${getClassPickerSchedule(option)}, ${option.teacher_name}`}
                        >
                          <span className="admin-student-class-picker-row-copy">
                            <strong>{getClassPickerPrimaryLabel(option)}</strong>
                            <span>{getClassPickerSchedule(option) || "Schedule not available"}</span>
                            <small>{option.teacher_name || "Teacher not assigned"}</small>
                          </span>
                          {selected && <span className="admin-student-class-picker-check" aria-hidden="true">✓</span>}
                        </button>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClassSearchTab({
  classOptions,
  selectedClassId,
  classInformation,
  classSummary,
  loadingOptions,
  loadingClass,
  onSelectClass,
  onOpenStudent,
}: {
  classOptions: any[];
  selectedClassId: string;
  classInformation: any;
  classSummary: any;
  loadingOptions: boolean;
  loadingClass: boolean;
  onSelectClass: (classId: string) => void;
  onOpenStudent: (student: any) => void;
}) {
  const details = classInformation?.details;
  const students = classInformation?.students || [];

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section style={cardStyle}>
        <SectionTitle>Class Search</SectionTitle>
        <ClassSearchPicker
          classOptions={classOptions}
          selectedClassId={selectedClassId}
          loadingOptions={loadingOptions}
          onSelectClass={onSelectClass}
        />
      </section>

      {loadingClass && (
        <section style={cardStyle}>
          <p style={{ color: "#667085", margin: 0 }}>Loading class information...</p>
        </section>
      )}

      {details && !loadingClass && (
        <>
          <section
            style={{
              ...cardStyle,
              borderLeft: "5px solid var(--ss-blue)",
            }}
          >
            <SectionTitle>Class Details</SectionTitle>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
              }}
            >
              <StatCard label="Level" value={details.level_name} />
              <StatCard label="Teacher" value={details.teacher_name} />
              <StatCard
                label="Days/time"
                value={`${details.days || "-"} ${
                  details.start_time && details.end_time
                    ? `${details.start_time}-${details.end_time}`
                    : ""
                }`}
              />
              <StatCard label="Course type" value={details.course_type_label} />
              <StatCard label="Classroom" value={details.classroom_name} />
            </div>
          </section>

          <section style={cardStyle}>
            <SectionTitle>Students in this class</SectionTitle>
            {students.length === 0 ? (
              <p style={{ color: "#667085", margin: 0 }}>
                No students have been added to this class yet.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {students.map((student: any) => (
                  <button
                    key={`${student.student_type}-${student.id}`}
                    onClick={() => onOpenStudent(student)}
                    className="admin-student-information-student-trigger"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: "#f8fafd",
                      border: "1px solid var(--ss-border)",
                      borderRadius: "12px",
                      padding: "14px",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(180px, 1.2fr) minmax(120px, auto) minmax(110px, auto) minmax(150px, 1fr)",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <strong style={{ color: "var(--ss-blue-dark)" }}>
                        {student.full_name}
                      </strong>
                      <span style={getBadgeStyle(student.student_type)}>
                        {getTypeLabel(student.student_type)}
                      </span>
                      <span style={{ color: "#667085" }}>{student.level_name}</span>
                      <span style={{ color: "#667085" }}>
                        {student.teacher_name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <ClassSummaryCard
            summary={classSummary}
            levelName={details.level_name || ""}
          />
        </>
      )}
    </div>
  );
}

function LevelAnalysisSummary({ analysis }: { analysis: any }) {
  if (!analysis) {
    return null;
  }

  return (
    <section
      style={{
        ...cardStyle,
        borderLeft: "5px solid var(--ss-blue)",
      }}
    >
      <SectionTitle>Level Summary</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px",
        }}
      >
        <StatCard label="Level" value={analysis.level_name || "-"} />
        <StatCard label="Students" value={analysis.student_count || 0} />
        <StatCard label="Classes" value={analysis.class_count || 0} />
        <StatCard label="Results entered" value={analysis.result_count || 0} />
      </div>
    </section>
  );
}

function LevelAveragesCard({ analysis }: { analysis: any }) {
  if (!analysis) {
    return null;
  }

  if (analysis.result_count === 0) {
    return (
      <section style={cardStyle}>
        <SectionTitle>Average Results</SectionTitle>
        <p style={{ color: "#667085", margin: 0 }}>
          No results have been entered for this level yet.
        </p>
      </section>
    );
  }

  if (analysis.type === "cambridge") {
    const practice = analysis.practice || {};
    const mock = analysis.mock || {};

    return (
      <section style={cardStyle}>
        <SectionTitle>Average Results</SectionTitle>
        <div style={{ display: "grid", gap: "18px" }}>
          <div>
            <h3 style={{ color: "#111827", margin: "0 0 12px", fontSize: "17px" }}>
              Practice / Homework Results
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "12px",
              }}
            >
              {(practice.skill_averages || []).map((item: any) => (
                <StatCard
                  key={item.skill}
                  label={getSkillLabel(item.skill, analysis.level_name)}
                  value={formatAverage(item.average)}
                />
              ))}
              <StatCard
                label="Overall practice average"
                value={formatAverage(practice.overall_average)}
              />
              <StatCard
                label="Practice result count"
                value={practice.result_count || 0}
              />
            </div>
          </div>

          <div>
            <h3 style={{ color: "#111827", margin: "0 0 12px", fontSize: "17px" }}>
              Mock Exam Results
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "12px",
              }}
            >
              <StatCard
                label={getCambridgeReadingSkillLabel(analysis.level_name)}
                value={formatAverage(mock.reading_average)}
              />
              <StatCard label="Writing" value={formatAverage(mock.writing_average)} />
              <StatCard label="Listening" value={formatAverage(mock.listening_average)} />
              <StatCard label="Speaking" value={formatAverage(mock.speaking_average)} />
              <StatCard label="Overall" value={formatAverage(mock.overall_average)} />
              <StatCard label="Mock result count" value={mock.result_count || 0} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  const averages = analysis.averages || {};

  return (
    <section style={cardStyle}>
      <SectionTitle>Average Results</SectionTitle>
      <h3 style={{ color: "#111827", margin: "0 0 12px", fontSize: "17px" }}>
        Unit Exam Results
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
        }}
      >
        {analysis.is_teens ? (
          <>
            <StatCard label="Reading" value={formatAverage(averages.reading)} />
            <StatCard label="Writing" value={formatAverage(averages.writing)} />
          </>
        ) : (
          <StatCard
            label="Reading/Writing"
            value={formatAverage(averages.reading_writing)}
          />
        )}
        <StatCard label="Listening" value={formatAverage(averages.listening)} />
        <StatCard label="Speaking" value={formatAverage(averages.speaking)} />
        <StatCard label="Overall" value={formatAverage(averages.overall)} />
      </div>
    </section>
  );
}

function getClassOverallAverage(item: any) {
  if (item.type === "cambridge" || item.practice || item.mock) {
    return (
      item.mock?.overall_average ??
      item.practice?.overall_average ??
      null
    );
  }

  return item.averages?.overall ?? null;
}

function ClassBreakdownCard({ analysis }: { analysis: any }) {
  const classes = analysis?.class_breakdown || [];

  if (!analysis) {
    return null;
  }

  return (
    <section style={cardStyle}>
      <SectionTitle>Class Breakdown</SectionTitle>
      {classes.length === 0 ? (
        <p style={{ color: "#667085", margin: 0 }}>
          No classes found for this level.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {classes.map((item: any) => (
            <div
              key={item.class_id}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(220px, 1.4fr) minmax(130px, 0.7fr) minmax(90px, 0.4fr) minmax(100px, 0.5fr) minmax(100px, 0.5fr)",
                gap: "10px",
                alignItems: "center",
                border: "1px solid var(--ss-border)",
                borderRadius: "12px",
                padding: "14px",
                background: "#f8fafd",
              }}
            >
              <div>
                <strong style={{ color: "var(--ss-blue-dark)" }}>
                  {item.class_label || item.option_label || "Class"}
                </strong>
                <p style={{ color: "#667085", margin: "4px 0 0" }}>
                  {item.days || "-"}{" "}
                  {item.start_time && item.end_time
                    ? `${item.start_time}-${item.end_time}`
                    : ""}
                </p>
              </div>
              <span style={{ color: "#111827" }}>{item.teacher_name}</span>
              <span style={{ color: "#667085" }}>
                Students: {item.student_count || 0}
              </span>
              <span style={{ color: "#667085" }}>
                Results: {item.result_count || 0}
              </span>
              <strong style={{ color: "var(--ss-blue-dark)" }}>
                Avg: {formatAverage(getClassOverallAverage(item))}
              </strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LevelAnalysisTab({
  levelOptions,
  selectedLevel,
  analysis,
  loadingOptions,
  loadingAnalysis,
  onSelectLevel,
}: {
  levelOptions: any[];
  selectedLevel: string;
  analysis: any;
  loadingOptions: boolean;
  loadingAnalysis: boolean;
  onSelectLevel: (levelName: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section style={cardStyle}>
        <SectionTitle>Level Analysis</SectionTitle>
        <label
          style={{
            display: "block",
            color: "#333333",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          Select level
        </label>
        <select
          value={selectedLevel}
          onChange={(event) => onSelectLevel(event.target.value)}
          style={inputStyle}
        >
          <option value="">
            {loadingOptions ? "Loading levels..." : "Select level"}
          </option>
          {levelOptions.map((level) => (
            <option key={level.id} value={level.name}>
              {level.name}
            </option>
          ))}
        </select>
      </section>

      {loadingAnalysis && (
        <section style={cardStyle}>
          <p style={{ color: "#667085", margin: 0 }}>Loading level analysis...</p>
        </section>
      )}

      {analysis && !loadingAnalysis && (
        <>
          <LevelAnalysisSummary analysis={analysis} />
          <LevelAveragesCard analysis={analysis} />
          <ClassBreakdownCard analysis={analysis} />
        </>
      )}
    </div>
  );
}

function FollowUpsSection({ followUps }: { followUps: any[] }) {
  return (
    <section style={cardStyle}>
      <SectionTitle>Follow-Up Documents</SectionTitle>

      {followUps.length === 0 ? (
        <p style={{ color: "#667085", margin: 0 }}>
          No follow-up documents for this student.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          <p style={{ color: "#236b3b", margin: 0, fontWeight: 700 }}>
            Follow-Up documents found
          </p>

          {followUps.map((document) => (
            <article
              key={document.id}
              style={{
                border: "1px solid var(--ss-border)",
                borderRadius: "12px",
                padding: "16px",
                background: "#f8fafd",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <strong style={{ color: "var(--ss-blue-dark)" }}>
                    {document.category || "Other"}
                  </strong>
                  <p style={{ color: "#667085", margin: "4px 0 0" }}>
                    Status: {document.status || "Open"} · Teacher:{" "}
                    {document.teacher_name || "Unknown teacher"}
                  </p>
                </div>
                {document.recommend_friday_tutorial && (
                  <span style={getBadgeStyle("young_learner")}>
                    Friday Tutorial Recommended
                  </span>
                )}
              </div>

              {document.entries.length === 0 ? (
                <p style={{ color: "#667085", margin: 0 }}>
                  No dated entries yet.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {document.entries.map((entry: any, index: number) => (
                    <div
                      key={`${document.id}-${index}`}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e6eaf2",
                        borderRadius: "10px",
                        padding: "12px",
                      }}
                    >
                      <p
                        style={{
                          color: "#667085",
                          fontSize: "13px",
                          margin: "0 0 8px",
                          fontWeight: 700,
                        }}
                      >
                        {formatDate(entry.entry_date)} · {entry.teacher_name}
                      </p>
                      {entry.details && (
                        <p style={{ margin: "0 0 6px", color: "#111827" }}>
                          <strong>Details:</strong> {entry.details}
                        </p>
                      )}
                      {entry.action_plan && (
                        <p style={{ margin: "0 0 6px", color: "#111827" }}>
                          <strong>Action plan:</strong> {entry.action_plan}
                        </p>
                      )}
                      {entry.comment && (
                        <p style={{ margin: 0, color: "#111827" }}>
                          <strong>Comment:</strong> {entry.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type StudentDetailSection =
  | "overview"
  | "homework"
  | "friday"
  | "mocks"
  | "unit-exams"
  | "follow-up";

function StudentOverview({ student }: { student: any }) {
  return (
    <section
      style={{
        ...cardStyle,
        borderLeft: "5px solid var(--ss-blue)",
      }}
    >
      <SectionTitle>Student Overview</SectionTitle>
      <div className="admin-student-detail-modal-overview">
        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          <span style={getBadgeStyle(student.student_type)}>
            {getTypeLabel(student.student_type)}
          </span>
          <div>
            <strong>Level</strong>
            <p>{student.level_name || "Unknown Level"}</p>
          </div>
          <div>
            <strong>Class</strong>
            <p>{student.class_label || "Class not found"}</p>
          </div>
          <div>
            <strong>Teacher</strong>
            <p>{student.teacher_name || "No teacher assigned"}</p>
          </div>
          <div>
            <strong>Days/time</strong>
            <p>
              {student.class_days || "-"}{" "}
              {student.start_time && student.end_time
                ? `${student.start_time}-${student.end_time}`
                : ""}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function getStudentDetailSubtitle(student: any) {
  const level = String(student?.level_name || "").trim();
  const classLabel = String(student?.class_label || "").trim();
  const normalizedLevel = level.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedClass = classLabel.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const parts = [level];

  if (classLabel && normalizedClass !== normalizedLevel) parts.push(classLabel);

  return parts.filter(Boolean).join(" · ") || "Student information";
}

function StudentDetailModal({
  student,
  loading,
  onClose,
  returnFocusTo,
}: {
  student: any | null;
  loading: boolean;
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
}) {
  const [activeSection, setActiveSection] = useState<StudentDetailSection>("overview");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const isCambridge = student?.student_type === "cambridge";
  const sections: Array<{ id: StudentDetailSection; label: string }> = isCambridge
    ? [
        { id: "overview", label: "Overview" },
        { id: "homework", label: "Homework" },
        { id: "friday", label: "Friday Tutorials" },
        { id: "mocks", label: "Mock Exams" },
        { id: "follow-up", label: "Follow-up" },
      ]
    : [
        { id: "overview", label: "Overview" },
        { id: "unit-exams", label: "Unit Exams" },
        { id: "follow-up", label: "Follow-up" },
      ];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 30);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusTo?.focus();
    };
  }, [onClose, returnFocusTo]);

  return (
    <div className="admin-student-detail-modal-layer">
      <button
        type="button"
        className="admin-student-detail-modal-backdrop"
        onClick={onClose}
        aria-label="Close student details"
      />
      <section
        className="admin-student-detail-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-student-detail-modal-title"
      >
        <div className="admin-student-detail-modal-sticky">
          <header className="admin-student-detail-modal-header">
            <div>
              <h2 id="admin-student-detail-modal-title">
                {student?.full_name || (loading ? "Loading student…" : "Student details")}
              </h2>
              {student && <p>{getStudentDetailSubtitle(student)}</p>}
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="admin-student-detail-modal-close"
              onClick={onClose}
              aria-label="Close student details"
            >
              ×
            </button>
          </header>

          {student && (
            <nav className="admin-student-detail-modal-tabs" aria-label="Student detail sections">
              {sections.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  className={activeSection === section.id ? "is-active" : ""}
                  onClick={() => setActiveSection(section.id)}
                  aria-current={activeSection === section.id ? "page" : undefined}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          )}
        </div>

        <div className="admin-student-detail-modal-content">
          {loading && <div className="admin-student-detail-modal-state">Loading student profile…</div>}
          {!loading && student && activeSection === "overview" && (
            <StudentOverview student={student} />
          )}
          {!loading && student && isCambridge && activeSection === "homework" && (
            <CambridgeResults student={student} section="homework" />
          )}
          {!loading && student && isCambridge && activeSection === "friday" && (
            <CambridgeResults student={student} section="friday" />
          )}
          {!loading && student && isCambridge && activeSection === "mocks" && (
            <CambridgeResults student={student} section="mocks" />
          )}
          {!loading && student && !isCambridge && activeSection === "unit-exams" && (
            <YoungLearnerResults student={student} />
          )}
          {!loading && student && activeSection === "follow-up" && (
            <FollowUpsSection followUps={student.follow_ups || []} />
          )}
        </div>
      </section>
    </div>
  );
}

export default function StudentInformationPage() {
  const [activeTab, setActiveTab] = useState("Student Search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [error, setError] = useState("");
  const [classOptions, setClassOptions] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [classInformation, setClassInformation] = useState<any | null>(null);
  const [classSummary, setClassSummary] = useState<any | null>(null);
  const [loadingClassOptions, setLoadingClassOptions] = useState(false);
  const [loadingClass, setLoadingClass] = useState(false);
  const [levelOptions, setLevelOptions] = useState<any[]>([]);
  const [selectedLevel, setSelectedLevel] = useState("");
  const [levelAnalysis, setLevelAnalysis] = useState<any | null>(null);
  const [loadingLevelOptions, setLoadingLevelOptions] = useState(false);
  const [loadingLevelAnalysis, setLoadingLevelAnalysis] = useState(false);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const studentModalReturnFocusRef = useRef<HTMLElement | null>(null);

  const closeStudentModal = useCallback(() => {
    setStudentModalOpen(false);
    setSelectedStudent(null);
  }, []);

  useEffect(() => {
    if (activeTab !== "Student Search") {
      return;
    }

    const timeout = setTimeout(async () => {
      const trimmedQuery = query.trim();

      setError("");
      setSelectedStudent(null);

      if (!trimmedQuery) {
        setResults([]);
        return;
      }

      setSearching(true);

      try {
        const data = await searchAllStudents(trimmedQuery);
        setResults(data);
      } catch (searchError: any) {
        console.error("Unable to search students:", searchError);
        setError(searchError?.message || "Unable to search students.");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, activeTab]);

  useEffect(() => {
    async function loadClassOptions() {
      if (activeTab !== "Class Search" || classOptions.length > 0) {
        return;
      }

      setLoadingClassOptions(true);
      setError("");

      try {
        const data = await getClassSearchOptions();
        setClassOptions(data);
      } catch (loadError: any) {
        console.error("Unable to load class options:", loadError);
        setError(loadError?.message || "Unable to load class options.");
      } finally {
        setLoadingClassOptions(false);
      }
    }

    loadClassOptions();
  }, [activeTab, classOptions.length]);

  useEffect(() => {
    async function loadLevelOptions() {
      if (activeTab !== "Level Analysis" || levelOptions.length > 0) {
        return;
      }

      setLoadingLevelOptions(true);
      setError("");

      try {
        const data = await getLevelAnalysisOptions();
        setLevelOptions(data);
      } catch (loadError: any) {
        console.error("Unable to load level options:", loadError);
        setError(loadError?.message || "Unable to load level options.");
      } finally {
        setLoadingLevelOptions(false);
      }
    }

    loadLevelOptions();
  }, [activeTab, levelOptions.length]);

  async function openStudent(student: any) {
    studentModalReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedStudent(null);
    setStudentModalOpen(true);
    setLoadingStudent(true);
    setError("");

    try {
      const data = await getStudentInformation(student.student_type, student.id);
      setSelectedStudent(data);
    } catch (loadError: any) {
      console.error("Unable to load student information:", loadError);
      setError(loadError?.message || "Unable to load student information.");
      setSelectedStudent(null);
      setStudentModalOpen(false);
    } finally {
      setLoadingStudent(false);
    }
  }

  async function handleClassSelect(classId: string) {
    setSelectedClassId(classId);
    setSelectedStudent(null);
    setClassInformation(null);
    setClassSummary(null);
    setError("");

    if (!classId) {
      return;
    }

    setLoadingClass(true);

    try {
      const [information, summary] = await Promise.all([
        getClassInformation(classId),
        getClassResultsSummary(classId),
      ]);

      setClassInformation(information);
      setClassSummary(summary);
    } catch (loadError: any) {
      console.error("Unable to load class information:", loadError);
      setError(loadError?.message || "Unable to load class information.");
    } finally {
      setLoadingClass(false);
    }
  }

  async function handleLevelSelect(levelName: string) {
    setSelectedLevel(levelName);
    setLevelAnalysis(null);
    setSelectedStudent(null);
    setError("");

    if (!levelName) {
      return;
    }

    setLoadingLevelAnalysis(true);

    try {
      const data = await getLevelAnalysis(levelName);
      setLevelAnalysis(data);
    } catch (loadError: any) {
      console.error("Unable to load level analysis:", loadError);
      setError(loadError?.message || "Unable to load level analysis.");
    } finally {
      setLoadingLevelAnalysis(false);
    }
  }

  return (
    <AdminLayout>
      <>
      <div style={{ display: "grid", gap: "24px" }}>
        <header>
          <h1
            style={{
              color: "var(--ss-blue-dark)",
              margin: "0 0 8px",
              fontSize: "34px",
            }}
          >
            Student Information
          </h1>
          <p style={{ color: "#667085", margin: 0, fontSize: "16px" }}>
            Search students and view academic summaries, class details and
            follow-up records.
          </p>
        </header>

        <nav style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setSelectedStudent(null);
                  setError("");
                }}
                style={{
                  background: isActive ? "var(--ss-blue)" : "#ffffff",
                  color: isActive ? "#ffffff" : "var(--ss-blue-dark)",
                  border: isActive
                    ? "1px solid var(--ss-blue)"
                    : "1px solid var(--ss-border)",
                  borderRadius: "999px",
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontWeight: 700,
                  boxShadow: isActive
                    ? "0 6px 14px rgba(47,125,184,0.18)"
                    : "0 2px 8px rgba(31,60,136,0.04)",
                }}
              >
                {tab}
              </button>
            );
          })}
        </nav>

        {activeTab === "Class Search" && (
          <>
            <ClassSearchTab
              classOptions={classOptions}
              selectedClassId={selectedClassId}
              classInformation={classInformation}
              classSummary={classSummary}
              loadingOptions={loadingClassOptions}
              loadingClass={loadingClass}
              onSelectClass={handleClassSelect}
              onOpenStudent={openStudent}
            />

            {error && (
              <div
                style={{
                  ...cardStyle,
                  borderColor: "#f1b7b7",
                  color: "#9f1d1d",
                  whiteSpace: "pre-wrap",
                  padding: "14px 18px",
                }}
              >
                {error}
              </div>
            )}

          </>
        )}

        {activeTab === "Level Analysis" && (
          <>
            <LevelAnalysisTab
              levelOptions={levelOptions}
              selectedLevel={selectedLevel}
              analysis={levelAnalysis}
              loadingOptions={loadingLevelOptions}
              loadingAnalysis={loadingLevelAnalysis}
              onSelectLevel={handleLevelSelect}
            />

            {error && (
              <div
                style={{
                  ...cardStyle,
                  borderColor: "#f1b7b7",
                  color: "#9f1d1d",
                  whiteSpace: "pre-wrap",
                  padding: "14px 18px",
                }}
              >
                {error}
              </div>
            )}
          </>
        )}

        {activeTab === "Student Search" && (
          <>
            <section style={cardStyle}>
              <SectionTitle>Student Search</SectionTitle>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by student name..."
                style={inputStyle}
              />
              <p style={{ color: "#667085", margin: "10px 0 0" }}>
                Search returns matching Cambridge students and Young Learners.
              </p>
            </section>

            {error && (
              <div
                style={{
                  ...cardStyle,
                  borderColor: "#f1b7b7",
                  color: "#9f1d1d",
                  whiteSpace: "pre-wrap",
                  padding: "14px 18px",
                }}
              >
                {error}
              </div>
            )}

            {query.trim() && (
              <section style={cardStyle}>
                <SectionTitle>Search Results</SectionTitle>

                {searching ? (
                  <p style={{ color: "#667085", margin: 0 }}>
                    Searching students...
                  </p>
                ) : results.length === 0 ? (
                  <p style={{ color: "#667085", margin: 0 }}>
                    No matching students found.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {results.map((student) => (
                      <button
                        key={`${student.student_type}-${student.id}`}
                        onClick={() => openStudent(student)}
                        className="admin-student-information-student-trigger"
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: "#f8fafd",
                          border: "1px solid var(--ss-border)",
                          borderRadius: "12px",
                          padding: "14px",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <strong
                              style={{
                                color: "var(--ss-blue-dark)",
                                fontSize: "16px",
                              }}
                            >
                              {student.full_name}
                            </strong>
                            <p style={{ color: "#667085", margin: "5px 0 0" }}>
                              {student.level_name} · {student.class_label}
                            </p>
                            <p style={{ color: "#667085", margin: "3px 0 0" }}>
                              Teacher: {student.teacher_name}
                            </p>
                          </div>
                          <span style={getBadgeStyle(student.student_type)}>
                            {getTypeLabel(student.student_type)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

          </>
        )}
      </div>
      {studentModalOpen && (
        <StudentDetailModal
          student={selectedStudent}
          loading={loadingStudent}
          onClose={closeStudentModal}
          returnFocusTo={studentModalReturnFocusRef.current}
        />
      )}
      </>
    </AdminLayout>
  );
}
