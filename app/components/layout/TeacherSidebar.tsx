"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  GraduationCap,
  Calendar,
  BookOpen,
  ClipboardList,
  BarChart3,
  MessageSquare,
  Settings,
  LogOut,
} from "lucide-react";

interface TeacherSidebarProps {
  isMobileOpen?: boolean;
  onClose?: () => void;
  unreadMessageCount?: number;
}

export default function TeacherSidebar({
  isMobileOpen = false,
  onClose,
  unreadMessageCount = 0,
}: TeacherSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/teacher" ? pathname === "/teacher" : pathname.startsWith(href);

  return (
    <aside
      className={`teacher-sidebar-panel ${isMobileOpen ? "is-open" : ""}`}
      style={{
        width: "260px",
        background: "var(--ss-blue)",
        color: "#fff",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "24px 20px 30px",
      }}
    >
      <SidebarItem
        href="/teacher"
        icon={<Home size={20} />}
        title="Dashboard"
        active={isActive("/teacher")}
        onClick={onClose}
      />

      <SidebarItem
        href="/teacher/my-classes"
        icon={<GraduationCap size={20} />}
        title="My Classes"
        active={isActive("/teacher/my-classes")}
        onClick={onClose}
      />

      <SidebarItem
        href="/teacher/calendar"
        icon={<Calendar size={20} />}
        title="Calendar"
        active={isActive("/teacher/calendar")}
        onClick={onClose}
      />

      <SidebarItem
        href="/teacher/resources"
        icon={<BookOpen size={20} />}
        title="Resources"
        active={isActive("/teacher/resources")}
        onClick={onClose}
      />

      <SidebarItem
        href="/teacher/cambridge-exams"
        icon={<BookOpen size={20} />}
        title="Cambridge Exams"
        active={isActive("/teacher/cambridge-exams")}
        onClick={onClose}
      />

      <SidebarItem
        href="/teacher/homework"
        icon={<ClipboardList size={20} />}
        title="Homework"
        active={isActive("/teacher/homework")}
        onClick={onClose}
      />

      <SidebarItem
        href="/teacher/results"
        icon={<BarChart3 size={20} />}
        title="Results"
        active={isActive("/teacher/results")}
        onClick={onClose}
      />

      <SidebarItem
        href="/teacher/messages"
        icon={<MessageSquare size={20} />}
        title="Messages"
        active={isActive("/teacher/messages")}
        onClick={onClose}
        unreadCount={unreadMessageCount}
      />

      <SidebarItem
        href="/teacher/admin"
        icon={<Settings size={20} />}
        title="Admin Tasks"
        active={isActive("/teacher/admin")}
        onClick={onClose}
      />

      <div style={{ flex: 1 }} />

      <SidebarItem
        href="/logout"
        icon={<LogOut size={20} />}
        title="Logout"
        active={false}
        onClick={onClose}
      />
    </aside>
  );
}

interface ItemProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  onClick?: () => void;
  unreadCount?: number;
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

function SidebarItem({
  href,
  icon,
  title,
  active = false,
  onClick,
  unreadCount = 0,
}: ItemProps) {
  const ariaLabel =
    unreadCount > 0 ? `${title}, ${unreadCount} unread` : title;

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="ss-sidebar-link"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        justifyContent: "space-between",
        color: "#fff",
        textDecoration: "none",
        padding: "12px",
        borderRadius: "8px",
        marginBottom: "6px",
        background: active ? "var(--ss-blue-hover)" : "rgba(255,255,255,0.08)",
        fontWeight: active ? 700 : 500,
      }}
    >
      <span
        style={{
          alignItems: "center",
          display: "inline-flex",
          gap: "12px",
          minWidth: 0,
        }}
      >
        {icon}
        <span>{title}</span>
      </span>
      <UnreadBadge count={unreadCount} />
    </Link>
  );
}
