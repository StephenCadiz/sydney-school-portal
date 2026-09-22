"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useMessageRealtimeRefresh } from "../../hooks/useMessageRealtimeRefresh";
import { useStaffMessageNotifications } from "../../hooks/useStaffMessageNotifications";
import { getAdminOutstandingMessageCount } from "../../../lib/messages";
import { supabase } from "../../../lib/supabase";
import LogoutButton from "../auth/LogoutButton";
import TeacherLiveClock from "./TeacherLiveClock";

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
  | "attendance"
  | "megaphone";

export type AdminMonitoringSummary = {
  feedbackCount: number;
  overdueCount: number;
  feedback: Array<{
    id: string;
    student_name: string;
    class_name: string;
    level_name: string;
    teacher_name: string;
    submitted_at: string | null;
  }>;
};

type AdminNavItem = {
  name: string;
  href: string;
  icon: AdminNavIconName;
  section?: string;
};

type AdminNavGroup = {
  key: string;
  label: string;
  icon: AdminNavIconName;
  items: AdminNavItem[];
};

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
    case "attendance":
      return (
        <svg {...commonProps}>
          <path d="M9 11l2 2 4-4" />
          <path d="M9 17h6" />
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 3V2h6v1" />
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

function getDisplayDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

const ADMIN_NAV_CLOSE_AFTER_NAVIGATION_KEY = "admin-nav-close-after-navigation";

export default function AdminLayout({
  children,
}: {
  children:
    | React.ReactNode
    | ((unreadMessageCount: number, attendanceAlertCount: number, monitoringSummary: AdminMonitoringSummary) => React.ReactNode);
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [adminName, setAdminName] = useState({ firstName: "", fullName: "" });
  const [outstandingAdminMessages, setOutstandingAdminMessages] = useState(0);
  const [attendanceAlertCount, setAttendanceAlertCount] = useState(0);
  const [monitoringSummary, setMonitoringSummary] = useState<AdminMonitoringSummary>({ feedbackCount: 0, overdueCount: 0, feedback: [] });
  const [openNavGroup, setOpenNavGroup] = useState("dashboard");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [navigationMounted, setNavigationMounted] = useState(false);
  const [flyoutPosition, setFlyoutPosition] = useState({ top: 0, left: 0 });
  const adminNavRef = useRef<HTMLElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const groupButtonRefs = useRef<Record<string, HTMLElement | null>>({});
  const previousPathnameRef = useRef<string | null>(null);
  const openGroupRef = useRef("dashboard");
  const suppressPathExpansionRef = useRef(false);
  const mountedRef = useRef(false);
  const outstandingCountErrorLoggedRef = useRef(false);
  const attendanceCountErrorLoggedRef = useRef(false);
  const monitoringCountErrorLoggedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    async function loadAdmin() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) return;

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role, first_name, last_name")
          .eq("id", session.user.id)
          .single();

        if (!error && profile?.role === "admin" && mountedRef.current) {
          setAdminId(session.user.id);
          const firstName = String(profile.first_name || "").trim();
          const fullName = `${firstName} ${String(profile.last_name || "").trim()}`.trim();
          setAdminName({
            firstName,
            fullName: fullName || firstName,
          });
        }
      } catch {
        // The layout remains usable if notification initialization fails.
      }
    }

    void loadAdmin();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadOutstandingMessageCount = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        if (mountedRef.current) {
          setOutstandingAdminMessages(0);
        }
        return;
      }

      const count = await getAdminOutstandingMessageCount(session.user.id);
      outstandingCountErrorLoggedRef.current = false;

      if (mountedRef.current) {
        setOutstandingAdminMessages(count);
      }
    } catch (error) {
      if (!outstandingCountErrorLoggedRef.current) {
        outstandingCountErrorLoggedRef.current = true;
        console.error("Unable to load Admin messages requiring attention:", error);
      }
    }
  }, []);

  const loadAttendanceAlertCount = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (mountedRef.current) setAttendanceAlertCount(0);
        return;
      }

      const response = await fetch("/api/admin/attendance?view=count", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load attendance alerts.");
      }

      attendanceCountErrorLoggedRef.current = false;
      if (mountedRef.current) {
        setAttendanceAlertCount(Math.max(0, Number(payload.count) || 0));
      }
    } catch (error) {
      if (!attendanceCountErrorLoggedRef.current) {
        attendanceCountErrorLoggedRef.current = true;
        console.error("Unable to load Admin attendance alert count:", error);
      }
    }
  }, []);

  const loadMonitoringSummary = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (mountedRef.current) setMonitoringSummary({ feedbackCount: 0, overdueCount: 0, feedback: [] });
        return;
      }
      const response = await fetch("/api/admin/student-monitoring?summary=1", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load monitoring alerts.");
      monitoringCountErrorLoggedRef.current = false;
      if (mountedRef.current) {
        setMonitoringSummary({
          feedbackCount: Math.max(0, Number(payload.feedbackCount) || 0),
          overdueCount: Math.max(0, Number(payload.overdueCount) || 0),
          feedback: Array.isArray(payload.feedback) ? payload.feedback : [],
        });
      }
    } catch (error) {
      if (!monitoringCountErrorLoggedRef.current) {
        monitoringCountErrorLoggedRef.current = true;
        console.error("Unable to load Admin Student Monitoring alerts:", error);
      }
    }
  }, []);

  useEffect(() => {
    if (!adminId) return;

    const refresh = () => void loadAttendanceAlertCount();
    refresh();
    const intervalId = window.setInterval(refresh, 60000);
    window.addEventListener("admin-attendance-alerts-changed", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("admin-attendance-alerts-changed", refresh);
    };
  }, [adminId, loadAttendanceAlertCount]);

  useEffect(() => {
    if (!adminId) return;
    const refresh = () => void loadMonitoringSummary();
    refresh();
    const intervalId = window.setInterval(refresh, 60000);
    window.addEventListener("admin-student-monitoring-changed", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("admin-student-monitoring-changed", refresh);
    };
  }, [adminId, loadMonitoringSummary]);

  useMessageRealtimeRefresh({
    onRefresh: loadOutstandingMessageCount,
    enabled: Boolean(adminId),
    intervalMs: 60000,
    customEventName: "admin-unread-messages-changed",
    channelName: "admin-layout-messages",
  });

  useStaffMessageNotifications({
    userId: adminId,
    role: "admin",
    enabled: Boolean(adminId),
    refreshEventName: "admin-unread-messages-changed",
  });

  const menuGroups: AdminNavGroup[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: "home",
      items: [
        {
          name: "Dashboard",
          href: "/admin",
          icon: "home",
        },
      ],
    },
    {
      key: "people-classes",
      label: "People & Classes",
      icon: "users",
      items: [
        { name: "Classes", href: "/admin/classes", icon: "school" },
        { name: "Academic Years", href: "/admin/academic-years", icon: "calendar" },
        { name: "Students", href: "/admin/students", icon: "graduation" },
        { name: "Teachers", href: "/admin/teachers", icon: "users" },
        { name: "Admin Staff", href: "/admin/admin-staff", icon: "users" },
        { name: "User Management", href: "/admin/add-users", icon: "userPlus" },
        { name: "School Roster", href: "/admin/school-roster", icon: "users" },
      ],
    },
    {
      key: "exams-assessment",
      label: "Exams & Assessment",
      icon: "clipboard",
      items: [
        { name: "Exam Bank", href: "/admin/exam-bank", icon: "clipboard", section: "Cambridge assessment" },
        { name: "Assigned Exams", href: "/admin/exam-bank/assignments", icon: "book", section: "Cambridge assessment" },
        { name: "Mock Results Review", href: "/admin/mock-results", icon: "clipboardCheck", section: "Results and planning" },
        { name: "Course Planning", href: "/admin/course-planning", icon: "calendarCheck", section: "Results and planning" },
        { name: "Class Exams", href: "/admin/class-exams", icon: "clipboard", section: "Young Learner exams" },
        { name: "Print Exams", href: "/admin/print-class-exams", icon: "printer", section: "Young Learner exams" },
      ],
    },
    {
      key: "calendar-scheduling",
      label: "Calendar & Scheduling",
      icon: "calendarCheck",
      items: [
        { name: "Staff Time Register", href: "/admin/staff-time", icon: "clock" },
        { name: "School Calendar", href: "/admin/school-calendar", icon: "calendarCheck" },
        { name: "Teacher Calendar", href: "/admin/teacher-calendar", icon: "calendar" },
        { name: "Friday Tutorials", href: "/admin/friday-tutorials", icon: "calendarCheck" },
        { name: "Friday @ 6", href: "/admin/friday-exam-practice", icon: "clock" },
      ],
    },
    {
      key: "student-support",
      label: "Student Support",
      icon: "attendance",
      items: [
        { name: "Attendance", href: "/admin/attendance", icon: "attendance" },
        { name: "Follow Ups", href: "/admin/follow-ups", icon: "clipboardCheck" },
        { name: "Student Monitoring", href: "/admin/student-monitoring", icon: "clipboardCheck" },
      ],
    },
    {
      key: "communication",
      label: "Communication",
      icon: "envelope",
      items: [
        { name: "Messages", href: "/admin/messages", icon: "envelope" },
        { name: "Announcements", href: "/admin/announcements", icon: "megaphone" },
      ],
    },
    {
      key: "teaching-resources",
      label: "Teaching Resources",
      icon: "folder",
      items: [
        { name: "Resources", href: "/admin/resources", icon: "folder" },
        { name: "Syllabuses", href: "/admin/syllabuses", icon: "book" },
      ],
    },
  ];

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    if (href === "/admin/students") {
      return (
        pathname.startsWith("/admin/students") ||
        pathname.startsWith("/admin/student-information")
      );
    }
    if (href === "/admin/exam-bank") {
      return (
        pathname.startsWith(href) &&
        !pathname.startsWith("/admin/exam-bank/assignments")
      );
    }
    return pathname.startsWith(href);
  };

  const closeNavGroup = useCallback(
    (restoreFocus = true) => {
      const closingGroup = openGroupRef.current;
      // Clear the ref as well as React state so a pathname refresh cannot
      // resurrect the fly-out after an explicit child selection.
      openGroupRef.current = "";
      setOpenNavGroup("");
      if (restoreFocus) {
        window.setTimeout(() => groupButtonRefs.current[closingGroup]?.focus(), 0);
      }
    },
    []
  );

  useEffect(() => {
    const activeGroup = menuGroups.find((group) =>
      group.items.some((item) => isActive(item.href))
    );
    const previousPathname = previousPathnameRef.current;
    let suppressInitialExpansion = false;

    try {
      const pendingClosePath = window.sessionStorage.getItem(
        ADMIN_NAV_CLOSE_AFTER_NAVIGATION_KEY
      );
      if (pendingClosePath) {
        window.sessionStorage.removeItem(ADMIN_NAV_CLOSE_AFTER_NAVIGATION_KEY);
        suppressInitialExpansion = pendingClosePath === pathname;
      }
    } catch {
      // Session storage may be unavailable in privacy-restricted browsers.
    }

    if (previousPathname === null) {
      const initialGroup = suppressInitialExpansion
        ? ""
        : activeGroup?.key || "dashboard";
      openGroupRef.current = initialGroup;
      setOpenNavGroup(initialGroup);
    } else if (previousPathname !== pathname) {
      if (suppressPathExpansionRef.current) {
        suppressPathExpansionRef.current = false;
        closeNavGroup(false);
      } else {
        const nextGroup = activeGroup?.key || "dashboard";
        openGroupRef.current = nextGroup;
        setOpenNavGroup(nextGroup);
      }
    }

    previousPathnameRef.current = pathname;
  }, [pathname, closeNavGroup]);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.matchMedia("(max-width: 700px)").matches);
    };

    updateViewport();
    setNavigationMounted(true);
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const updateFlyoutPosition = useCallback(() => {
    if (!openNavGroup || openNavGroup === "dashboard" || isMobileViewport) return;

    const button = groupButtonRefs.current[openNavGroup];
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const sidebar = adminNavRef.current?.closest<HTMLElement>(
      ".admin-sidebar-panel"
    );
    const sidebarRect = sidebar?.getBoundingClientRect();
    const panelHeight = flyoutRef.current?.getBoundingClientRect().height ?? 0;
    const maxTop = Math.max(12, window.innerHeight - panelHeight - 12);
    setFlyoutPosition({
      top: Math.max(12, Math.min(rect.top, maxTop)),
      left: (sidebarRect?.right ?? rect.right) + 12,
    });
  }, [isMobileViewport, openNavGroup]);

  useEffect(() => {
    if (!openNavGroup || openNavGroup === "dashboard" || isMobileViewport) return;

    updateFlyoutPosition();
    window.addEventListener("resize", updateFlyoutPosition);
    window.addEventListener("scroll", updateFlyoutPosition, true);
    return () => {
      window.removeEventListener("resize", updateFlyoutPosition);
      window.removeEventListener("scroll", updateFlyoutPosition, true);
    };
  }, [isMobileViewport, openNavGroup, updateFlyoutPosition]);

  useEffect(() => {
    if (!openNavGroup || openNavGroup === "dashboard") return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !adminNavRef.current?.contains(target) &&
        !flyoutRef.current?.contains(target)
      ) {
        closeNavGroup();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNavGroup();
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeNavGroup, openNavGroup]);

  useEffect(() => {
    if (!openNavGroup || openNavGroup === "dashboard") return;

    const isDesktop = window.matchMedia("(min-width: 701px)").matches;
    if (!isDesktop) return;

    window.requestAnimationFrame(() => {
      flyoutRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    });
  }, [openNavGroup]);

  const groupAttentionCount = (group: AdminNavGroup) => {
    if (group.key === "student-support") {
      return attendanceAlertCount + monitoringSummary.feedbackCount + monitoringSummary.overdueCount;
    }
    if (group.key === "communication") return outstandingAdminMessages;
    return 0;
  };

  const hasOutstandingAdminMessages = outstandingAdminMessages > 0;
  const outstandingAccessibleLabel = hasOutstandingAdminMessages
    ? `Messages, ${outstandingAdminMessages} requiring attention`
    : "Messages";
  const hasAttendanceAlerts = attendanceAlertCount > 0;
  const attendanceAccessibleLabel = hasAttendanceAlerts
    ? `Attendance, ${attendanceAlertCount} alert${attendanceAlertCount === 1 ? "" : "s"} requiring attention`
    : "Attendance";
  const identityLabel = adminName.fullName
    ? pathname === "/admin"
      ? `Welcome, ${adminName.firstName || adminName.fullName}`
      : `Logged in as ${adminName.fullName}`
    : "Admin";

  const openGroup =
    openNavGroup && openNavGroup !== "dashboard"
      ? menuGroups.find((group) => group.key === openNavGroup)
      : undefined;
  const renderGroupPanel = (group: AdminNavGroup, isFlyout: boolean) => {
    const panelId = `admin-nav-panel-${group.key}`;

    return (
      <div
        ref={flyoutRef}
        id={panelId}
        className={`admin-nav-group-panel${isFlyout ? " admin-nav-group-panel--flyout" : ""}`}
        role="menu"
        aria-label={`${group.label} menu`}
        style={
          isFlyout
            ? { left: `${flyoutPosition.left}px`, top: `${flyoutPosition.top}px` }
            : undefined
        }
      >
        {group.items.map((item, itemIndex) => {
          const isMessagesItem = item.href === "/admin/messages";
          const isAttendanceItem = item.href === "/admin/attendance";
          const previousItem = group.items[itemIndex - 1];
          const showSubheading =
            Boolean(item.section) && item.section !== previousItem?.section;

          return (
            <div key={item.href} className="admin-nav-child-wrap">
              {showSubheading && (
                <h3 className="admin-nav-child-heading">{item.section}</h3>
              )}
              <Link
                href={item.href}
                role="menuitem"
                aria-current={isActive(item.href) ? "page" : undefined}
                aria-label={
                  isMessagesItem
                    ? outstandingAccessibleLabel
                    : isAttendanceItem
                      ? attendanceAccessibleLabel
                      : item.name
                }
                className="ss-sidebar-link admin-sidebar-link"
                onClick={() => {
                  suppressPathExpansionRef.current = item.href !== pathname;
                  if (item.href !== pathname) {
                    try {
                      window.sessionStorage.setItem(
                        ADMIN_NAV_CLOSE_AFTER_NAVIGATION_KEY,
                        item.href
                      );
                    } catch {
                      // Session storage may be unavailable in privacy-restricted browsers.
                    }
                  }
                  closeNavGroup(false);
                  setMenuOpen(false);
                }}
              >
                <span className="admin-sidebar-link-main">
                  <span className="admin-nav-icon">
                    <AdminNavIcon name={item.icon} />
                  </span>
                  <span>{item.name}</span>
                </span>
                {isMessagesItem && <UnreadBadge count={outstandingAdminMessages} />}
                {isAttendanceItem && <UnreadBadge count={attendanceAlertCount} />}
                {item.name === "Student Monitoring" && (
                  <UnreadBadge count={monitoringSummary.feedbackCount} />
                )}
              </Link>
            </div>
          );
        })}
      </div>
    );
  };

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
          className="admin-mobile-topbar-actions"
          style={{
            alignItems: "center",
            display: "flex",
            gap: "10px",
          }}
        >
          <Link
            href="/admin/messages"
            className="admin-mobile-status-link"
            aria-label={outstandingAccessibleLabel}
            style={{
              alignItems: "center",
              background: hasOutstandingAdminMessages ? "#fff1f2" : "#ffffff",
              border: hasOutstandingAdminMessages
                ? "1px solid #fecdd3"
                : "1px solid var(--ss-border)",
              borderRadius: "10px",
              color: hasOutstandingAdminMessages ? "#991b1b" : "var(--ss-blue-dark)",
              display: "inline-flex",
              gap: "7px",
              minHeight: "42px",
              padding: "9px 10px",
              position: "relative",
              textDecoration: "none",
            }}
          >
            <EnvelopeIcon size={20} />
            <UnreadBadge count={outstandingAdminMessages} />
          </Link>

          <Link
            href="/admin/attendance"
            className="admin-mobile-status-link"
            aria-label={attendanceAccessibleLabel}
            style={{
              alignItems: "center",
              background: hasAttendanceAlerts ? "#fff1f2" : "#ffffff",
              border: hasAttendanceAlerts
                ? "1px solid #fecdd3"
                : "1px solid var(--ss-border)",
              borderRadius: "10px",
              color: hasAttendanceAlerts ? "#991b1b" : "var(--ss-blue-dark)",
              display: "inline-flex",
              gap: "7px",
              minHeight: "42px",
              padding: "9px 10px",
              textDecoration: "none",
            }}
          >
            <AdminNavIcon name="attendance" size={18} />
            <UnreadBadge count={attendanceAlertCount} />
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
          display: "flex",
          flexDirection: "column",
          padding: "24px 20px 30px",
        }}
      >
        <nav ref={adminNavRef} className="admin-sidebar-nav" aria-label="Admin navigation">
          {menuGroups.map((group) => {
            const isOpen = openNavGroup === group.key;
            const attentionCount = groupAttentionCount(group);
            const isDashboard = group.key === "dashboard";

            return (
              <section
                key={group.key}
                className={`admin-nav-group${isOpen && !isDashboard ? " is-open" : ""}`}
              >
                {isDashboard ? (
                  <Link
                    href="/admin"
                    ref={(element) => {
                      groupButtonRefs.current[group.key] = element;
                    }}
                    className="admin-nav-group-toggle admin-nav-dashboard-link"
                    aria-current={isActive("/admin") ? "page" : undefined}
                    onClick={() => {
                      suppressPathExpansionRef.current = pathname !== "/admin";
                      if (pathname !== "/admin") {
                        try {
                          window.sessionStorage.setItem(
                            ADMIN_NAV_CLOSE_AFTER_NAVIGATION_KEY,
                            "/admin"
                          );
                        } catch {
                          // Session storage may be unavailable in privacy-restricted browsers.
                        }
                      }
                      closeNavGroup(false);
                      setMenuOpen(false);
                    }}
                  >
                    <span className="admin-nav-group-label">
                      <span className="admin-nav-icon">
                        <AdminNavIcon name={group.icon} />
                      </span>
                      <span className="admin-nav-group-label-text">{group.label}</span>
                    </span>
                  </Link>
                ) : (
                  <>
                    <button
                      type="button"
                      className="admin-nav-group-toggle"
                      ref={(element) => {
                        groupButtonRefs.current[group.key] = element;
                      }}
                      aria-expanded={isOpen}
                      aria-haspopup="menu"
                      aria-controls={`admin-nav-panel-${group.key}`}
                      onClick={() => {
                        if (isOpen) {
                          closeNavGroup();
                          return;
                        }
                        openGroupRef.current = group.key;
                        setOpenNavGroup(group.key);
                      }}
                    >
                      <span
                        className={`admin-nav-group-label${
                          group.key === "communication"
                            ? " admin-nav-group-label--communication"
                            : ""
                        }`}
                      >
                        <span className="admin-nav-icon">
                          <AdminNavIcon name={group.icon} />
                        </span>
                        <span className="admin-nav-group-label-text">{group.label}</span>
                      </span>
                      <span className="admin-nav-group-controls">
                        <UnreadBadge count={attentionCount} />
                        <span className="admin-nav-group-chevron" aria-hidden="true">⌄</span>
                      </span>
                    </button>

                    {isOpen && isMobileViewport && renderGroupPanel(group, false)}
                  </>
                )}
              </section>
            );
          })}
        </nav>
        <div style={{ flex: 1 }} />
        <div className="admin-nav-logout-group">
          <LogoutButton
            className="admin-logout"
            onSuccess={() => setMenuOpen(false)}
          />
        </div>
      </aside>

      {navigationMounted && !isMobileViewport && openGroup
        ? createPortal(renderGroupPanel(openGroup, true), document.body)
        : null}

      {/* Main Content */}

      <main
        className="admin-main-content"
        style={{
          flex: 1,
          padding: "40px",
          background: "var(--ss-page-bg)",
        }}
      >
        <header className="admin-portal-header">
          <div className="admin-portal-header-brand">
            <Image
              className="admin-portal-header-logo"
              src="/LOGO and NAME.png"
              alt="Sydney School"
              width={220}
              height={81}
              style={{
                height: "auto",
                width: "auto",
              }}
              priority
            />
            <div className="admin-portal-header-title">
              <h1>Admin Portal</h1>
            </div>
          </div>
          <div className="admin-portal-header-identity" aria-live="polite">
            <strong>{identityLabel}</strong>
            <time>{getDisplayDate()}</time>
            <span>Your admin workspace</span>
          </div>
          <div className="admin-portal-header-status">
            <Link
              href="/admin/messages"
              className={`admin-dashboard-message-control ${
                hasOutstandingAdminMessages ? "has-unread" : ""
              }`}
              aria-label={outstandingAccessibleLabel}
            >
              <EnvelopeIcon size={24} />
              <span className="admin-dashboard-message-count" aria-hidden="true">
                {outstandingAdminMessages > 99 ? "99+" : outstandingAdminMessages}
              </span>
            </Link>
            <TeacherLiveClock showLabel={false} />
          </div>
        </header>
        <div className="admin-main-content-inner">
          {typeof children === "function"
            ? children(outstandingAdminMessages, attendanceAlertCount, monitoringSummary)
            : children}
        </div>
      </main>
    </div>
  );
}
