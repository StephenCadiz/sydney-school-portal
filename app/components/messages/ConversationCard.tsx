"use client";

type Props = {
  teacherName: string;
  lastMessage: string;
};

export default function ConversationCard({
  teacherName,
  lastMessage,
}: Props) {
  return (
    <div
      style={{
        background: "white",
        padding: "18px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        cursor: "pointer",
      }}
    >
      <h3
        style={{
          margin: 0,
          color: "#1f3c88",
        }}
      >
        {teacherName}
      </h3>

      <p
        style={{
          color: "#666",
          marginTop: "8px",
          marginBottom: 0,
        }}
      >
        {lastMessage}
      </p>
    </div>
  );
}