"use client";

export default function FridayAt6DutyCard({ duty }: { duty: any | null }) {
  if (!duty) {
    return null;
  }

  return (
    <section className="teacher-dashboard-section teacher-dashboard-friday">
      <div className="teacher-dashboard-section-title">
        <div>
          <h2>General Tutorial Duty</h2>
          <p>Today · 18:00–19:00</p>
        </div>
      </div>

      <div className="teacher-dashboard-duty-row">
        <p>
          You are responsible for today&apos;s general tutorial.
        </p>

        {duty.note && (
          <p>
            <strong>Note:</strong> {duty.note}
          </p>
        )}
      </div>
    </section>
  );
}
