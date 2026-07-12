"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open admin menu"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
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

        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="ss-sidebar-link"
            onClick={() => setMenuOpen(false)}
            style={{
              display: "block",
              color: "#ffffff",
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
            {item.icon} {item.name}
          </Link>
        ))}
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
        {children}
      </main>
    </div>
  );
}
