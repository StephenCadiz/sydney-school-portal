"use client";

import Link from "next/link";
import { Calendar, GraduationCap, Home, MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";

export default function TeacherPwaBottomNav() {
  const pathname = usePathname();
  const items = [
    { href: "/teacher", label: "Dashboard", icon: Home },
    { href: "/teacher/my-classes", label: "My Classes", icon: GraduationCap },
    { href: "/teacher/calendar", label: "Calendar", icon: Calendar },
    { href: "/teacher/chat", label: "Messages", icon: MessageCircle },
  ];
  return <nav className="teacher-pwa-bottom-nav" aria-label="Teacher PWA navigation">{items.map(({ href, label, icon: Icon }) => { const active = href === "/teacher" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon size={20} aria-hidden="true" /><span>{label}</span></Link>; })}</nav>;
}
