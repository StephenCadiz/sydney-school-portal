"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  FolderOpen,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

type StudentMenuProps = {
  mobileMode?: boolean;
  onClose?: () => void;
};

type StudentNavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

const items: StudentNavItem[] = [
  { name: "Dashboard", href: "/student", icon: LayoutDashboard },
  { name: "Homework", href: "/student/homework", icon: BookOpen },
  { name: "Messages", href: "/student/messages", icon: MessageSquare },
  { name: "Resources", href: "/student/resources", icon: FolderOpen },
  { name: "Announcements", href: "/student/announcements", icon: Megaphone },
  { name: "Progress", href: "/student/progress", icon: TrendingUp },
];

export default function StudentMenu({
  mobileMode = false,
  onClose,
}: StudentMenuProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/student" ? pathname === "/student" : pathname.startsWith(href);

  return (
    <nav
      className={`student-menu student-sidebar-nav ${
        mobileMode ? "student-menu-mobile" : "student-menu-desktop"
      }`}
      aria-label="Student portal navigation"
    >
      <div className="student-sidebar-brand">
        <span className="student-sidebar-brand-mark" aria-hidden="true">
          SS
        </span>
        <div>
          <strong>Sydney School</strong>
          <span>Student Portal</span>
        </div>
      </div>

      <div className="student-sidebar-divider" />

      <div className="student-sidebar-nav-label">Navigation</div>

      <div className="student-sidebar-link-list">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`student-menu-link student-sidebar-link ${
                active ? "is-active" : ""
              }`}
              onClick={onClose}
            >
              <span
                className="student-sidebar-active-indicator"
                aria-hidden="true"
              />
              <span className="student-sidebar-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={2} />
              </span>
              <span className="student-sidebar-link-text">{item.name}</span>
            </Link>
          );
        })}
      </div>

      <div className="student-sidebar-spacer" />

      <div className="student-sidebar-footer">
        <span>Student Portal</span>
        <strong>Sydney School</strong>
      </div>
    </nav>
  );
}
