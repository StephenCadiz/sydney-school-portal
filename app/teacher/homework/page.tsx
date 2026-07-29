"use client";

import Link from "next/link";

import TeacherLayout from "../../components/layout/TeacherLayout";

export default function TeacherHomeworkCompatibilityPage() {
  return (
    <TeacherLayout>
      <section
        className="teacher-homework-state"
        aria-labelledby="teacher-homework-heading"
      >
        <h1 id="teacher-homework-heading">Cambridge Homework</h1>
        <p>
          Cambridge homework is now organised by class. Open My Classes and
          select a class to view homework, papers, audio, keys and sample
          answers.
        </p>
        <Link className="exam-bank-button" href="/teacher/my-classes">
          Go to My Classes
        </Link>
      </section>
    </TeacherLayout>
  );
}
