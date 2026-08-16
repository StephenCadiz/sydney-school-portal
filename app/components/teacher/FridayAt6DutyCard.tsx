"use client";

import {
  FRIDAY_AT_6_DUTY_LABELS,
  FRIDAY_AT_6_DUTY_TYPES,
  type FridayAt6DutyType,
} from "../../../lib/fridayTutorials";

export default function FridayAt6DutyCard({ duty }: { duty: any | null }) {
  const dutyTypes = (Array.isArray(duty?.duty_types)
    ? duty.duty_types
    : []) as FridayAt6DutyType[];

  if (!duty || dutyTypes.length === 0) {
    return null;
  }

  const heading =
    dutyTypes.length === 1
      ? FRIDAY_AT_6_DUTY_LABELS[dutyTypes[0]]
      : "Friday @ 6 Duties";

  return (
    <section className="teacher-dashboard-section teacher-dashboard-friday">
      <div className="teacher-dashboard-section-title">
        <div>
          <h2>{heading}</h2>
          <p>Today · 18:00–19:00</p>
        </div>
      </div>

      <div className="teacher-dashboard-friday-list">
        {dutyTypes.map((dutyType) => (
          <article key={dutyType} className="teacher-dashboard-duty-row">
            <h3>{FRIDAY_AT_6_DUTY_LABELS[dutyType]}</h3>
            <p>
              {dutyType === FRIDAY_AT_6_DUTY_TYPES.B1
                ? "You are responsible for today's B1 tutorial."
                : "You are responsible for today's general tutorial."}
            </p>
          </article>
        ))}

        {duty.note && (
          <p className="teacher-dashboard-duty-note">
            <strong>Note:</strong> {duty.note}
          </p>
        )}
      </div>
    </section>
  );
}
