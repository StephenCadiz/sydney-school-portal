"use client";

import { useEffect, useMemo, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import { supabase } from "../../../lib/supabase";
import {
  deleteTeacherResourceForAdmin,
  getAllOfficialTeacherResourcesForAdmin,
  getAllSharedTeacherResourcesForAdmin,
  type TeacherResource,
} from "../../../lib/teacherResources";
import AdminResourceCard from "./AdminResourceCard";
import OfficialResourceForm from "./OfficialResourceForm";

type LevelOption = {
  id: string | number;
  name: string;
};

type AdminResourceTab = "official" | "shared";

const cardShellStyle = {
  background: "#ffffff",
  border: "1px solid var(--ss-border, #dbe7f3)",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
} as const;

const tabButtonBaseStyle = {
  borderRadius: "999px",
  padding: "10px 16px",
  cursor: "pointer",
  fontWeight: 700,
  border: "1px solid var(--ss-border, #dbe7f3)",
} as const;

const selectStyle = {
  width: "100%",
  maxWidth: "320px",
  padding: "11px 12px",
  border: "1px solid #d9e2ef",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "15px",
} as const;

const primaryButtonStyle = {
  background: "var(--ss-blue, #2f7db8)",
  color: "#ffffff",
  border: "none",
  borderRadius: "9px",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "#ffffff",
  color: "var(--ss-blue-dark, #1f3c88)",
  border: "1px solid var(--ss-border, #dbe7f3)",
} as const;

const dangerButtonStyle = {
  ...primaryButtonStyle,
  background: "#b42318",
} as const;

function getFilteredResources(
  resources: TeacherResource[],
  selectedLevelId: string
) {
  if (selectedLevelId === "all") {
    return resources;
  }

  return resources.filter(
    (resource) => String(resource.level_id) === String(selectedLevelId)
  );
}

function getLevelName(levels: LevelOption[], levelId: string) {
  return (
    levels.find((level) => String(level.id) === String(levelId))?.name ||
    "this level"
  );
}

export default function AdminTeacherResourcesPage() {
  const [activeTab, setActiveTab] = useState<AdminResourceTab>("official");
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [officialResources, setOfficialResources] = useState<TeacherResource[]>(
    []
  );
  const [sharedResources, setSharedResources] = useState<TeacherResource[]>([]);
  const [officialLoading, setOfficialLoading] = useState(true);
  const [sharedLoading, setSharedLoading] = useState(true);
  const [officialError, setOfficialError] = useState("");
  const [sharedError, setSharedError] = useState("");
  const [levelsError, setLevelsError] = useState("");
  const [officialLevelFilter, setOfficialLevelFilter] = useState("all");
  const [sharedLevelFilter, setSharedLevelFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TeacherResource | null>(null);
  const [deletingId, setDeletingId] = useState("");

  const currentLevelFilter =
    activeTab === "official" ? officialLevelFilter : sharedLevelFilter;
  const setCurrentLevelFilter =
    activeTab === "official" ? setOfficialLevelFilter : setSharedLevelFilter;

  const filteredOfficialResources = useMemo(
    () => getFilteredResources(officialResources, officialLevelFilter),
    [officialResources, officialLevelFilter]
  );
  const filteredSharedResources = useMemo(
    () => getFilteredResources(sharedResources, sharedLevelFilter),
    [sharedResources, sharedLevelFilter]
  );

  async function loadLevels() {
    setLevelsError("");

    const { data, error } = await supabase
      .from("levels")
      .select("id, name")
      .order("name");

    if (error) {
      console.error("Unable to load resource levels:", error);
      setLevels([]);
      setLevelsError("Levels could not be loaded.");
      return;
    }

    setLevels(data || []);
  }

  async function loadOfficialResources() {
    setOfficialLoading(true);
    setOfficialError("");

    try {
      const data = await getAllOfficialTeacherResourcesForAdmin();
      setOfficialResources(data);
    } catch (loadError) {
      console.error("Unable to load Official Resources:", loadError);
      setOfficialResources([]);
      setOfficialError("Official Resources could not be loaded. Please try again.");
    } finally {
      setOfficialLoading(false);
    }
  }

  async function loadSharedResources() {
    setSharedLoading(true);
    setSharedError("");

    try {
      const data = await getAllSharedTeacherResourcesForAdmin();
      setSharedResources(data);
    } catch (loadError) {
      console.error("Unable to load Shared Resources:", loadError);
      setSharedResources([]);
      setSharedError("Shared Resources could not be loaded. Please try again.");
    } finally {
      setSharedLoading(false);
    }
  }

  useEffect(() => {
    loadLevels();
    loadOfficialResources();
    loadSharedResources();
  }, []);

  async function handleOfficialCreated(successMessage: string) {
    setMessage(successMessage);
    setError("");
    await loadOfficialResources();
  }

  async function handleDeleteResource() {
    if (!deleteTarget || deletingId) {
      return;
    }

    setMessage("");
    setError("");
    setDeletingId(deleteTarget.id);

    try {
      const result = await deleteTeacherResourceForAdmin(deleteTarget.id);

      if (deleteTarget.resource_scope === "official_teacher") {
        setOfficialResources((current) =>
          current.filter((resource) => resource.id !== deleteTarget.id)
        );
      } else {
        setSharedResources((current) =>
          current.filter((resource) => resource.id !== deleteTarget.id)
        );
      }

      setMessage(
        result.storageCleanupFailed
          ? result.message || "Resource deleted. File cleanup needs review."
          : "Resource deleted."
      );
      setDeleteTarget(null);
    } catch (deleteError) {
      console.error("Unable to delete teacher resource:", deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete resource."
      );
    } finally {
      setDeletingId("");
    }
  }

  function renderFilter() {
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "18px",
        }}
      >
        <label
          htmlFor="teacher-resource-level-filter"
          style={{
            color: "#344054",
            fontWeight: 700,
          }}
        >
          Filter by level
        </label>
        <select
          id="teacher-resource-level-filter"
          value={currentLevelFilter}
          onChange={(event) => setCurrentLevelFilter(event.target.value)}
          style={selectStyle}
        >
          <option value="all">All Levels</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function renderOfficialResources() {
    const emptyMessage =
      officialLevelFilter === "all"
        ? "No Official Resources have been added yet."
        : "No Official Resources have been added for this level yet.";

    return (
      <div style={{ display: "grid", gap: "18px" }}>
        <OfficialResourceForm
          levels={levels}
          onCreated={handleOfficialCreated}
        />

        <section style={cardShellStyle}>
          <div style={{ display: "grid", gap: "6px", marginBottom: "18px" }}>
            <h2
              style={{
                margin: 0,
                color: "var(--ss-blue-dark, #1f3c88)",
                fontSize: "22px",
              }}
            >
              Official Resources
            </h2>
            <p style={{ margin: 0, color: "#667085" }}>
              Add and manage official Sydney School resources for each level.
            </p>
          </div>

          {renderFilter()}

          {officialLoading ? (
            <StateBox>Loading Official Resources...</StateBox>
          ) : officialError ? (
            <StateBox>
              <span>{officialError}</span>
              <button
                type="button"
                onClick={loadOfficialResources}
                style={primaryButtonStyle}
              >
                Retry
              </button>
            </StateBox>
          ) : filteredOfficialResources.length === 0 ? (
            <StateBox>{emptyMessage}</StateBox>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {filteredOfficialResources.map((resource) => (
                <AdminResourceCard
                  key={resource.id}
                  resource={resource}
                  deleting={deletingId === resource.id}
                  onRequestDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderSharedResources() {
    const emptyMessage =
      sharedLevelFilter === "all"
        ? "No Shared Resources have been posted by teachers yet."
        : "No Shared Resources have been posted for this level yet.";

    return (
      <section style={cardShellStyle}>
        <div style={{ display: "grid", gap: "6px", marginBottom: "18px" }}>
          <h2
            style={{
              margin: 0,
              color: "var(--ss-blue-dark, #1f3c88)",
              fontSize: "22px",
            }}
          >
            Shared Resources
          </h2>
          <p style={{ margin: 0, color: "#667085" }}>
            View teacher-posted resources and remove inappropriate, duplicated,
            outdated or broken materials.
          </p>
        </div>

        {renderFilter()}

        {sharedLoading ? (
          <StateBox>Loading Shared Resources...</StateBox>
        ) : sharedError ? (
          <StateBox>
            <span>{sharedError}</span>
            <button
              type="button"
              onClick={loadSharedResources}
              style={primaryButtonStyle}
            >
              Retry
            </button>
          </StateBox>
        ) : filteredSharedResources.length === 0 ? (
          <StateBox>{emptyMessage}</StateBox>
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            {filteredSharedResources.map((resource) => (
              <AdminResourceCard
                key={resource.id}
                resource={resource}
                showCreator
                deleting={deletingId === resource.id}
                onRequestDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <AdminLayout>
      <div style={{ display: "grid", gap: "22px" }}>
        <header>
          <h1
            style={{
              color: "var(--ss-blue-dark, #1f3c88)",
              margin: "0 0 10px",
              fontSize: "34px",
            }}
          >
            Teacher Resources
          </h1>
          <p style={{ color: "#667085", margin: 0, fontSize: "16px" }}>
            Manage level-wide resources available to teachers.
          </p>
        </header>

        {(message || error || levelsError) && (
          <div
            aria-live="polite"
            style={{
              background: "#ffffff",
              border: `1px solid ${error || levelsError ? "#f1c6c6" : "#cfe8d6"}`,
              borderRadius: "10px",
              padding: "14px 16px",
              color: error || levelsError ? "#b00020" : "#287a45",
              fontWeight: 700,
              boxShadow: "0 4px 14px rgba(31,60,136,0.05)",
              whiteSpace: "pre-line",
            }}
          >
            {error || levelsError || message}
          </div>
        )}

        <nav
          aria-label="Teacher resource sections"
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab("official");
              setMessage("");
              setError("");
            }}
            style={{
              ...tabButtonBaseStyle,
              background:
                activeTab === "official" ? "var(--ss-blue, #2f7db8)" : "#ffffff",
              color:
                activeTab === "official"
                  ? "#ffffff"
                  : "var(--ss-blue-dark, #1f3c88)",
            }}
          >
            Official Resources
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("shared");
              setMessage("");
              setError("");
            }}
            style={{
              ...tabButtonBaseStyle,
              background:
                activeTab === "shared" ? "var(--ss-blue, #2f7db8)" : "#ffffff",
              color:
                activeTab === "shared"
                  ? "#ffffff"
                  : "var(--ss-blue-dark, #1f3c88)",
            }}
          >
            Shared Resources
          </button>
        </nav>

        {activeTab === "official"
          ? renderOfficialResources()
          : renderSharedResources()}
      </div>

      {deleteTarget && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(15, 23, 42, 0.42)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-resource-title"
            style={{
              width: "min(520px, 100%)",
              background: "#ffffff",
              borderRadius: "14px",
              border: "1px solid var(--ss-border, #dbe7f3)",
              boxShadow: "0 20px 45px rgba(15, 23, 42, 0.18)",
              padding: "22px",
              display: "grid",
              gap: "14px",
            }}
          >
            <h2
              id="delete-resource-title"
              style={{
                margin: 0,
                color: "var(--ss-blue-dark, #1f3c88)",
                fontSize: "22px",
              }}
            >
              Delete "{deleteTarget.title}"?
            </h2>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.55 }}>
              {deleteTarget.resource_scope === "official_teacher"
                ? `This will remove the resource for every teacher teaching ${
                    deleteTarget.level_name || getLevelName(levels, String(deleteTarget.level_id))
                  }.`
                : "This teacher-shared resource will be removed for every teacher teaching this level."}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(deletingId)}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteResource}
                disabled={Boolean(deletingId)}
                style={
                  deletingId
                    ? { ...secondaryButtonStyle, cursor: "not-allowed" }
                    : dangerButtonStyle
                }
              >
                {deletingId ? "Deleting..." : "Delete Resource"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function StateBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#f8fafd",
        border: "1px dashed var(--ss-border, #dbe7f3)",
        borderRadius: "12px",
        padding: "20px",
        color: "#667085",
        lineHeight: 1.5,
        display: "grid",
        gap: "12px",
      }}
    >
      {children}
    </div>
  );
}
