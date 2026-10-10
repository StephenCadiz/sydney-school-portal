"use client";

import Link from "next/link";
import { BookOpen, FolderOpen, Home, TrendingUp } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/student", label: "Dashboard", icon: Home },
  { href: "/student/homework", label: "Homework", icon: BookOpen },
  { href: "/student/resources", label: "Resources", icon: FolderOpen },
  { href: "/student/progress", label: "Progress", icon: TrendingUp },
];

export default function StudentPwaBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="student-pwa-bottom-nav" aria-label="Student PWA navigation">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/student"
          ? pathname === href
          : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={active ? "is-active" : ""}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
