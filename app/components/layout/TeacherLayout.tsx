"use client";

import Link from "next/link";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import TeacherSidebar from "./TeacherSidebar";
import PortalHeader from "./PortalHeader";
import { useMessageRealtimeRefresh } from "../../hooks/useMessageRealtimeRefresh";
import { getTeacherUnreadStaffMessageCount } from "../../../lib/messages";
import { supabase } from "../../../lib/supabase";

interface TeacherLayoutProps {
  children: ReactNode;
}

const TEACHER_MESSAGES_CHANGED_EVENT = "teacher-unread-messages-changed";

function EnvelopeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <span
      aria-hidden="true"
      style={{
        alignItems: "center",
        background: "#dc2626",
        border: "1px solid rgba(255,255,255,0.7)",
        borderRadius: "999px",
        color: "#ffffff",
        display: "inline-flex",
        fontSize: "11px",
        fontWeight: 900,
        justifyContent: "center",
        lineHeight: 1,
        minHeight: "22px",
        minWidth: "22px",
        padding: "4px 6px",
      }}
    >
      {label}
    </span>
  );
}

export default function TeacherLayout({
  children,
}: TeacherLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const mountedRef = useRef(false);
  const unreadCountErrorLoggedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    async function loadTeacher() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          if (mountedRef.current) {
            setTeacherId("");
            setUnreadMessageCount(0);
          }
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (error || profile?.role !== "teacher") {
          if (mountedRef.current) {
            setTeacherId("");
            setUnreadMessageCount(0);
          }
          return;
        }

        if (mountedRef.current) {
          setTeacherId(session.user.id);
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
      mountedRef.current = false;
    };
  }, []);

  const loadUnreadCount = useCallback(async () => {
    if (!teacherId) return;

    try {
      const count = await getTeacherUnreadStaffMessageCount(teacherId);
      unreadCountErrorLoggedRef.current = false;

      if (mountedRef.current) {
        setUnreadMessageCount(count);
      }
    } catch (error) {
      if (!unreadCountErrorLoggedRef.current) {
        unreadCountErrorLoggedRef.current = true;
        console.error("Unable to load unread teacher messages:", error);
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

  const unreadAccessibleLabel =
    unreadMessageCount > 0
      ? `Messages, ${unreadMessageCount} unread`
      : "Messages";

  return (
    <div
      className="teacher-layout-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--ss-page-bg)",
      }}
    >
      <div className="mobile-topbar">
        <div className="mobile-topbar-title">Sydney School / Teacher</div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "10px",
          }}
        >
          <Link
            href="/teacher/messages"
            aria-label={unreadAccessibleLabel}
            style={{
              alignItems: "center",
              background: unreadMessageCount > 0 ? "#fff1f2" : "#ffffff",
              border:
                unreadMessageCount > 0
                  ? "1px solid #fecdd3"
                  : "1px solid var(--ss-border)",
              borderRadius: "10px",
              color:
                unreadMessageCount > 0 ? "#991b1b" : "var(--ss-blue-dark)",
              display: "inline-flex",
              gap: "7px",
              minHeight: "42px",
              padding: "9px 10px",
              textDecoration: "none",
            }}
          >
            <EnvelopeIcon size={18} />
            <UnreadBadge count={unreadMessageCount} />
          </Link>

          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Open teacher menu"
            onClick={() => setMenuOpen(true)}
          >
            Menu
          </button>
        </div>
      </div>

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
        <PortalHeader title="Teacher Portal" />

        {children}
      </main>
    </div>
  );
}
