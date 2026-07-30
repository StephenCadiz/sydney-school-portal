"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, CalendarDays, Clock3 } from "lucide-react";
import ClassExamLevelSelector from "../../components/admin/ClassExamLevelSelector";
import AdminLayout from "../../components/layout/AdminLayout";
import {
  getClassExamLevels,
  getClassExamMaterialsForPrint,
} from "../../../lib/classExams";
import { supabase } from "../../../lib/supabase";

type PrintCategory = "young-learners" | "friday-tutorials" | "mock-exams";

type FridayTutorialPrintItem = {
  id: string;
  session_date: string;
  level_name: string;
  activity_type: string;
  exam_part: string | null;
  pdf_url: string;
};

function getCountsByLevelId(materials: any[]): Record<string, number> {
  return materials.reduce<Record<string, number>>((counts, item) => {
    if (!item.level_id) return counts;

    const levelId = String(item.level_id);
    counts[levelId] = (counts[levelId] || 0) + 1;
    return counts;
  }, {});
}

function getHrefWithLevel(searchParams: URLSearchParams, levelId: string | number) {
  const params = new URLSearchParams(searchParams.toString());
  params.set("category", "young-learners");
  params.set("level", String(levelId));
  const query = params.toString();

  return `/admin/print-class-exams${query ? `?${query}` : ""}`;
}

function getBackToLevelsHref(searchParams: URLSearchParams) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("level");
  const query = params.toString();

  return `/admin/print-class-exams${query ? `?${query}` : ""}`;
}

function getCategoryHref(category: PrintCategory) {
  return `/admin/print-class-exams?category=${category}`;
}

function formatTutorialDate(dateString: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateString}T00:00:00Z`));
}

function CategoryCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        background: "#ffffff",
        border: "1px solid var(--ss-border)",
        borderRadius: "14px",
        boxShadow: "0 8px 24px rgba(31,60,136,0.06)",
        color: "inherit",
        padding: "22px",
        textDecoration: "none",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          alignItems: "center",
          background: "var(--ss-blue-light)",
          borderRadius: "10px",
          color: "var(--ss-blue)",
          display: "inline-flex",
          height: "44px",
          justifyContent: "center",
          marginBottom: "16px",
          width: "44px",
        }}
      >
        {icon}
      </span>
      <h2
        style={{
          color: "var(--ss-blue-dark)",
          fontSize: "19px",
          margin: "0 0 7px",
        }}
      >
        {title}
      </h2>
      <p style={{ color: "#6b7280", lineHeight: 1.5, margin: 0 }}>
        {description}
      </p>
    </Link>
  );
}

function PrintExamsContent() {
  const searchParams = useSearchParams();
  const [levels, setLevels] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [fridayTutorials, setFridayTutorials] = useState<
    FridayTutorialPrintItem[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const category = searchParams.get("category") as PrintCategory | null;

  async function loadYoungLearnerData() {
    setLoading(true);
    setMessage("");

    try {
      const [levelData, materialData] = await Promise.all([
        getClassExamLevels(),
        getClassExamMaterialsForPrint(),
      ]);

      setLevels(levelData);
      setMaterials(materialData);
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Unable to load printable Young Learner exams.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (category !== "young-learners") return;
    void loadYoungLearnerData();
  }, [category]);

  useEffect(() => {
    if (category !== "friday-tutorials") return;

    async function loadFridayTutorials() {
      setLoading(true);
      setMessage("");

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Your session has expired.");

        const response = await fetch(
          "/api/admin/print-exams/friday-tutorials",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error || "Unable to load printable Friday Tutorial exams."
          );
        }

        setFridayTutorials(result.tutorials || []);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load printable Friday Tutorial exams."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadFridayTutorials();
  }, [category]);

  const levelParam = searchParams.get("level") || "";
  const selectedLevel = useMemo(
    () => levels.find((level) => String(level.id) === levelParam) || null,
    [levelParam, levels]
  );
  const countsByLevelId = useMemo(() => getCountsByLevelId(materials), [materials]);
  const selectedMaterials = useMemo(
    () =>
      selectedLevel
        ? materials.filter((item) => String(item.level_id) === String(selectedLevel.id))
        : [],
    [materials, selectedLevel]
  );
  const fridayTutorialsByDate = useMemo(
    () =>
      fridayTutorials.reduce<Record<string, FridayTutorialPrintItem[]>>(
        (groups, tutorial) => {
          (groups[tutorial.session_date] ||= []).push(tutorial);
          return groups;
        },
        {}
      ),
    [fridayTutorials]
  );

  const invalidLevelMessage =
    levelParam && !selectedLevel && !loading
      ? "That level is not available for printable Class Exams. Select a level to continue."
      : "";

  if (!category) {
    return (
      <AdminLayout>
        <div style={{ maxWidth: "980px" }}>
          <header style={{ marginBottom: "26px" }}>
            <h1 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
              Print Exams
            </h1>
            <p style={{ color: "#4b5563", margin: 0 }}>
              Choose an exam category to find papers ready for printing.
            </p>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "16px",
            }}
          >
            <CategoryCard
              href={getCategoryHref("young-learners")}
              title="Young Learner Exams"
              description="Choose a level, then open an active Class Exam paper."
              icon={<BookOpen size={22} />}
            />
            <CategoryCard
              href={getCategoryHref("friday-tutorials")}
              title="Friday Tutorial Exams"
              description="Open this week’s Friday Tutorial papers during their print window."
              icon={<CalendarDays size={22} />}
            />
            <CategoryCard
              href={getCategoryHref("mock-exams")}
              title="Mock Exams"
              description="Printable Mock Exam papers will be available here soon."
              icon={<Clock3 size={22} />}
            />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (category === "mock-exams") {
    return (
      <AdminLayout>
        <div style={{ maxWidth: "980px" }}>
          <header style={{ marginBottom: "26px" }}>
            <p style={{ color: "#6b7280", fontWeight: 700, margin: "0 0 8px" }}>
              Print Exams
            </p>
            <h1 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
              Mock Exams
            </h1>
            <p style={{ color: "#4b5563", margin: 0 }}>
              Printable Mock Exam papers are coming soon.
            </p>
            <Link
              href="/admin/print-class-exams"
              style={{
                color: "var(--ss-blue)",
                display: "inline-flex",
                fontWeight: 800,
                marginTop: "14px",
                textDecoration: "none",
              }}
            >
              Back to Exam Categories
            </Link>
          </header>
        </div>
      </AdminLayout>
    );
  }

  if (category === "friday-tutorials") {
    return (
      <AdminLayout>
        <div style={{ maxWidth: "980px" }}>
          <header style={{ marginBottom: "26px" }}>
            <p style={{ color: "#6b7280", fontWeight: 700, margin: "0 0 8px" }}>
              Print Exams
            </p>
            <h1 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
              Friday Tutorial Exams
            </h1>
            <p style={{ color: "#4b5563", margin: 0 }}>
              Papers are available from Monday through Friday of their tutorial
              week.
            </p>
            <Link
              href="/admin/print-class-exams"
              style={{
                color: "var(--ss-blue)",
                display: "inline-flex",
                fontWeight: 800,
                marginTop: "14px",
                textDecoration: "none",
              }}
            >
              Back to Exam Categories
            </Link>
          </header>

          {message && (
            <div
              style={{
                background: "var(--ss-blue-light)",
                border: "1px solid var(--ss-border)",
                borderRadius: "10px",
                color: "var(--ss-blue-dark)",
                marginBottom: "18px",
                padding: "12px 14px",
              }}
            >
              {message}
            </div>
          )}

          {loading ? (
            <p style={{ color: "#4b5563" }}>Loading printable exams...</p>
          ) : Object.keys(fridayTutorialsByDate).length === 0 ? (
            <section
              style={{
                background: "#ffffff",
                border: "1px solid var(--ss-border)",
                borderRadius: "14px",
                padding: "24px",
              }}
            >
              <p style={{ color: "#4b5563", margin: 0 }}>
                No Friday Tutorial exams are available in the current print
                window.
              </p>
            </section>
          ) : (
            <div style={{ display: "grid", gap: "18px" }}>
              {Object.entries(fridayTutorialsByDate).map(
                ([sessionDate, tutorials]) => (
                  <section
                    key={sessionDate}
                    style={{
                      background: "#ffffff",
                      border: "1px solid var(--ss-border)",
                      borderRadius: "14px",
                      padding: "22px",
                    }}
                  >
                    <h2
                      style={{
                        color: "var(--ss-blue-dark)",
                        fontSize: "19px",
                        margin: "0 0 14px",
                      }}
                    >
                      {formatTutorialDate(sessionDate)}
                    </h2>
                    <div style={{ display: "grid", gap: "10px" }}>
                      {tutorials.map((tutorial) => (
                        <article
                          key={tutorial.id}
                          style={{
                            alignItems: "center",
                            border: "1px solid var(--ss-border)",
                            borderRadius: "12px",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "14px",
                            justifyContent: "space-between",
                            padding: "14px 16px",
                          }}
                        >
                          <div>
                            <h3
                              style={{
                                color: "#111827",
                                fontSize: "16px",
                                margin: "0 0 4px",
                              }}
                            >
                              {tutorial.level_name} · {tutorial.activity_type}
                            </h3>
                            {tutorial.exam_part && (
                              <p
                                style={{
                                  color: "#6b7280",
                                  fontSize: "14px",
                                  margin: 0,
                                }}
                              >
                                {tutorial.exam_part}
                              </p>
                            )}
                          </div>
                          <a
                            href={tutorial.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: "var(--ss-blue)",
                              borderRadius: "8px",
                              color: "#ffffff",
                              fontWeight: 700,
                              padding: "9px 12px",
                              textDecoration: "none",
                            }}
                          >
                            Open Exam
                          </a>
                        </article>
                      ))}
                    </div>
                  </section>
                )
              )}
            </div>
          )}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: "980px" }}>
        <header style={{ marginBottom: "26px" }}>
          {selectedLevel ? (
            <p
              style={{
                color: "#6b7280",
                fontWeight: 700,
                margin: "0 0 8px",
              }}
            >
              Print Exams
            </p>
          ) : null}
          <h1 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
            {selectedLevel
              ? `Young Learner Exams › ${selectedLevel.name}`
              : "Young Learner Exams"}
          </h1>
          <p style={{ color: "#4b5563", margin: 0 }}>
            {selectedLevel
              ? `Open printable exam papers for ${selectedLevel.name}. Audio and keys remain hidden on this page.`
              : "Select a level to view printable Class Exam papers."}
          </p>

          {selectedLevel && (
            <Link
              href={getBackToLevelsHref(new URLSearchParams(searchParams.toString()))}
              style={{
                display: "inline-flex",
                alignItems: "center",
                marginTop: "14px",
                color: "var(--ss-blue)",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Back to Levels
            </Link>
          )}
          {!selectedLevel && (
            <Link
              href="/admin/print-class-exams"
              style={{
                display: "inline-flex",
                marginTop: "14px",
                color: "var(--ss-blue)",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Back to Exam Categories
            </Link>
          )}
        </header>

        {message && (
          <div
            style={{
              background: "var(--ss-blue-light)",
              border: "1px solid var(--ss-border)",
              borderRadius: "10px",
              color: "var(--ss-blue-dark)",
              padding: "12px 14px",
              marginBottom: "18px",
              whiteSpace: "pre-wrap",
            }}
          >
            {message}
          </div>
        )}

        {!selectedLevel ? (
          <ClassExamLevelSelector
            title="Choose a Level"
            description="Open a level to view active exam papers ready for printing."
            levels={levels}
            countsByLevelId={countsByLevelId}
            getLevelHref={(level) =>
              getHrefWithLevel(new URLSearchParams(searchParams.toString()), level.id)
            }
            loading={loading}
            invalidMessage={invalidLevelMessage}
            emptyLabel="No printable exams"
            countLabelSingular="printable exam"
            countLabelPlural="printable exams"
          />
        ) : (
          <section
            style={{
              background: "#ffffff",
              border: "1px solid var(--ss-border)",
              borderRadius: "14px",
              boxShadow: "0 8px 24px rgba(31,60,136,0.06)",
              padding: "24px",
            }}
          >
            {loading ? (
              <p style={{ color: "#4b5563", margin: 0 }}>Loading printable exams...</p>
            ) : selectedMaterials.length === 0 ? (
              <p style={{ color: "#4b5563", margin: 0 }}>
                No printable Class Exams are available for {selectedLevel.name}.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {selectedMaterials.map((item) => (
                  <article
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "14px",
                      flexWrap: "wrap",
                      border: "1px solid var(--ss-border)",
                      borderRadius: "12px",
                      padding: "14px 16px",
                      background: "#ffffff",
                    }}
                  >
                    <h2
                      style={{
                        color: "#111827",
                        margin: 0,
                        fontSize: "16px",
                      }}
                    >
                      Exam Unit {item.exam_unit_number}
                    </h2>

                    {item.exam_file_url ? (
                      <a
                        href={item.exam_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block",
                          background: "var(--ss-blue)",
                          color: "#ffffff",
                          borderRadius: "8px",
                          padding: "9px 12px",
                          textDecoration: "none",
                          fontWeight: 700,
                        }}
                      >
                        Open Exam
                      </a>
                    ) : (
                      <span style={{ color: "#6b7280" }}>No exam file added.</span>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </AdminLayout>
  );
}

export default function PrintExamsPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout>
          <div style={{ maxWidth: "980px", color: "#4b5563" }}>
            Loading printable exams...
          </div>
        </AdminLayout>
      }
    >
      <PrintExamsContent />
    </Suspense>
  );
}
