"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import HomeworkList from "../../components/admin/HomeworkList";
import { getAllHomework } from "../../../lib/homework";

const LEGACY_HOMEWORK_CUTOVER_DATE = "2026-07-28";

function isStoredLegacyReleaseDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || value >= LEGACY_HOMEWORK_CUTOVER_DATE) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export default function HomeworkPage() {
  const [homework, setHomework] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHomework = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAllHomework();
      setHomework(data.filter((item) => isStoredLegacyReleaseDate(item.release_date)));
    } catch (loadError) {
      console.error("Unable to load legacy Cambridge homework:", loadError);
      setHomework([]);
      setError("Unable to load legacy Cambridge homework.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHomework();
  }, [loadHomework]);

  return (
    <AdminLayout>
      <h1
        style={{
          color: "#1f3c88",
          marginBottom: "10px",
        }}
      >
        Legacy Cambridge Homework
      </h1>

      <section className="exam-bank-notice" style={{ marginBottom: "24px" }}>
        <p>
          New Cambridge homework is now created through Cambridge Exam Bank →
          Assigned Exams. The records below are retained for historical
          reference.
        </p>
        <Link
          className="exam-bank-button"
          href="/admin/exam-bank/assignments"
        >
          Open Assigned Exams
        </Link>
      </section>

      {loading ? (
        <div
          style={{
            background: "#ffffff",
            padding: "30px",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          Loading legacy homework...
        </div>
      ) : error ? (
        <div className="exam-bank-notice is-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadHomework()}>
            Retry
          </button>
        </div>
      ) : (
        <HomeworkList homework={homework} readOnly />
      )}
    </AdminLayout>
  );
}
