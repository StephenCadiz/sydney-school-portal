"use client";

import { usePathname } from "next/navigation";
import {
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import TeacherSidebar from "./TeacherSidebar";
import PortalHeader from "./PortalHeader";
import { useMessageRealtimeRefresh } from "../../hooks/useMessageRealtimeRefresh";
import { useStaffMessageNotifications } from "../../hooks/useStaffMessageNotifications";
import { getTeacherUnreadMessageCount } from "../../../lib/teacherMessageUnreadCount";
import { supabase } from "../../../lib/supabase";
import TeacherClassProgressReminder from "../teacher/TeacherClassProgressReminder";
import TeacherOutstandingTaskCards from "../teacher/TeacherOutstandingTaskCards";
import TeacherStudentMonitoringTasks from "../teacher/TeacherStudentMonitoringTasks";

interface TeacherLayoutProps {
  children: ReactNode | ((unreadMessageCount: number) => ReactNode);
}

const TEACHER_MESSAGES_CHANGED_EVENT = "teacher-unread-messages-changed";

export default function TeacherLayout({
  children,
}: TeacherLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [teacherFirstName, setTeacherFirstName] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [isSyllabusCoordinator, setIsSyllabusCoordinator] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [studentMonitoringCount, setStudentMonitoringCount] = useState(0);
  const [studentMonitoringOpen, setStudentMonitoringOpen] = useState(false);
  const mountedRef = useRef(false);
  const unreadCountErrorLoggedRef = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    let welcomeStorageKey = "";

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT" || !active) return;

      if (welcomeStorageKey) {
        try {
          window.sessionStorage.removeItem(welcomeStorageKey);
        } catch {
          // Session storage can be unavailable in privacy-restricted browsers.
        }
      }
      setTeacherId("");
      setTeacherFirstName("");
      setUnreadMessageCount(0);
      setStudentMonitoringCount(0);
      setStudentMonitoringOpen(false);
      setShowWelcome(false);
    });

    async function loadTeacher() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          if (active && mountedRef.current) {
            setTeacherId("");
            setTeacherFirstName("");
            setUnreadMessageCount(0);
            setStudentMonitoringOpen(false);
            setIsSyllabusCoordinator(false);
          }
          return;
        }

        if (active && mountedRef.current) {
          setIsSyllabusCoordinator(false);
        }
        const coordinatorResponse = await fetch("/api/teacher/coordinator-levels", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const coordinatorPayload = await coordinatorResponse.json().catch(() => ({}));
        if (active && mountedRef.current) {
          setIsSyllabusCoordinator(
            coordinatorResponse.ok &&
              Array.isArray(coordinatorPayload.levels) &&
              coordinatorPayload.levels.length > 0
          );
        }

        const { data: profileById, error } = await supabase
          .from("profiles")
          .select("id, first_name, role")
          .eq("id", session.user.id)
          .maybeSingle();

        let profile = profileById;
        if (!profile && session.user.email) {
          const { data: profilesByEmail, error: emailError } = await supabase
            .from("profiles")
            .select("id, first_name, role")
            .eq("email", session.user.email)
            .limit(2);
          if (emailError || (profilesByEmail || []).length > 1) {
            if (active && mountedRef.current) {
              setTeacherId("");
              setTeacherFirstName("");
              setUnreadMessageCount(0);
              setStudentMonitoringOpen(false);
            }
            return;
          }
          profile = profilesByEmail?.[0] || null;
        }

        if (error || profile?.role !== "teacher") {
          if (active && mountedRef.current) {
            setTeacherId("");
            setTeacherFirstName("");
            setUnreadMessageCount(0);
            setStudentMonitoringOpen(false);
            setIsSyllabusCoordinator(false);
          }
          return;
        }

        if (active && mountedRef.current) {
          const resolvedTeacherId = String(profile.id || session.user.id);
          setTeacherId(resolvedTeacherId);
          setTeacherFirstName(String(profile.first_name || "").trim());

          welcomeStorageKey = `teacher-welcome-seen:${resolvedTeacherId}`;
          let hasSeenWelcome = false;
          try {
            hasSeenWelcome = window.sessionStorage.getItem(welcomeStorageKey) === "1";
            if (pathname !== "/teacher") {
              window.sessionStorage.setItem(welcomeStorageKey, "1");
            }
          } catch {
            // Fall back to the route signal when session storage is unavailable.
          }
          setShowWelcome(pathname === "/teacher" && !hasSeenWelcome);
        }
      } catch (error) {
        if (!unreadCountErrorLoggedRef.current) {
          unreadCountErrorLoggedRef.current = true;
          console.error("Unable to load teacher message indicator:", error);
        }
      }
    }

    loadTeacher();

    return () => {
      active = false;
      mountedRef.current = false;
      authListener.subscription.unsubscribe();
    };
  }, [pathname]);

  useEffect(() => {
    if (!teacherId) return;
    let active = true;
    const loadMonitoringCount = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const response = await fetch("/api/teacher/student-monitoring?summary=1", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (active && response.ok) setStudentMonitoringCount(Math.max(0, Number(payload.count) || 0));
    };
    void loadMonitoringCount();
    const interval = window.setInterval(() => void loadMonitoringCount(), 60_000);
    window.addEventListener("teacher-student-monitoring-updated", loadMonitoringCount);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("teacher-student-monitoring-updated", loadMonitoringCount);
    };
  }, [teacherId]);

  const loadUnreadCount = useCallback(async () => {
    if (!teacherId) return;

    try {
      const { total_unread: count } = await getTeacherUnreadMessageCount();
      unreadCountErrorLoggedRef.current = false;

      if (mountedRef.current) {
        setUnreadMessageCount(count);
      }
    } catch (error) {
      if (!unreadCountErrorLoggedRef.current) {
        unreadCountErrorLoggedRef.current = true;
        console.error("Unable to load teacher message count:", error);
      }
    }
  }, [teacherId]);

  useMessageRealtimeRefresh({
    onRefresh: loadUnreadCount,
    enabled: Boolean(teacherId),
    intervalMs: 60000,
    customEventName: TEACHER_MESSAGES_CHANGED_EVENT,
    channelName: "teacher-layout-messages",
  });

  useStaffMessageNotifications({
    userId: teacherId,
    role: "teacher",
    enabled: Boolean(teacherId),
    refreshEventName: TEACHER_MESSAGES_CHANGED_EVENT,
  });

  return (
    <div
      className="teacher-layout-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--ss-page-bg)",
      }}
    >
      <button
        type="button"
        aria-label="Close teacher menu"
        className={`mobile-sidebar-overlay ${menuOpen ? "is-open" : ""}`}
        onClick={() => setMenuOpen(false)}
      />

      <TeacherSidebar
        isMobileOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        unreadMessageCount={unreadMessageCount}
        studentMonitoringCount={studentMonitoringCount}
        showSyllabuses={isSyllabusCoordinator}
        onStudentMonitoringOpen={() => setStudentMonitoringOpen(true)}
      />

      <main
        className="teacher-main-content"
        style={{
          flex: 1,
          padding: "40px",
          overflowY: "auto",
          background: "var(--ss-page-bg)",
        }}
      >
        <PortalHeader
          title="Teacher Portal"
          firstName={teacherFirstName}
          showWelcome={showWelcome}
          unreadMessageCount={unreadMessageCount}
          onMenuOpen={() => setMenuOpen(true)}
        />

        <Suspense fallback={null}>
          <TeacherOutstandingTaskCards />
          <TeacherStudentMonitoringTasks
            openRequested={studentMonitoringOpen}
            onOpenRequestHandled={() => setStudentMonitoringOpen(false)}
          />
        </Suspense>

        <div className="teacher-main-content-body">
          {typeof children === "function"
            ? children(unreadMessageCount)
            : children}
        </div>
      </main>
      <TeacherClassProgressReminder />
    </div>
  );
}
