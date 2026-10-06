"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Summary = {
  invited: boolean;
  total_invitations: number;
  attended: number;
  absent: number;
  pending: number;
};

export default function AdminStudentFridayTutorialAttendance({
  studentId,
  studentType,
}: {
  studentId: string;
  studentType: string;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) return;
        const params = new URLSearchParams({
          student_id: studentId,
          student_type: studentType,
        });
        const response = await fetch(
          `/api/admin/student-information/friday-tutorial-attendance?${params}`,
          {
            cache: "no-store",
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          }
        );
        if (!response.ok) return;
        const payload = (await response.json()) as Summary;
        if (!cancelled) setSummary(payload);
      } catch {
        // The overview remains usable if the optional summary is unavailable.
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [studentId, studentType]);

  if (!summary?.invited) return null;

  return (
    <section className="admin-student-friday-tutorial-summary" aria-labelledby="admin-student-friday-summary-title">
      <SectionTitle title="Friday Tutorial attendance" />
      <p className="admin-student-friday-tutorial-summary-intro">
        Attendance from Friday Tutorial invitations and completed teacher submissions.
      </p>
      <div className="admin-student-friday-tutorial-summary-grid">
        <SummaryValue label="Total invitations" value={summary.total_invitations} />
        <SummaryValue label="Attended" value={summary.attended} />
        <SummaryValue label="Absent / not attended" value={summary.absent} />
        <SummaryValue label="Pending attendance" value={summary.pending} />
      </div>
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="admin-student-friday-tutorial-summary-title" id="admin-student-friday-summary-title">{title}</h3>;
}

function SummaryValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-student-friday-tutorial-summary-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
