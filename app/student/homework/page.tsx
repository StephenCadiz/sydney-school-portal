"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import StudentMenu from "../StudentMenu";
import {
  getHomeworkSkillLabel,
  getHomeworkTimingStatus,
  getReleasedStudentHomework,
  normalizeHomeworkSkill,
} from "../../../lib/homework";
import {
  buildHomeworkResultMap,
  getHomeworkResultKey,
  getHomeworkWeekNumber,
  getStudentResults,
  toResultNumber,
} from "../../../lib/progress";
import {
  getCurrentStudentCourseInfo,
  getCurrentUser,
} from "../../../lib/user";
import { markHomeworkAsViewed } from "../../../lib/studentNotifications";

type HomeworkItem = {
  id: string;
  week_number: string | number;
  homework_order?: string | number | null;
  title?: string | null;
  description?: string | null;
  homework_skill?: string | null;
  release_date?: string | null;
  due_date?: string | null;
  resource_url?: string | null;
  audio_url?: string | null;
};

type ResourceAction = {
  href: string;
  label: string;
};

function formatDateShort(date: string | null | undefined) {
  if (!date) {
    return "-";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    return date;
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPercent(value: any) {
  const number = toResultNumber(value);

  if (number === null) {
    return "Not graded";
  }

  return `${Math.round(number)}%`;
}

function getHomeworkTitle(item: HomeworkItem) {
  return item.title?.trim() || `Week ${item.week_number} Homework`;
}

function getResourceLabel(url: string, isListening: boolean) {
  if (isListening) {
    return "Open PDF";
  }

  const urlWithoutQuery = url.split("?")[0].toLowerCase();

  return urlWithoutQuery.endsWith(".pdf") ? "Open PDF" : "Open Resource";
}

function getResourceActions(item: HomeworkItem): ResourceAction[] {
  const isListening = normalizeHomeworkSkill(item.homework_skill) === "listening";
  const actions: ResourceAction[] = [];

  if (item.resource_url) {
    actions.push({
      href: item.resource_url,
      label: getResourceLabel(item.resource_url, isListening),
    });
  }

  if (item.audio_url) {
    actions.push({
      href: item.audio_url,
      label: "Play Audio",
    });
  }

  return actions;
}

function getHomeworkCountLabel(count: number) {
  return `${count} released homework item${count === 1 ? "" : "s"}`;
}

export default function HomeworkPage() {
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [level, setLevel] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const resultMap = useMemo(
    () => buildHomeworkResultMap(results, homework),
    [results, homework]
  );

  const loadHomework = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const user = await getCurrentUser();
      const courseInfo = await getCurrentStudentCourseInfo();
      const releasedHomework = await getReleasedStudentHomework(
        courseInfo.level,
        courseInfo.courseType,
        courseInfo.classroom.days
      );
      const studentResults = await getStudentResults(user.id);

      setLevel(courseInfo.level);
      setHomework(releasedHomework);
      setResults(studentResults);

      if (releasedHomework.length > 0) {
        try {
          await markHomeworkAsViewed(
            user.id,
            releasedHomework.map((item) => item.id)
          );
        } catch (viewError) {
          console.error("Unable to mark released homework as viewed:", viewError);
        }
      }
    } catch (loadError) {
      console.error(loadError);
      setError(true);
      setHomework([]);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHomework();
  }, [loadHomework]);

  function renderResourceActions(item: HomeworkItem) {
    const actions = getResourceActions(item);

    if (actions.length === 0) {
      return <span className="student-homework-muted">-</span>;
    }

    return (
      <div className="student-homework-resources">
        {actions.map((action) => (
          <a
            key={`${item.id}-${action.label}`}
            className="student-homework-resource-link"
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${action.label} for ${getHomeworkTitle(item)}`}
          >
            {action.label}
          </a>
        ))}
      </div>
    );
  }

  function getResultForHomework(item: HomeworkItem) {
    const key = getHomeworkResultKey(
      getHomeworkWeekNumber(item),
      item.homework_skill
    );

    return key ? resultMap.get(key) : null;
  }

  function renderResult(item: HomeworkItem) {
    const result = getResultForHomework(item);

    return (
      <span
        className={`student-homework-result ${
          result ? "is-graded" : "is-not-graded"
        }`}
      >
        {formatPercent(result?.percentage)}
      </span>
    );
  }

  function renderStatus(item: HomeworkItem) {
    const status = getHomeworkTimingStatus(
      item,
      undefined,
      Boolean(getResultForHomework(item))
    );
    const statusClass = status.toLowerCase();

    return (
      <span
        className={`student-homework-status is-${statusClass}`}
      >
        {status}
      </span>
    );
  }

  return (
    <div className="student-layout-shell">
      <div className="student-mobile-topbar">
        <div className="student-mobile-topbar-title">Sydney School / Student</div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open student menu"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      </div>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close student menu"
          className="student-mobile-drawer-overlay"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className={`student-mobile-drawer ${menuOpen ? "open" : ""}`}>
        <button
          type="button"
          className="student-mobile-drawer-close"
          onClick={() => setMenuOpen(false)}
        >
          Close
        </button>
        <StudentMenu mobileMode onClose={() => setMenuOpen(false)} />
      </div>

      <aside className="student-desktop-sidebar">
        <StudentMenu />
      </aside>

      <main className="student-main-content student-homework-page">
        <header className="student-homework-header-block">
          <h1 className="student-homework-header">Homework</h1>
          <p className="student-homework-subtitle">
            View your released homework, resources and results.
          </p>
        </header>

        <section
          className="student-homework-directory"
          aria-labelledby="student-homework-directory-title"
        >
          <div className="student-homework-directory-header">
            <div>
              <h2 id="student-homework-directory-title">Released Homework</h2>
              <p>
                Current and past homework for your class, ordered by due date.
              </p>
            </div>

            <div className="student-homework-summary" aria-live="polite">
              {getHomeworkCountLabel(homework.length)}
            </div>
          </div>

          {loading && (
            <div className="student-homework-state" role="status" aria-live="polite">
              Loading homework...
            </div>
          )}

          {!loading && error && (
            <div className="student-homework-state is-error" role="alert">
              <p>Unable to load homework. Please try again.</p>
              <button type="button" onClick={loadHomework}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && homework.length === 0 && (
            <div className="student-homework-state">
              No homework has been released yet.
            </div>
          )}

          {!loading && !error && homework.length > 0 && (
            <>
              <div className="student-homework-table-wrap">
                <table className="student-homework-table">
                  <caption className="student-homework-table-caption">
                    Released homework, resources and results
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Week</th>
                      <th scope="col">Homework</th>
                      <th scope="col">Skill</th>
                      <th scope="col">Release</th>
                      <th scope="col">Due</th>
                      <th scope="col">Status</th>
                      <th scope="col">Result</th>
                      <th scope="col">Resources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {homework.map((item) => {
                      const skillLabel = getHomeworkSkillLabel(
                        level,
                        item.homework_skill
                      );

                      return (
                        <tr key={item.id}>
                          <td>Week {item.week_number}</td>
                          <td>
                            <strong>{getHomeworkTitle(item)}</strong>
                            {item.description && (
                              <span>{item.description}</span>
                            )}
                          </td>
                          <td>{skillLabel || "Homework"}</td>
                          <td>{formatDateShort(item.release_date)}</td>
                          <td>{formatDateShort(item.due_date)}</td>
                          <td>{renderStatus(item)}</td>
                          <td>{renderResult(item)}</td>
                          <td>{renderResourceActions(item)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="student-homework-mobile-list">
                {homework.map((item, index) => {
                  const skillLabel = getHomeworkSkillLabel(
                    level,
                    item.homework_skill
                  );

                  return (
                    <article
                      key={item.id}
                      className="student-homework-mobile-card"
                    >
                      <div className="student-homework-mobile-card-header">
                        <span>#{index + 1}</span>
                        {renderStatus(item)}
                      </div>

                      <h3>{getHomeworkTitle(item)}</h3>

                      {item.description && <p>{item.description}</p>}

                      <dl>
                        <div>
                          <dt>Week</dt>
                          <dd>Week {item.week_number}</dd>
                        </div>
                        <div>
                          <dt>Skill</dt>
                          <dd>{skillLabel || "Homework"}</dd>
                        </div>
                        <div>
                          <dt>Release</dt>
                          <dd>{formatDateShort(item.release_date)}</dd>
                        </div>
                        <div>
                          <dt>Due</dt>
                          <dd>{formatDateShort(item.due_date)}</dd>
                        </div>
                        <div>
                          <dt>Result</dt>
                          <dd>{renderResult(item)}</dd>
                        </div>
                      </dl>

                      <div className="student-homework-mobile-resources">
                        <span>Resources</span>
                        {renderResourceActions(item)}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
