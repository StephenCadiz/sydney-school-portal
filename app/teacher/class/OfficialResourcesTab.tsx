"use client";

import { useEffect, useState } from "react";
import {
  getOfficialTeacherResourcesForLevel,
  type TeacherResource,
} from "../../../lib/teacherResources";
import TeacherResourceCard from "./TeacherResourceCard";

const sectionStyle = {
  display: "grid",
  gap: "18px",
} as const;

const stateBoxStyle = {
  background: "#f8fafd",
  border: "1px dashed var(--ss-border, #dbe7f3)",
  borderRadius: "12px",
  padding: "20px",
  color: "#667085",
  lineHeight: 1.5,
} as const;

const retryButtonStyle = {
  width: "fit-content",
  background: "var(--ss-blue, #2f7db8)",
  color: "#ffffff",
  border: "none",
  borderRadius: "9px",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
} as const;

type OfficialResourcesTabProps = {
  levelId: string | number | null | undefined;
  levelName: string;
};

export default function OfficialResourcesTab({
  levelId,
  levelName,
}: OfficialResourcesTabProps) {
  const [resources, setResources] = useState<TeacherResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadResources() {
      if (!levelId) {
        setResources([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const data = await getOfficialTeacherResourcesForLevel(levelId);

        if (active) {
          setResources(data);
        }
      } catch (loadError) {
        console.error("Official Resources load failed:", loadError);

        if (active) {
          setResources([]);
          setError("Resources could not be loaded. Please try again.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadResources();

    return () => {
      active = false;
    };
  }, [levelId, reloadKey]);

  return (
    <div style={sectionStyle}>
      <div style={{ display: "grid", gap: "7px" }}>
        <h3
          style={{
            margin: 0,
            color: "var(--ss-blue-dark, #1f3c88)",
            fontSize: "22px",
          }}
        >
          Official Resources{levelName ? ` - ${levelName}` : ""}
        </h3>
        <p style={{ margin: 0, color: "#667085", lineHeight: 1.5 }}>
          Official Sydney School resources available to teachers of this level.
        </p>
      </div>

      {loading ? (
        <div style={stateBoxStyle}>Loading Official Resources...</div>
      ) : error ? (
        <div style={{ ...stateBoxStyle, display: "grid", gap: "12px" }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            style={retryButtonStyle}
          >
            Retry
          </button>
        </div>
      ) : resources.length === 0 ? (
        <div style={stateBoxStyle}>
          No Official Resources have been added for this level yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          {resources.map((resource) => (
            <TeacherResourceCard key={resource.id} resource={resource} />
          ))}
        </div>
      )}
    </div>
  );
}
