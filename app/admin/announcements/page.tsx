"use client";

import { useEffect, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  createAdminAnnouncement,
  deleteAnnouncement,
  getAdminAnnouncements,
} from "../../../lib/announcements";
import { supabase } from "../../../lib/supabase";

const audienceOptions = [
  {
    label: "All Teachers",
    value: "all_teachers",
    audience_type: "all_teachers",
    target_level: null,
  },
  {
    label: "All Cambridge Students",
    value: "all_cambridge_students",
    audience_type: "all_cambridge_students",
    target_level: null,
  },
  {
    label: "All B1 Students",
    value: "level:B1",
    audience_type: "level",
    target_level: "B1",
  },
  {
    label: "All B2 Students",
    value: "level:B2",
    audience_type: "level",
    target_level: "B2",
  },
  {
    label: "All C1 Students",
    value: "level:C1",
    audience_type: "level",
    target_level: "C1",
  },
  {
    label: "All C2 Students",
    value: "level:C2",
    audience_type: "level",
    target_level: "C2",
  },
];

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #d9dfe9",
  borderRadius: "8px",
  fontSize: "15px",
  color: "#333",
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block" as const,
  color: "#333",
  fontWeight: 700,
  marginBottom: "7px",
};

function getAudienceOption(value: string) {
  return audienceOptions.find((option) => option.value === value);
}

function getAudienceLabel(announcement: any) {
  if (announcement.audience_type === "all_teachers") {
    return "All Teachers";
  }

  if (announcement.audience_type === "all_cambridge_students") {
    return "All Cambridge Students";
  }

  if (announcement.audience_type === "level" && announcement.target_level) {
    return `All ${announcement.target_level} Students`;
  }

  return "Selected audience";
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getPreview(content: string) {
  if (!content) return "";

  return content.length > 160
    ? `${content.slice(0, 160).trim()}...`
    : content;
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [audience, setAudience] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAnnouncements() {
    setLoading(true);
    setError("");

    try {
      const data = await getAdminAnnouncements();
      setAnnouncements(data);
    } catch (error: any) {
      console.error("Unable to load announcements:", error);
      setError(error.message || "Unable to load announcements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnnouncements();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    const selectedAudience = getAudienceOption(audience);

    if (!selectedAudience) {
      setError("Please choose an audience.");
      return;
    }

    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }

    if (!content.trim()) {
      setError("Please enter announcement content.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      await createAdminAnnouncement({
        title: title.trim(),
        content: content.trim(),
        audience_type: selectedAudience.audience_type,
        target_level: selectedAudience.target_level,
        created_by: session?.user.id || null,
      });

      setTitle("");
      setContent("");
      setMessage("Announcement published successfully.");
      await loadAnnouncements();
    } catch (error: any) {
      console.error("Unable to publish announcement:", error);
      setError(error.message || "Unable to publish announcement.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = confirm(
      "Are you sure you want to delete this announcement?"
    );

    if (!confirmed) return;

    setMessage("");
    setError("");

    try {
      await deleteAnnouncement(id);
      setMessage("Announcement deleted successfully.");
      await loadAnnouncements();
    } catch (error: any) {
      console.error("Unable to delete announcement:", error);
      setError(error.message || "Unable to delete announcement.");
    }
  }

  return (
    <AdminLayout>
      <h1
        style={{
          color: "#1f3c88",
          margin: "0 0 10px",
          fontSize: "34px",
        }}
      >
        Announcements
      </h1>

      <p
        style={{
          color: "#667085",
          margin: "0 0 30px",
          fontSize: "16px",
        }}
      >
        Send announcements to teachers and Cambridge student groups.
      </p>

      {(message || error) && (
        <div
          style={{
            background: "#ffffff",
            border: `1px solid ${error ? "#f1c6c6" : "#cfe8d6"}`,
            borderRadius: "10px",
            padding: "14px 16px",
            marginBottom: "22px",
            color: error ? "#b00020" : "#287a45",
            fontWeight: 700,
            boxShadow: "0 4px 14px rgba(31,60,136,0.05)",
            whiteSpace: "pre-line",
          }}
        >
          {error || message}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          background: "#ffffff",
          border: "1px solid #e6eaf2",
          borderRadius: "14px",
          padding: "26px",
          marginBottom: "28px",
          boxShadow: "0 8px 22px rgba(31,60,136,0.07)",
        }}
      >
        <h2
          style={{
            color: "#1f3c88",
            margin: "0 0 18px",
            fontSize: "22px",
          }}
        >
          Publish Announcement
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 0.7fr) minmax(260px, 1fr)",
            gap: "18px",
            marginBottom: "18px",
          }}
        >
          <div>
            <label style={labelStyle}>Audience</label>
            <select
              required
              style={inputStyle}
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
            >
              <option value="">Select audience</option>
              {audienceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Title</label>
            <input
              required
              style={inputStyle}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Announcement title"
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Content</label>
          <textarea
            required
            style={{
              ...inputStyle,
              minHeight: "130px",
              resize: "vertical",
              lineHeight: 1.5,
            }}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write the announcement..."
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            background: "#1f3c88",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "12px 20px",
            marginTop: "18px",
            cursor: saving ? "not-allowed" : "pointer",
            fontWeight: 800,
          }}
        >
          {saving ? "Publishing..." : "Publish Announcement"}
        </button>
      </form>

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e6eaf2",
          borderRadius: "14px",
          padding: "26px",
          boxShadow: "0 8px 22px rgba(31,60,136,0.07)",
        }}
      >
        <h2
          style={{
            color: "#1f3c88",
            margin: "0 0 18px",
            fontSize: "22px",
          }}
        >
          Broad Announcements
        </h2>

        {loading ? (
          <p style={{ color: "#667085", margin: 0 }}>
            Loading announcements...
          </p>
        ) : announcements.length === 0 ? (
          <p style={{ color: "#667085", margin: 0 }}>
            No broad announcements yet.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "14px",
            }}
          >
            {announcements.map((announcement) => (
              <article
                key={announcement.id}
                style={{
                  background: "#f8fafd",
                  border: "1px solid #e6eaf2",
                  borderRadius: "12px",
                  padding: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "16px",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "inline-block",
                        background: "#eaf0fb",
                        color: "#1f3c88",
                        borderRadius: "999px",
                        padding: "5px 10px",
                        fontSize: "12px",
                        fontWeight: 800,
                        marginBottom: "10px",
                      }}
                    >
                      {getAudienceLabel(announcement)}
                    </div>

                    <h3
                      style={{
                        color: "#1f3c88",
                        margin: "0 0 8px",
                        fontSize: "18px",
                      }}
                    >
                      {announcement.title || "Untitled announcement"}
                    </h3>

                    <p
                      style={{
                        color: "#555",
                        margin: "0 0 10px",
                        lineHeight: 1.55,
                      }}
                    >
                      {getPreview(announcement.content || "")}
                    </p>

                    <div
                      style={{
                        color: "#667085",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      {formatDate(announcement.created_at)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(announcement.id)}
                    style={{
                      background: "#ffffff",
                      color: "#b00020",
                      border: "1px solid #f1c6c6",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      cursor: "pointer",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
