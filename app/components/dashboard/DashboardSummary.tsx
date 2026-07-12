import Image from "next/image";

type Props = {
  teacherName: string;
  classroom: string;
  classroomLogo?: string;
  classroomThemeColour?: string;
  classCount: number;
};

export default function DashboardSummary({
  teacherName,
  classroom,
  classroomLogo,
  classroomThemeColour,
  classCount,
}: Props) {
  const themeColour = classroomThemeColour || "#1f3c88";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr 1fr",
        gap: "20px",
        marginBottom: "30px",
      }}
    >
      {/* Welcome */}

      <div
        style={{
          background: "#ffffff",
          padding: "25px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <p
          style={{
            color: "#888",
            marginBottom: "8px",
          }}
        >
          Welcome back
        </p>

        <h2
          style={{
            margin: 0,
            color: "#1f3c88",
          }}
        >
          {teacherName}
        </h2>

        <p
          style={{
            marginTop: "15px",
            color: "#666",
          }}
        >
          Ready for another great day of teaching.
        </p>
      </div>

      {/* Classroom */}

      <div
        style={{
          background: "#ffffff",
          padding: "20px",
          borderRadius: "12px",
          textAlign: "center",
          borderTop: `4px solid ${themeColour}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            color: "#1f3c88",
          }}
        >
          Classroom
        </h3>

        <div
          style={{
            minHeight: "58px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "10px",
          }}
        >
          <Image
            src={classroomLogo || "/Emu Logo.png"}
            alt={`${classroom} classroom`}
            width={58}
            height={58}
            style={{
              objectFit: "contain",
            }}
          />
        </div>

        <div
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "#1f3c88",
            lineHeight: 1.2,
          }}
        >
          {classroom}
        </div>
      </div>

      {/* Classes */}

      <div
        style={{
          background: "#ffffff",
          padding: "20px",
          borderRadius: "12px",
          textAlign: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            color: "#1f3c88",
          }}
        >
          Classes
        </h3>

        <div
          style={{
            fontSize: "32px",
            fontWeight: 700,
            color: "#1f3c88",
          }}
        >
          {classCount}
        </div>
      </div>

      {/* Status */}

      <div
        style={{
          background: "#ffffff",
          padding: "20px",
          borderRadius: "12px",
          textAlign: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            color: "#1f3c88",
          }}
        >
          Status
        </h3>

        <div
          style={{
            color: "#2e7d32",
            fontWeight: 700,
            fontSize: "22px",
          }}
        >
          Active
        </div>
      </div>
    </div>
  );
}
