"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

type Props = {
  item: any;
};

function ClassroomIcon() {
  return (
    <svg
      aria-hidden="true"
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-8h6v8" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function MyClassCard({ item }: Props) {
  const router = useRouter();

  const isOnlineClass =
    String(item.course_type || "").toLowerCase() === "online";
  const classTitle = item.levels?.name || item.class_name || "Class";
  const classroomName = isOnlineClass
    ? "Online Class"
    : item.classrooms?.name || "Classroom not assigned";
  const classroomLogo = isOnlineClass
    ? "/On-Line Logo.png"
    : item.classrooms?.logo || "/Emu Logo.png";
  const courseDescription = item.is_cambridge
    ? isOnlineClass
      ? "Online Cambridge Course"
      : "Cambridge Course"
    : "Young Learners";
  const badgeLabel = item.is_cambridge ? "CAMBRIDGE" : "YOUNG LEARNERS";

  return (
    <div className="teacher-my-classes-card">
      <div className="teacher-my-classes-card-image">
        <Image
          src={classroomLogo}
          alt={classroomName}
          width={92}
          height={92}
        />
      </div>

      <div className="teacher-my-classes-card-identity">
        <h2>{classTitle}</h2>
        <p>{courseDescription}</p>
      </div>

      <div className="teacher-my-classes-schedule">
        <div className="teacher-my-classes-schedule-item">
          <ClassroomIcon />
          <div>
            <span>Classroom</span>
            <strong>{classroomName}</strong>
          </div>
        </div>

        <div className="teacher-my-classes-schedule-item">
          <CalendarIcon />
          <div>
            <span>Days</span>
            <strong>{item.days || "-"}</strong>
          </div>
        </div>

        <div className="teacher-my-classes-schedule-item">
          <ClockIcon />
          <div>
            <span>Time</span>
            <strong>
              {item.start_time || "-"} - {item.end_time || "-"}
            </strong>
          </div>
        </div>
      </div>

      <div className="teacher-my-classes-actions">
        <span
          className={`teacher-my-classes-badge ${
            item.is_cambridge ? "is-cambridge" : "is-young-learners"
          }`}
        >
          {badgeLabel}
        </span>

        <button
          type="button"
          className="teacher-my-classes-open-button"
          onClick={() => router.push(`/teacher/class?id=${item.id}`)}
        >
          <span>Open Workspace</span>
          <ArrowIcon />
        </button>
      </div>
    </div>
  );
}
