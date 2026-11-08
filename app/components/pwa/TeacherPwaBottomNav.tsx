"use client";

import Link from "next/link";
import { Calendar, GraduationCap, Home, MessageCircle, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import usePwaUnreadCounts from "./usePwaUnreadCounts";

export default function TeacherPwaBottomNav() {
  const pathname = usePathname();
  const { counts } = usePwaUnreadCounts();
  const dashboardCount = counts.messages + counts.notifications;
  const badge = (value: number) => value > 99 ? "99+" : value;
  const items = [
    { href: "/teacher", label: "Dashboard", icon: Home },
    { href: "/teacher/my-classes", label: "My Classes", icon: GraduationCap },
    { href: "/teacher/calendar", label: "Calendar", icon: Calendar },
    { href: "/teacher/chat", label: "Messages", icon: MessageCircle },
    { href: "/teacher/settings", label: "Settings", icon: Settings },
  ];
  return <nav className="teacher-pwa-bottom-nav" aria-label="Teacher PWA navigation">{items.map(({ href, label, icon: Icon }) => {
    const active = href === "/teacher" ? pathname === href : pathname.startsWith(href);
    const value = href === "/teacher" ? dashboardCount : href === "/teacher/chat" ? counts.chat : 0;
    return <Link key={href} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} aria-label={value > 0 ? `${label}, ${value} unread` : label}>
      <span className="pwa-nav-icon-wrap"><Icon size={20} aria-hidden="true" />{value > 0 && <span className="pwa-unread-badge" aria-hidden="true">{badge(value)}</span>}</span>
      <span>{label}</span>
    </Link>;
  })}</nav>;
}
