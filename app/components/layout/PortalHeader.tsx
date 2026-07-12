"use client";

import Image from "next/image";

type Props = {
  title: string;
};

export default function PortalHeader({ title }: Props) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      style={{
        background: "#ffffff",
        padding: "25px 30px",
        borderRadius: "12px",
        marginBottom: "30px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
        }}
      >
        <Image
          src="/LOGO and NAME.png"
          alt="Sydney School"
          width={220}
          height={70}
          style={{
            height: "auto",
            width: "auto",
          }}
        />

        <div>
          <h1
            style={{
              margin: 0,
              color: "#1f3c88",
            }}
          >
            {title}
          </h1>

          <p
            style={{
              margin: "6px 0 0 0",
              color: "#666",
            }}
          >
            Sydney School Portal
          </p>
        </div>
      </div>

      <div
        style={{
          color: "#666",
          fontWeight: 600,
        }}
      >
        {today}
      </div>
    </div>
  );
}