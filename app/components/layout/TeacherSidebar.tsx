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
}

export default function TeacherSidebar({
  isMobileOpen = false,
  onClose,
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
        padding: "30px 20px",
      }}
    >
      <h2
        style={{
          marginBottom: "40px",
          textAlign: "center",
        }}
      >
        Sydney School
      </h2>

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
}

function SidebarItem({
  href,
  icon,
  title,
  active = false,
  onClick,
}: ItemProps) {
  return (
    <Link
      href={href}
      className="ss-sidebar-link"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        color: "#fff",
        textDecoration: "none",
        padding: "12px",
        borderRadius: "8px",
        marginBottom: "6px",
        background: active ? "var(--ss-blue-hover)" : "rgba(255,255,255,0.08)",
        fontWeight: active ? 700 : 500,
      }}
    >
      {icon}
      {title}
    </Link>
  );
}
