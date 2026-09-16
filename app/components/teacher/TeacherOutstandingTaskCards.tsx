"use client";

import { ClipboardCheck, Clock3 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CLASS_REGISTER_CHANGED_EVENT } from "../../../lib/classRegister";
import { supabase } from "../../../lib/supabase";

type Task = {
  key: string;
  kind: "register" | "progress";
  class_id: string;
  class_name: string;
  level?: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  is_overdue?: boolean;
  register_started?: boolean;
};

function taskKey(kind: Task["kind"], item: Omit<Task, "key" | "kind">) {
  return `${kind}:${item.class_id}:${item.lesson_date}:${item.scheduled_start_time}`;
}

function displayTime(value: string) {
  return String(value || "").slice(0, 5);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00Z`));
}

function normalizeTasks(kind: Task["kind"], values: any[]): Task[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const item = {
      class_id: String(value?.class_id || ""),
      class_name: String(value?.class_name || "").trim() || "Class",
      level: value?.level ? String(value.level) : undefined,
      lesson_date: String(value?.lesson_date || ""),
      scheduled_start_time: String(value?.scheduled_start_time || ""),
      scheduled_end_time: String(value?.scheduled_end_time || ""),
      is_overdue: Boolean(value?.is_overdue),
      register_started: Boolean(value?.register_started),
    };
    if (!item.class_id || !item.lesson_date || !item.scheduled_start_time) {
      return [];
    }
    const key = taskKey(kind, item);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...item, key, kind }];
  });
}

export default function TeacherOutstandingTaskCards() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<{ registers: Task[]; progress: Task[] }>({
    registers: [],
    progress: [],
  });
  const requestIdRef = useRef(0);

  const loadTasks = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (requestId === requestIdRef.current) {
          setTasks({ registers: [], progress: [] });
        }
        return;
      }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [registerResponse, progressResponse] = await Promise.all([
        fetch("/api/teacher/class-register/reminders", {
          headers,
          cache: "no-store",
        }),
        fetch("/api/teacher/class-progress/reminders", {
          headers,
          cache: "no-store",
        }),
      ]);
      const [registerPayload, progressPayload] = await Promise.all([
        registerResponse.json().catch(() => ({})),
        progressResponse.json().catch(() => ({})),
      ]);
      if (!registerResponse.ok || !progressResponse.ok) {
        throw new Error(
          registerPayload?.error ||
            progressPayload?.error ||
            "Unable to load Teacher tasks."
        );
      }
      if (requestId !== requestIdRef.current) return;
      setTasks({
        registers: normalizeTasks("register", registerPayload?.reminders || []),
        progress: normalizeTasks("progress", progressPayload?.reminders || []),
      });
    } catch (error) {
      console.error("Unable to load Teacher outstanding tasks:", error);
    }
  }, []);

  useEffect(() => {
    if (pathname !== "/teacher" && pathname !== "/teacher/class") return;
    void loadTasks();
    const interval = window.setInterval(() => void loadTasks(), 60_000);
    const refresh = () => void loadTasks();
    window.addEventListener(CLASS_REGISTER_CHANGED_EVENT, refresh);
    window.addEventListener("teacher-class-progress-updated", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(CLASS_REGISTER_CHANGED_EVENT, refresh);
      window.removeEventListener("teacher-class-progress-updated", refresh);
    };
  }, [loadTasks, pathname]);

  const scope = useMemo(() => {
    if (pathname !== "/teacher/class") return null;
    return {
      classId: searchParams.get("id") || "",
      lessonDate: searchParams.get("lessonDate") || "",
      startTime: searchParams.get("startTime") || "",
    };
  }, [pathname, searchParams]);

  const filterTasks = useCallback(
    (items: Task[]) => {
      if (!scope?.classId) return items;
      return items.filter(
        (item) =>
          item.class_id === scope.classId &&
          (!scope.lessonDate || item.lesson_date === scope.lessonDate) &&
          (!scope.startTime || item.scheduled_start_time === scope.startTime)
      );
    },
    [scope]
  );

  const registers = filterTasks(tasks.registers);
  const progress = filterTasks(tasks.progress);
  if (pathname !== "/teacher" && pathname !== "/teacher/class") return null;
  if (!registers.length && !progress.length) return null;

  function openTask(task: Task) {
    const tab = task.kind === "register" ? "class-register" : "class-progress";
    router.push(
      `/teacher/class?id=${encodeURIComponent(task.class_id)}&tab=${tab}&lessonDate=${encodeURIComponent(
        task.lesson_date
      )}&startTime=${encodeURIComponent(task.scheduled_start_time)}`
    );
  }

  function TaskEntry({ task }: { task: Task }) {
    return (
      <article className="teacher-outstanding-task-entry">
        <div className="teacher-outstanding-task-icon" aria-hidden="true">
          {task.kind === "register" ? <ClipboardCheck size={18} /> : <Clock3 size={18} />}
        </div>
        <div className="teacher-outstanding-task-copy">
          <strong>{task.class_name}</strong>
          <span>
            {task.level ? `${task.level} · ` : ""}
            {displayDate(task.lesson_date)} · {displayTime(task.scheduled_start_time)}–
            {displayTime(task.scheduled_end_time)}
          </span>
        </div>
        <button type="button" onClick={() => openTask(task)}>
          {task.kind === "register"
            ? task.register_started
              ? "Continue register"
              : "Open register"
            : "Open class progress"}
        </button>
      </article>
    );
  }

  return (
    <div className="teacher-outstanding-task-cards" aria-label="Outstanding Teacher tasks">
      {registers.length > 0 && (
        <section className="teacher-outstanding-task-card" aria-labelledby="teacher-register-tasks-heading">
          <header>
            <div>
              <h2 id="teacher-register-tasks-heading">Registers required</h2>
              <p>{registers.length} class session{registers.length === 1 ? "" : "s"} awaiting attendance</p>
            </div>
            <span>{registers.filter((item) => item.is_overdue).length} overdue</span>
          </header>
          <div className="teacher-outstanding-task-list">
            {registers.map((task) => <TaskEntry key={task.key} task={task} />)}
          </div>
        </section>
      )}
      {progress.length > 0 && (
        <section className="teacher-outstanding-task-card" aria-labelledby="teacher-progress-tasks-heading">
          <header>
            <div>
              <h2 id="teacher-progress-tasks-heading">Class progress required</h2>
              <p>{progress.length} class session{progress.length === 1 ? "" : "s"} awaiting completion</p>
            </div>
            <span>{progress.filter((item) => item.is_overdue).length} overdue</span>
          </header>
          <div className="teacher-outstanding-task-list">
            {progress.map((task) => <TaskEntry key={task.key} task={task} />)}
          </div>
        </section>
      )}
    </div>
  );
}
