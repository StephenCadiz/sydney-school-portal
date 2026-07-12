"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import { getTeachers } from "../../../lib/adminTeachers";
import { supabase } from "../../../lib/supabase";

function getTeacherName(teacher: any) {
  return `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim();
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadTeachers() {
    setLoading(true);

    try {
      const data = await getTeachers();
      setTeachers(data);
    } catch (error) {
      console.error("Unable to load teachers:", error);
      setMessage("Unable to load teachers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeachers();
  }, []);

  async function handleDeleteTeacher(teacherId: string) {
    const confirmed = confirm(
      "Are you sure you want to delete this teacher? This cannot be undone."
    );

    if (!confirmed) return;

    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("You must be logged in as an admin.");
        return;
      }

      const response = await fetch("/api/admin/teachers/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          teacher_id: teacherId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to delete teacher.");
      }

      await loadTeachers();
      setMessage(result.message || "Teacher deleted successfully.");
    } catch (error: any) {
      console.error("Unable to delete teacher:", error);
      setMessage(error.message || "Unable to delete teacher.");
    }
  }

  return (
    <AdminLayout>
      <h1
        style={{
          color: "#1f3c88",
          marginBottom: "10px",
        }}
      >
        Teachers
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: "24px",
        }}
      >
        View and manage teacher accounts.
      </p>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid var(--ss-border)",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          padding: "20px",
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              color: "#1f3c88",
              margin: "0 0 6px",
              fontSize: "18px",
            }}
          >
            Need to add a new teacher?
          </h2>
          <p
            style={{
              color: "#666",
              margin: 0,
            }}
          >
            Use Add Users to create teacher accounts.
          </p>
        </div>

        <Link
          href="/admin/add-users"
          style={{
            background: "var(--ss-blue)",
            color: "#ffffff",
            borderRadius: "8px",
            padding: "11px 18px",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          Add Users
        </Link>
      </div>

      {message && (
        <div
          style={{
            background: "#ffffff",
            borderRadius: "8px",
            padding: "14px",
            marginBottom: "20px",
            color: "#333",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          {message}
        </div>
      )}

      <div
        style={{
          background: "#ffffff",
          padding: "30px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <h2
          style={{
            color: "#1f3c88",
            marginTop: 0,
            marginBottom: "20px",
          }}
        >
          Existing Teachers
        </h2>

        {loading ? (
          <p>Loading teachers...</p>
        ) : teachers.length === 0 ? (
          <p
            style={{
              color: "#333",
            }}
          >
            No teachers found.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "16px",
            }}
          >
            {teachers.map((teacher) => (
              <div
                key={teacher.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: "10px",
                  padding: "18px",
                  background: "#f8f9fc",
                }}
              >
                <h3
                  style={{
                    color: "#1f3c88",
                    marginTop: 0,
                    marginBottom: "8px",
                  }}
                >
                  {getTeacherName(teacher)}
                </h3>

                <div
                  style={{
                    color: "#555",
                  }}
                >
                  {teacher.email || "-"}
                </div>

                <button
                  onClick={() => handleDeleteTeacher(teacher.id)}
                  style={{
                    background: "#d32f2f",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    marginTop: "14px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
