import { CalendarCheck2, CalendarX2 } from "lucide-react";
import { useId } from "react";

import type { ClassAttendanceSummary } from "../../../lib/classRegister";

function formatPercentage(value: number | null) {
  if (value === null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

export default function AttendanceSummaryCard({
  summary,
  title = "Attendance",
  description,
  compact = false,
}: {
  summary: ClassAttendanceSummary;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const titleId = useId();
  const hasAttendance = summary.completed_register_count > 0;
  return (
    <section
      className={`attendance-summary-card ${compact ? "is-compact" : ""}`}
      aria-labelledby={titleId}
    >
      <div className="attendance-summary-heading">
        <div>
          <p>Class Register</p>
          <h3 id={titleId}>{title}</h3>
          {description && <span>{description}</span>}
        </div>
        <strong>{formatPercentage(summary.attendance_percentage)}</strong>
      </div>

      {hasAttendance ? (
        <div className="attendance-summary-counts">
          <div>
            <CalendarCheck2 aria-hidden="true" size={19} />
            <span>
              <strong>{summary.present_count}</strong>
              {compact ? "Present" : "classes attended"}
            </span>
          </div>
          <div>
            <CalendarX2 aria-hidden="true" size={19} />
            <span>
              <strong>{summary.absent_count}</strong>
              {compact ? "Absent" : "classes missed"}
            </span>
          </div>
        </div>
      ) : (
        <p className="attendance-summary-empty">
          No completed Class Registers are available yet.
        </p>
      )}
    </section>
  );
}
