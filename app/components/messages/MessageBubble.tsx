"use client";

type Props = {
  sender: "student" | "teacher";
  message: string;
};

export default function MessageBubble({
  sender,
  message,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent:
          sender === "student"
            ? "flex-end"
            : "flex-start",
        marginBottom: "15px",
      }}
    >
      <div
        style={{
          background:
            sender === "student"
              ? "#1f3c88"
              : "#f1f3f5",
          color:
            sender === "student"
              ? "white"
              : "#222",
          padding: "12px 18px",
          borderRadius: "18px",
          maxWidth: "70%",
        }}
      >
        {message}
      </div>
    </div>
  );
}