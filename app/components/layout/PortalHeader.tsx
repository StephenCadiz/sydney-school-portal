"use client";

import Image from "next/image";
import TeacherLiveClock from "./TeacherLiveClock";

type Props = {
  title: string;
};

export default function PortalHeader({ title }: Props) {
  return (
    <div
      className="teacher-portal-header"
      style={{
        background: "#ffffff",
        padding: "18px 24px",
        borderRadius: "12px",
        marginBottom: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "20px",
        flexWrap: "wrap",
        border: "1px solid #e3e8ef",
      }}
    >
      <div
        className="teacher-portal-header-brand"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          minWidth: 0,
        }}
      >
        <Image
          src="/LOGO and NAME.png"
          alt="Sydney School"
          width={190}
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
      <TeacherLiveClock />
    </div>
  );
}
