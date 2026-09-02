"use client";

import { useCallback, useEffect, useState } from "react";

import AttendanceSummaryCard from "../../components/attendance/AttendanceSummaryCard";
import {
  type ClassAttendanceSummary,
  type ClassRegisterUnavailableResponse,
  getEmptyClassAttendanceSummary,
  isClassRegisterUnavailableResponse,
} from "../../../lib/classRegister";
import { supabase } from "../../../lib/supabase";

export default function TeacherStudentAttendanceSection({
  classId,
  studentId,
  studentType = "profile",
}: {
  classId: string;
  studentId: string;
  studentType?: "profile" | "young_learner";
}) {
  const [summary, setSummary] = useState<ClassAttendanceSummary>(() =>
    getEmptyClassAttendanceSummary()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] =
    useState<ClassRegisterUnavailableResponse | null>(null);

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError("");
    setUnavailable(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(
          classId
        )}/attendance?studentId=${encodeURIComponent(
          studentId
        )}&studentType=${encodeURIComponent(studentType)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (isClassRegisterUnavailableResponse(payload)) {
        setUnavailable(payload);
        setSummary(getEmptyClassAttendanceSummary());
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load attendance.");
      }
      setSummary(payload.summary || getEmptyClassAttendanceSummary());
    } catch (caught) {
      console.error("Teacher student attendance load failed:", caught);
      setError("Attendance could not be loaded. Please try again.");
      setSummary(getEmptyClassAttendanceSummary());
    } finally {
      setLoading(false);
    }
  }, [classId, studentId, studentType]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  if (loading) {
    return <div className="attendance-summary-state">Loading attendance...</div>;
  }
  if (error) {
    return (
      <div className="attendance-summary-state is-error" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => void loadAttendance()}>
          Retry
        </button>
      </div>
    );
  }

  if (unavailable) {
    const detail =
      unavailable.reason === "missing_course_dates"
        ? "Course dates have not been set yet."
        : unavailable.reason === "missing_academic_year"
          ? "A valid Academic Year has not been assigned yet."
          : "Class times have not been set correctly yet.";

    return (
      <div className="attendance-summary-state is-unavailable" role="status">
        <strong>Attendance unavailable</strong>
        <p>{detail}</p>
      </div>
    );
  }

  return (
    <AttendanceSummaryCard
      summary={summary}
      description="Current class and course context"
      compact={studentType === "young_learner"}
    />
  );
}
