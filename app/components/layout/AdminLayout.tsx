"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useMessageRealtimeRefresh } from "../../hooks/useMessageRealtimeRefresh";
import { getAdminUnreadTeacherMessageCount } from "../../../lib/messages";
import { supabase } from "../../../lib/supabase";

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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadTeacherMessages, setUnreadTeacherMessages] = useState(0);
  const mountedRef = useRef(false);
  const unreadCountErrorLoggedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadUnreadCount = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        if (mountedRef.current) {
          setUnreadTeacherMessages(0);
        }
        return;
      }

      const count = await getAdminUnreadTeacherMessageCount(session.user.id);
      unreadCountErrorLoggedRef.current = false;

      if (mountedRef.current) {
        setUnreadTeacherMessages(count);
      }
    } catch (error) {
      if (!unreadCountErrorLoggedRef.current) {
        unreadCountErrorLoggedRef.current = true;
        console.error("Unable to load unread admin messages:", error);
      }
    }
  }, []);

  useMessageRealtimeRefresh({
    onRefresh: loadUnreadCount,
    enabled: true,
    intervalMs: 60000,
    customEventName: "admin-unread-messages-changed",
    channelName: "admin-layout-messages",
  });

  const menuItems = [
    {
      name: "Dashboard",
      href: "/admin",
      icon: "🏠",
    },
    {
      name: "Homework",
      href: "/admin/homework",
      icon: "📚",
    },
    {
      name: "Class Exams",
      href: "/admin/class-exams",
      icon: "📝",
    },
    {
      name: "Print Class Exams",
      href: "/admin/print-class-exams",
      icon: "🖨️",
    },
    {
      name: "Teachers",
      href: "/admin/teachers",
      icon: "👨‍🏫",
    },
    {
      name: "Add Users",
      href: "/admin/add-users",
      icon: "👥",
    },
    {
      name: "Teacher Calendar",
      href: "/admin/teacher-calendar",
      icon: "🗓️",
    },
    {
      name: "Classes",
      href: "/admin/classes",
      icon: "🏫",
    },
    {
      name: "Students",
      href: "/admin/students",
      icon: "🎓",
    },
    {
      name: "Student Information",
      href: "/admin/student-information",
      icon: "📋",
    },
    {
      name: "Follow Ups",
      href: "/admin/follow-ups",
      icon: "📝",
    },
    {
      name: "Friday Tutorials",
      href: "/admin/friday-tutorials",
      icon: "📌",
    },
    {
      name: "Friday @ 6",
      href: "/admin/friday-exam-practice",
      icon: "🧪",
    },
    {
      name: "Resources",
      href: "/admin/resources",
      icon: "📂",
    },
    {
      name: "Messages",
      href: "/admin/messages",
      icon: "✉️",
    },
    {
      name: "Announcements",
      href: "/admin/announcements",
      icon: "📢",
    },
  ];

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const hasUnreadTeacherMessages = unreadTeacherMessages > 0;
  const unreadAccessibleLabel = hasUnreadTeacherMessages
    ? `Messages, ${unreadTeacherMessages} unread`
    : "Messages";
  const showDashboardMessageAlert =
    pathname === "/admin" && hasUnreadTeacherMessages;

  return (
    <div
      className="admin-layout-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--ss-page-bg)",
      }}
    >
      <div className="mobile-topbar">
        <div className="mobile-topbar-title">Sydney School / Admin</div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "10px",
          }}
        >
          <Link
            href="/admin/messages"
            aria-label={unreadAccessibleLabel}
            style={{
              alignItems: "center",
              background: hasUnreadTeacherMessages ? "#fff1f2" : "#ffffff",
              border: hasUnreadTeacherMessages
                ? "1px solid #fecdd3"
                : "1px solid var(--ss-border)",
              borderRadius: "10px",
              color: hasUnreadTeacherMessages ? "#991b1b" : "var(--ss-blue-dark)",
              display: "inline-flex",
              gap: "7px",
              minHeight: "42px",
              padding: "9px 10px",
              position: "relative",
              textDecoration: "none",
            }}
          >
            <EnvelopeIcon size={18} />
            <UnreadBadge count={unreadTeacherMessages} />
          </Link>

          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Open admin menu"
            onClick={() => setMenuOpen(true)}
          >
            Menu
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-label="Close admin menu"
        className={`mobile-sidebar-overlay ${menuOpen ? "is-open" : ""}`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Sidebar */}

      <aside
        className={`admin-sidebar-panel ${menuOpen ? "is-open" : ""}`}
        style={{
          width: "250px",
          background: "var(--ss-blue)",
          color: "#ffffff",
          padding: "30px 20px",
        }}
      >
        <Image
          src="/LOGO.png"
          alt="Sydney School"
          width={150}
          height={150}
          style={{
            display: "block",
            margin: "0 auto 35px",
          }}
        />

        {menuItems.map((item) => {
          const isMessagesItem = item.href === "/admin/messages";

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={isMessagesItem ? unreadAccessibleLabel : item.name}
              className="ss-sidebar-link"
              onClick={() => setMenuOpen(false)}
              style={{
                alignItems: "center",
                color: "#ffffff",
                display: "flex",
                gap: "10px",
                justifyContent: "space-between",
                textDecoration: "none",
                padding: "14px 16px",
                borderRadius: "8px",
                marginBottom: "10px",
                background: isActive(item.href)
                  ? "var(--ss-blue-hover)"
                  : "rgba(255,255,255,0.12)",
                fontWeight: isActive(item.href) ? 700 : 500,
              }}
            >
              <span
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "10px",
                  minWidth: 0,
                }}
              >
                {isMessagesItem ? (
                  <EnvelopeIcon size={18} />
                ) : (
                  <span aria-hidden="true">{item.icon}</span>
                )}
                <span>{item.name}</span>
              </span>
              {isMessagesItem && <UnreadBadge count={unreadTeacherMessages} />}
            </Link>
          );
        })}
      </aside>

      {/* Main Content */}

      <main
        className="admin-main-content"
        style={{
          flex: 1,
          padding: "40px",
          background: "var(--ss-page-bg)",
        }}
      >
        {showDashboardMessageAlert && (
          <section
            style={{
              alignItems: "center",
              background: "#ffffff",
              border: "1px solid #fecdd3",
              borderLeft: "5px solid #dc2626",
              borderRadius: "14px",
              boxShadow: "0 8px 22px rgba(31, 60, 136, 0.06)",
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
              justifyContent: "space-between",
              marginBottom: "22px",
              padding: "16px 18px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  alignItems: "center",
                  color: "var(--ss-blue-dark)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "9px",
                  fontSize: "18px",
                  fontWeight: 900,
                  marginBottom: "4px",
                }}
              >
                <EnvelopeIcon size={20} />
                {unreadTeacherMessages} unread staff message
                {unreadTeacherMessages === 1 ? "" : "s"}
              </div>
              <p
                style={{
                  color: "#5f6b7a",
                  fontSize: "14px",
                  lineHeight: 1.45,
                  margin: 0,
                }}
              >
                {unreadTeacherMessages === 1
                  ? "You have a new message from a teacher."
                  : "You have new messages from teachers."}
              </p>
            </div>

            <Link
              href="/admin/messages"
              style={{
                background: "var(--ss-blue)",
                borderRadius: "9px",
                color: "#ffffff",
                flexShrink: 0,
                fontSize: "14px",
                fontWeight: 800,
                padding: "10px 14px",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              View Messages
            </Link>
          </section>
        )}
        {children}
      </main>
    </div>
  );
}
