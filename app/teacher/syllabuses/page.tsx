"use client";

import { useEffect, useState } from "react";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { SyllabusesWorkspace } from "../../admin/syllabuses/page";
import { supabase } from "../../../lib/supabase";

export default function TeacherSyllabusesPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    async function verify() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (active) setAllowed(false);
        return;
      }
      const response = await fetch("/api/teacher/coordinator-levels", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (active) {
        setAllowed(response.ok && Array.isArray(payload.levels) && payload.levels.length > 0);
      }
    }
    void verify();
    return () => {
      active = false;
    };
  }, []);

  return (
    <TeacherLayout>
      {allowed === false ? (
        <main className="teacher-page-state" role="alert">
          <h1>Syllabuses</h1>
          <p>You are not assigned as a syllabus coordinator.</p>
        </main>
      ) : allowed === null ? (
        <main className="teacher-page-state" aria-busy="true">
          Loading syllabuses…
        </main>
      ) : (
        <SyllabusesWorkspace />
      )}
    </TeacherLayout>
  );
}
