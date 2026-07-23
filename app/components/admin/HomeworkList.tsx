"use client";

import { useMemo, useState } from "react";

import {
  getHomeworkSkillLabel,
  getMadridDateString,
  normalizeHomeworkSkill,
} from "../../../lib/homework";

type Props = {
  homework: any[];
  onDelete: (id: string) => void;
  onEdit: (homework: any) => void;
};

type HomeworkStatus = "Released" | "Scheduled" | "Inactive" | "Date missing";
type StatusFilter = "all" | HomeworkStatus;

const levelOptions = ["B1", "B2", "C1", "C2"] as const;
const courseOptions = ["regular", "intensive", "express", "online"] as const;
const statusOptions: HomeworkStatus[] = [
  "Released",
  "Scheduled",
  "Inactive",
];

const levelOrder = new Map(levelOptions.map((level, index) => [level, index]));
const courseOrder = new Map(courseOptions.map((course, index) => [course, index]));

function getCourseTypeLabel(courseType: string | null | undefined) {
  const normalized = String(courseType || "").trim().toLowerCase();
  if (!normalized) return "—";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getOrderValue(order: Map<string, number>, value: unknown) {
  return order.get(String(value || "").trim().toUpperCase()) ??
    order.get(String(value || "").trim().toLowerCase()) ??
    99;
}

function getSkillOrder(skill: unknown) {
  const normalized = normalizeHomeworkSkill(skill);
  if (normalized === "reading") return 0;
  if (normalized === "listening") return 1;
  if (normalized === "writing") return 2;
  return 99;
}

function isValidDateOnly(value: unknown): value is string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function getHomeworkStatus(item: any, todayMadrid: string): HomeworkStatus {
  if (item.active === false) return "Inactive";
  if (!isValidDateOnly(item.release_date)) return "Date missing";
  return item.release_date <= todayMadrid ? "Released" : "Scheduled";
}

function formatAdminDate(value: unknown) {
  if (!isValidDateOnly(value)) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function compareHomework(first: any, second: any) {
  const levelDifference =
    getOrderValue(levelOrder, first.level) - getOrderValue(levelOrder, second.level);
  if (levelDifference !== 0) return levelDifference;

  const courseDifference =
    getOrderValue(courseOrder, first.course_type) -
    getOrderValue(courseOrder, second.course_type);
  if (courseDifference !== 0) return courseDifference;

  const weekDifference =
    Number(first.week_number || 0) - Number(second.week_number || 0);
  if (weekDifference !== 0) return weekDifference;

  const homeworkOrderDifference =
    Number(first.homework_order || 0) - Number(second.homework_order || 0);
  if (homeworkOrderDifference !== 0) return homeworkOrderDifference;

  const skillDifference =
    getSkillOrder(first.homework_skill) - getSkillOrder(second.homework_skill);
  if (skillDifference !== 0) return skillDifference;

  const titleDifference = String(first.title || "").localeCompare(
    String(second.title || ""),
    undefined,
    { numeric: true, sensitivity: "base" }
  );
  if (titleDifference !== 0) return titleDifference;

  return String(first.id || "").localeCompare(String(second.id || ""));
}

export default function HomeworkList({
  homework,
  onDelete,
  onEdit,
}: Props) {
  const [levelFilter, setLevelFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const todayMadrid = getMadridDateString();

  const visibleHomework = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return [...homework]
      .filter((item) =>
        levelFilter === "all" ||
        String(item.level || "").trim().toUpperCase() === levelFilter
      )
      .filter((item) =>
        courseFilter === "all" ||
        String(item.course_type || "").trim().toLowerCase() === courseFilter
      )
      .filter((item) =>
        statusFilter === "all" ||
        getHomeworkStatus(item, todayMadrid) === statusFilter
      )
      .filter((item) => {
        if (!normalizedSearch) return true;
        const skillLabel = getHomeworkSkillLabel(
          String(item.level || ""),
          item.homework_skill
        );
        return [
          item.title,
          item.description,
          item.week_number,
          `week ${item.week_number || ""}`,
          item.exam_number,
          `exam ${item.exam_number || ""}`,
          item.homework_skill,
          skillLabel,
        ].some((value) =>
          String(value || "").toLowerCase().includes(normalizedSearch)
        );
      })
      .sort(compareHomework);
  }, [
    courseFilter,
    homework,
    levelFilter,
    search,
    statusFilter,
    todayMadrid,
  ]);

  function clearFilters() {
    setLevelFilter("all");
    setCourseFilter("all");
    setStatusFilter("all");
    setSearch("");
  }

  if (homework.length === 0) {
    return (
      <section className="admin-homework-sheet-empty">
        <h2>Saved Homework</h2>
        <p>No homework has been created yet.</p>
      </section>
    );
  }

  return (
    <section className="admin-homework-sheet">
      <header className="admin-homework-sheet-header">
        <div>
          <h2>Saved Homework</h2>
          <p>
            {visibleHomework.length} homework{" "}
            {visibleHomework.length === 1 ? "item" : "items"}
          </p>
        </div>
      </header>

      <div className="admin-homework-sheet-filters">
        <fieldset>
          <legend>Level</legend>
          <div className="admin-homework-sheet-filter-options">
            {["all", ...levelOptions].map((level) => (
              <button
                type="button"
                key={level}
                className={levelFilter === level ? "is-active" : ""}
                aria-pressed={levelFilter === level}
                onClick={() => setLevelFilter(level)}
              >
                {level === "all" ? "All" : level}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Course</legend>
          <div className="admin-homework-sheet-filter-options">
            {["all", ...courseOptions].map((course) => (
              <button
                type="button"
                key={course}
                className={courseFilter === course ? "is-active" : ""}
                aria-pressed={courseFilter === course}
                onClick={() => setCourseFilter(course)}
              >
                {course === "all" ? "All" : getCourseTypeLabel(course)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Status</legend>
          <div className="admin-homework-sheet-filter-options">
            {(["all", ...statusOptions] as StatusFilter[]).map((status) => (
              <button
                type="button"
                key={status}
                className={statusFilter === status ? "is-active" : ""}
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status === "all" ? "All" : status}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="admin-homework-sheet-search">
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search saved homework..."
            autoComplete="off"
          />
        </label>
      </div>

      {visibleHomework.length === 0 ? (
        <div className="admin-homework-sheet-no-match">
          <p>No matching homework found.</p>
          <button type="button" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <div className="admin-homework-sheet-table-wrap">
          <table className="admin-homework-sheet-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Course</th>
                <th>Week</th>
                <th>Skill</th>
                <th>Title</th>
                <th>Release</th>
                <th>Due</th>
                <th>Status</th>
                <th>Resources</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleHomework.map((item, index) => {
                const status = getHomeworkStatus(item, todayMadrid);
                const levelChanged = index > 0 &&
                  visibleHomework[index - 1].level !== item.level;

                return (
                  <tr
                    key={item.id}
                    className={levelChanged ? "is-new-level" : undefined}
                  >
                    <td><strong>{item.level || "—"}</strong></td>
                    <td>{getCourseTypeLabel(item.course_type)}</td>
                    <td>Week {item.week_number ?? "—"}</td>
                    <td>
                      {getHomeworkSkillLabel(item.level, item.homework_skill) ||
                        "—"}
                    </td>
                    <td className="admin-homework-sheet-title">
                      {item.title || "Untitled homework"}
                    </td>
                    <td>{formatAdminDate(item.release_date)}</td>
                    <td>{formatAdminDate(item.due_date)}</td>
                    <td>
                      <span
                        className={`admin-homework-sheet-status is-${status
                          .toLowerCase()
                          .replace(/\s+/g, "-")}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td>
                      <div className="admin-homework-sheet-resources">
                        {item.resource_url && (
                          <a
                            href={item.resource_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            File
                          </a>
                        )}
                        {item.audio_url && (
                          <a
                            href={item.audio_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Audio
                          </a>
                        )}
                        {!item.resource_url && !item.audio_url && (
                          <span>No resource</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="admin-homework-sheet-actions">
                        <button type="button" onClick={() => onEdit(item)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="is-delete"
                          onClick={() => onDelete(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
