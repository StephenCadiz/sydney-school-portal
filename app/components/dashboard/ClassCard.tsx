"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

type Props = {
  item: any;
};

export default function ClassCard({ item }: Props) {
  const router = useRouter();

  return (
    <div
      style={{
        background: "#ffffff",
        padding: "30px",
        borderRadius: "12px",
        marginBottom: "25px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "30px",
        }}
      >
        {/* LOGO */}

        <div>
          <Image
            src={item.classrooms?.logo || "/Emu Logo.png"}
            alt={`${item.classrooms?.name} Classroom`}
            width={140}
            height={140}
            style={{
              width: "140px",
              height: "auto",
            }}
          />
        </div>

        {/* DETAILS */}

        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "18px",
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#1f3c88",
                fontSize: "28px",
              }}
            >
              {item.class_name}
            </h2>

            <div
              style={{
                background: item.is_cambridge
                  ? "#1f3c88"
                  : "#2e7d32",
                color: "#fff",
                padding: "7px 16px",
                borderRadius: "20px",
                fontWeight: 700,
                fontSize: "12px",
                letterSpacing: "1px",
              }}
            >
              {item.is_cambridge
                ? "CAMBRIDGE"
                : "YOUNG LEARNERS"}
            </div>
          </div>

          <div
            style={{
              display: "inline-block",
              background: "#eef4ff",
              color: "#1f3c88",
              padding: "8px 16px",
              borderRadius: "20px",
              fontWeight: 600,
              marginBottom: "20px",
            }}
          >
            {item.classrooms?.name} Classroom
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
              color: "#555",
              fontSize: "15px",
            }}
          >
            <div>
              <strong>📍 Classroom</strong>
              <br />
              {item.classrooms?.name}
            </div>

            <div>
              <strong>📅 Days</strong>
              <br />
              {item.days}
            </div>

            <div>
              <strong>🕒 Time</strong>
              <br />
              {item.start_time} – {item.end_time}
            </div>

            <div>
              <strong>👥 Capacity</strong>
              <br />
              {item.capacity} Students
            </div>
          </div>
        </div>

        {/* BUTTON */}

        <div>
          <button
            onClick={() =>
              router.push(`/teacher/class?id=${item.id}`)
            }
            style={{
              background: "#1f3c88",
              color: "#ffffff",
              border: "none",
              padding: "15px 30px",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "16px",
            }}
          >
            Open Class →
          </button>
        </div>
      </div>
    </div>
  );
}