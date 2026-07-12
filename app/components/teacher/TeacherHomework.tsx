"use client";

import { useEffect, useState } from "react";
import { getClassHomework } from "../../../lib/teacher-homework";
import { FileText } from "lucide-react";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type Props = {
  level: string;
  courseType: string;
};

const homeworkLinkStyle = {
  display: "inline-block",
  background: "#1f3c88",
  color: "white",
  padding: "12px 22px",
  borderRadius: "8px",
  textDecoration: "none",
  fontWeight: "bold",
} as const;

export default function TeacherHomework({
  level,
  courseType,
}: Props) {
  const [homework, setHomework] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const data = await getClassHomework(level, courseType);

      

      setHomework(data);
    }

    load();
  }, [level, courseType]);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Homework</h1>

      {homework.map((item) => (
        <div
  key={item.id}
  style={{
    border: "1px solid #ddd",
    background: "#ffffff",
    padding: "25px",
    marginBottom: "25px",
    borderRadius: "14px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    position: "relative",
  }}
>

<div
  style={{
    position: "absolute",
    top: "20px",
    right: "20px",
    background: "#1f3c88",
    color: "white",
    padding: "6px 16px",
    borderRadius: "20px",
    fontWeight: "bold",
    fontSize: "14px",
  }}
>
  Week {item.week_number}
</div>

         <h2
  style={{
    margin: "0 0 12px 0",
    color: "#1f3c88",
    fontSize: "28px",
    fontWeight: 700,
  }}
>
  {item.title}
</h2>

         <p
  style={{
    fontSize: "18px",
    color: "#555",
    marginBottom: "25px",
  }}
>
  {item.description}
</p>



        

<div
        style={{
          display: "flex",
          gap: "20px",
          marginTop: "20px",
        }}
      >
        <div
          style={{
            background: "#f5f7fa",
            padding: "15px",
            borderRadius: "10px",
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: "13px",
              color: "#777",
              marginBottom: "5px",
            }}
          >
            RELEASE DATE
          </div>

          <div
            style={{
              fontWeight: "bold",
              fontSize: "18px",
            }}
          >
            {formatDate(item.release_date)}
          </div>
        </div>

        <div
          style={{
            background: "#f5f7fa",
            padding: "15px",
            borderRadius: "10px",
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: "13px",
              color: "#777",
              marginBottom: "5px",
            }}
          >
            DUE DATE
          </div>

          <div
            style={{
              fontWeight: "bold",
              fontSize: "18px",
            }}
          >
            {formatDate(item.due_date)}
          </div>
        </div>
      </div>

      {/* INSERT THE BUTTON HERE */}

      {item.homework_skill === "listening" ? (
        (item.resource_url || item.audio_url) && (
          <div
            style={{
              marginTop: "25px",
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
                style={homeworkLinkStyle}
              >
                <>
                  <FileText
                    size={18}
                    style={{
                      marginRight: "8px",
                      verticalAlign: "middle",
                    }}
                  />
                  Open PDF
                </>
              </a>
            )}

            {item.audio_url && (
              <a
                href={item.audio_url}
                target="_blank"
                rel="noreferrer"
                style={homeworkLinkStyle}
              >
                Open Audio
              </a>
            )}
          </div>
        )
      ) : item.resource_url ? (
        <div
          style={{
            marginTop: "25px",
          }}
        >
          <a
            href={item.resource_url}
            target="_blank"
            rel="noreferrer"
            style={homeworkLinkStyle}
          >
            <>
  <FileText
    size={18}
    style={{
      marginRight: "8px",
      verticalAlign: "middle",
    }}
  />
  Open File
</>
          </a>
        </div>
      ) : null}

        </div>
      ))}
    </div>
  );
}
