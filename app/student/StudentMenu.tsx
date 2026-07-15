"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type StudentMenuProps = {
  mobileMode?: boolean;
  onClose?: () => void;
};

export default function StudentMenu({
  mobileMode = false,
  onClose,
}: StudentMenuProps) {
  const pathname = usePathname();

  const items = [
    { name: "Dashboard", href: "/student" },
    { name: "Homework", href: "/student/homework" },
    { name: "Messages", href: "/student/messages" },
    { name: "Resources", href: "/student/resources" },
    { name: "Announcements", href: "/student/announcements" },
    { name: "Progress", href: "/student/progress" },
    { name: "Mock Exams", href: "/student/mock-exams" },
    { name: "Profile", href: "/student/profile" },
  ];

  const isActive = (href: string) =>
    href === "/student" ? pathname === "/student" : pathname.startsWith(href);

  return (
    <div
      className={`student-menu ${mobileMode ? "student-menu-mobile" : "student-menu-desktop"}`}
      style={{
        width: "260px",
        background: "var(--ss-blue)",
        color: "white",
        padding: "24px 20px",
        minHeight: "100vh",
      }}
    >
      {items.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          className="ss-sidebar-link student-menu-link"
          onClick={onClose}
          style={{
            display: "block",
            padding: "14px 16px",
            marginBottom: "8px",
            borderRadius: "9px",
            textDecoration: "none",
            color: "white",
            background:
              isActive(item.href)
                ? "var(--ss-blue-hover)"
                : "rgba(255,255,255,0.09)",
            fontWeight: isActive(item.href) ? 700 : 500,
            transition: "0.2s",
          }}
        >
          {item.name}
        </Link>
      ))}
    </div>
  );
}
