"use client";

export default function FridayAt6DutyCard({ duty }: { duty: any | null }) {
  if (!duty) {
    return null;
  }

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid var(--ss-border)",
        borderLeft: "5px solid var(--ss-blue)",
        borderRadius: "14px",
        padding: "22px",
        boxShadow: "0 8px 24px rgba(31,60,136,0.06)",
        marginBottom: "22px",
      }}
    >
      <div style={{ marginBottom: duty.note ? "14px" : 0 }}>
        <h2
          style={{
            color: "var(--ss-blue-dark)",
            margin: "0 0 6px",
            fontSize: "22px",
          }}
        >
          General Tutorial Duty
        </h2>
        <p style={{ color: "#4b5563", margin: 0 }}>
          Today · 18:00–19:00
        </p>
      </div>

      <div
        style={{
          border: "1px solid var(--ss-border)",
          borderRadius: "12px",
          padding: "15px",
          background: "#f8fafd",
        }}
      >
        <p
          style={{
            color: "var(--ss-blue-dark)",
            margin: 0,
            fontWeight: 700,
          }}
        >
          You are responsible for today&apos;s general tutorial.
        </p>

        {duty.note && (
          <p style={{ color: "#4b5563", margin: "8px 0 0" }}>
            <strong>Note:</strong> {duty.note}
          </p>
        )}
      </div>
    </section>
  );
}
