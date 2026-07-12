"use client";

import StudentMenu from "../StudentMenu";

export default function ResourcesPage() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f5f7fa",
      }}
    >
      <StudentMenu />

      <main
        style={{
          flex: 1,
          padding: "40px",
        }}
      >
        <h1
          style={{
            color: "#1f3c88",
            marginBottom: "10px",
            fontSize: "32px",
          }}
        >
          Resources
        </h1>

        <p
          style={{
            color: "#666",
            marginBottom: "40px",
          }}
        >
          Download worksheets, PDFs, audio files and extra learning materials.
        </p>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            padding: "30px",
            boxShadow: "0 8px 25px rgba(0,0,0,0.06)",
          }}
        >
          <h2
            style={{
              color: "#1f3c88",
              marginTop: 0,
            }}
          >
            Week 1 Resources
          </h2>

          <div
            style={{
              marginTop: "20px",
              padding: "20px",
              background: "#f7f8fc",
              borderRadius: "12px",
            }}
          >
            <strong>B2 Reading Worksheet</strong>

            <p
              style={{
                marginTop: "8px",
                color: "#666",
              }}
            >
              Additional Cambridge Reading Part 5 practice.
            </p>

            <button
              style={{
                background: "#1f3c88",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "10px 18px",
                cursor: "pointer",
              }}
            >
              Download PDF
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}