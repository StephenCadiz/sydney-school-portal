"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useMessageRealtimeRefresh } from "../../hooks/useMessageRealtimeRefresh";
import { getAdminUnreadTeacherMessageCount } from "../../../lib/messages";
import { supabase } from "../../../lib/supabase";

type AdminNavIconName =
  | "home"
  | "book"
  | "clipboard"
  | "printer"
  | "users"
  | "userPlus"
  | "calendar"
  | "school"
  | "graduation"
  | "fileUser"
  | "clipboardCheck"
  | "calendarCheck"
  | "clock"
  | "folder"
  | "envelope"
  | "megaphone";

function AdminNavIcon({
  name,
  size = 19,
}: {
  name: AdminNavIconName;
  size?: number;
}) {
  const commonProps = {
    "aria-hidden": true,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { flexShrink: 0 },
  };

  switch (name) {
    case "home":
      return (
        <svg {...commonProps}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    case "book":
      return (
        <svg {...commonProps}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...commonProps}>
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
      );
    case "printer":
      return (
        <svg {...commonProps}>
          <path d="M6 9V2h12v7" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <path d="M6 14h12v8H6z" />
        </svg>
      );
    case "users":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "userPlus":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6" />
          <path d="M22 11h-6" />
        </svg>
      );
    case "calendar":
    case "calendarCheck":
      return (
        <svg {...commonProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
          {name === "calendarCheck" && <path d="m9 16 2 2 4-5" />}
        </svg>
      );
    case "school":
      return (
        <svg {...commonProps}>
          <path d="M3 21h18" />
          <path d="M5 21V8l7-5 7 5v13" />
          <path d="M9 21v-7h6v7" />
        </svg>
      );
    case "graduation":
      return (
        <svg {...commonProps}>
          <path d="m22 10-10-5-10 5 10 5 10-5Z" />
          <path d="M6 12v5c3 2 9 2 12 0v-5" />
          <path d="M22 10v6" />
        </svg>
      );
    case "fileUser":
      return (
        <svg {...commonProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <circle cx="11" cy="13" r="2" />
          <path d="M8 19a3 3 0 0 1 6 0" />
        </svg>
      );
    case "clipboardCheck":
      return (
        <svg {...commonProps}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "clock":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "folder":
      return (
        <svg {...commonProps}>
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
      );
    case "envelope":
      return (
        <svg {...commonProps}>
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
    case "megaphone":
      return (
        <svg {...commonProps}>
          <path d="m3 11 18-5v12L3 13v-2Z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      );
    default:
      return null;
  }
}

function EnvelopeIcon({ size = 18 }: { size?: number }) {
  return (
    <AdminNavIcon name="envelope" size={size} />
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
      icon: "home" as AdminNavIconName,
    },
    {
      name: "Homework",
      href: "/admin/homework",
      icon: "book" as AdminNavIconName,
    },
    {
      name: "Class Exams",
      href: "/admin/class-exams",
      icon: "clipboard" as AdminNavIconName,
    },
    {
      name: "Print Class Exams",
      href: "/admin/print-class-exams",
      icon: "printer" as AdminNavIconName,
    },
    {
      name: "Teachers",
      href: "/admin/teachers",
      icon: "users" as AdminNavIconName,
    },
    {
      name: "Add Users",
      href: "/admin/add-users",
      icon: "userPlus" as AdminNavIconName,
    },
    {
      name: "Teacher Calendar",
      href: "/admin/teacher-calendar",
      icon: "calendar" as AdminNavIconName,
    },
    {
      name: "Classes",
      href: "/admin/classes",
      icon: "school" as AdminNavIconName,
    },
    {
      name: "Students",
      href: "/admin/students",
      icon: "graduation" as AdminNavIconName,
    },
    {
      name: "Student Information",
      href: "/admin/student-information",
      icon: "fileUser" as AdminNavIconName,
    },
    {
      name: "Follow Ups",
      href: "/admin/follow-ups",
      icon: "clipboardCheck" as AdminNavIconName,
    },
    {
      name: "Friday Tutorials",
      href: "/admin/friday-tutorials",
      icon: "calendarCheck" as AdminNavIconName,
    },
    {
      name: "Friday @ 6",
      href: "/admin/friday-exam-practice",
      icon: "clock" as AdminNavIconName,
    },
    {
      name: "Resources",
      href: "/admin/resources",
      icon: "folder" as AdminNavIconName,
    },
    {
      name: "Messages",
      href: "/admin/messages",
      icon: "envelope" as AdminNavIconName,
    },
    {
      name: "Announcements",
      href: "/admin/announcements",
      icon: "megaphone" as AdminNavIconName,
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
          padding: "24px 20px 30px",
        }}
      >
        {menuItems.map((item) => {
          const isMessagesItem = item.href === "/admin/messages";

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={isMessagesItem ? unreadAccessibleLabel : item.name}
              className="ss-sidebar-link admin-sidebar-link"
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
                className="admin-sidebar-link-main"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "10px",
                  minWidth: 0,
                }}
              >
                <span className="admin-nav-icon">
                  <AdminNavIcon name={item.icon} />
                </span>
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
            className="admin-dashboard-message-alert"
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
              className="admin-dashboard-message-alert-link"
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
