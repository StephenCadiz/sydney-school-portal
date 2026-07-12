"use client";

import { getHomeworkSkillLabel } from "../../../lib/homework";

type Props = {
  homework: any[];
  onDelete: (id: string) => void;
  onEdit: (homework: any) => void;
};

function getCourseTypeLabel(courseType: string | null | undefined) {
  if (courseType === "regular") return "Regular";
  if (courseType === "intensive") return "Intensive";
  if (courseType === "express") return "Express";
  if (courseType === "online") return "Online";

  return courseType || "-";
}

export default function HomeworkList({
  homework,
  onDelete,
  onEdit,
}: Props) {
  if (homework.length === 0) {
    return (
      <div
        style={{
          background: "#ffffff",
          padding: "30px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          textAlign: "center",
          color: "#666",
        }}
      >
        No homework has been created yet.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "20px",
      }}
    >
      {homework.map((item) => (
        <div
          key={item.id}
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            padding: "25px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: "20px",
              color: "#1f3c88",
              fontSize: "24px",
            }}
          >
            {item.title}
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              rowGap: "10px",
              color: "#333",
              fontSize: "15px",
            }}
          >
            <strong>Level</strong>
            <span>{item.level}</span>

            <strong>Course Type</strong>
            <span>{getCourseTypeLabel(item.course_type)}</span>

            <strong>Exam</strong>
            <span>
              {item.exam_number ? `Exam ${item.exam_number}` : "-"}
            </span>

            <strong>Week</strong>
            <span>{item.week_number}</span>

            {item.homework_skill && (
              <>
                <strong>Skill</strong>
                <span>
                  {getHomeworkSkillLabel(item.level, item.homework_skill)}
                </span>
              </>
            )}

            <strong>Release Date</strong>
            <span>{item.release_date || "-"}</span>

            <strong>Due Date</strong>
            <span>{item.due_date || "-"}</span>

            <strong>Description</strong>
            <span>{item.description || "-"}</span>
          </div>

          {item.homework_skill === "listening" ? (
            (item.resource_url || item.audio_url) && (
              <div
                style={{
                  marginTop: "20px",
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                {item.resource_url && (
                  <a
                    href={item.resource_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "#1f3c88",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Open PDF
                  </a>
                )}

                {item.audio_url && (
                  <a
                    href={item.audio_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "#1f3c88",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Open Audio
                  </a>
                )}
              </div>
            )
          ) : item.resource_url ? (
            <div
              style={{
                marginTop: "20px",
              }}
            >
              <a
                href={item.resource_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#1f3c88",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Open File
              </a>
            </div>
          ) : null}

          <div
            style={{
              marginTop: "25px",
              display: "flex",
              gap: "12px",
            }}
          >
            <button
              onClick={() => onEdit(item)}
              style={{
                background: "#1f3c88",
                color: "#ffffff",
                border: "none",
                padding: "10px 18px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Edit
            </button>

            <button
              onClick={() => onDelete(item.id)}
              style={{
                background: "#d32f2f",
                color: "#ffffff",
                border: "none",
                padding: "10px 18px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
