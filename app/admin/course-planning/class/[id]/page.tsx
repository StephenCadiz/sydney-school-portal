"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import AdminLayout from "../../../../components/layout/AdminLayout";
import CoursePlanningTab from "../../../../teacher/class/CoursePlanningTab";

export default function AdminCoursePlanningClassPage() {
  const params = useParams<{ id: string }>();
  const classId = String(params?.id || "");
  return (
    <AdminLayout>
      <div className="admin-course-planning-detail">
        <Link href="/admin/course-planning" className="admin-course-planning-back">← Course Planning overview</Link>
        {classId && <CoursePlanningTab classId={classId} adminMode />}
      </div>
    </AdminLayout>
  );
}
