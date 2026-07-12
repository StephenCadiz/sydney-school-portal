"use client";

import { useEffect, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import HomeworkForm from "../../components/admin/HomeworkForm";
import HomeworkList from "../../components/admin/HomeworkList";

import {
  getAllHomework,
  createHomework,
  updateHomework,
  deleteHomework,
} from "../../../lib/homework";
import { upsertCambridgeExamKey } from "../../../lib/cambridgeExamKeys";

export default function HomeworkPage() {
  const [homework, setHomework] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingHomework, setEditingHomework] = useState<any>(null);

  async function loadHomework() {
    try {
      const data = await getAllHomework();
      setHomework(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHomework();
  }, []);

  async function handleSave(homeworkData: any) {
  try {
    const { teacher_key_url, ...homeworkPayload } = homeworkData;

    if (editingHomework) {
      await updateHomework(editingHomework.id, homeworkPayload);

      setEditingHomework(null);
    } else {
      await createHomework(homeworkPayload);
    }

    await upsertCambridgeExamKey(
      homeworkPayload.level,
      homeworkPayload.course_type,
      homeworkPayload.exam_number,
      teacher_key_url
    );

    alert(
      editingHomework
        ? "Homework updated successfully."
        : "Homework saved successfully."
    );

    await loadHomework();
  } catch (error: any) {
    console.error(error);
    alert(error.message);
  }
}

  async function handleDelete(id: string) {
    if (!confirm("Delete this homework?")) return;

    try {
      await deleteHomework(id);
      loadHomework();
    } catch (error) {
      console.error(error);
      alert("Unable to delete homework.");
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
        Cambridge Homework Manager
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: "30px",
        }}
      >
        Create and manage Cambridge homework for all courses.
      </p>

      <HomeworkForm
  onSave={handleSave}
  editingHomework={editingHomework}
  onCancelEdit={() => setEditingHomework(null)}
/>
      {loading ? (
        <div
          style={{
            background: "#ffffff",
            padding: "30px",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          Loading homework...
        </div>
      ) : (
        <HomeworkList
  homework={homework}
  onDelete={handleDelete}
  onEdit={(item) => setEditingHomework(item)}
/>
      )}
    </AdminLayout>
  );
}
