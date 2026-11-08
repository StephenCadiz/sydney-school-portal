"use client";

import Image from "next/image";
import Link from "next/link";
import { LayoutDashboard, MessageCircle, Settings, UserRound } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode } from "react";

import AdminPwaDashboard from "./AdminPwaDashboard";
import AdminPwaSettings from "./AdminPwaSettings";
import AdminPwaStudentInformation from "./AdminPwaStudentInformation";
import PwaViewportLock from "./PwaViewportLock";
import PwaDataCacheBootstrap from "./PwaDataCacheBootstrap";
import usePwaUnreadCounts from "./usePwaUnreadCounts";

type AdminPwaShellProps = {
  children?: ReactNode;
  fullName?: string;
  loading?: boolean;
};

export default function AdminPwaShell({
  children,
  fullName = "",
  loading = false,
}: AdminPwaShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { counts } = usePwaUnreadCounts(!loading);
  // Staff Chat continues to open at /api/chat/conversations; the shared badge
  // request uses cache: "no-store" so private conversation data is never cached.
  // The shared hook also listens for staff-chat-unread-changed updates.
  const unreadCount = counts.chat;
  const dashboardCount = counts.messages + counts.notifications;
  const badge = (value: number) => value > 99 ? "99+" : value;

  const pwaView = searchParams.get("tab") || "dashboard";
  const isChat = pathname === "/admin/chat";
  const isStudentInformation = pathname === "/admin" && pwaView === "student-information";
  const isSettings = pathname === "/admin" && pwaView === "settings";
  const isDashboard = pathname === "/admin" && !isStudentInformation && !isSettings;
  const displayName = fullName.trim() || "Admin staff";

  return (
    <div className={`admin-pwa-shell${isChat ? " is-admin-chat-pwa" : ""}`}>
      <PwaViewportLock />
      <PwaDataCacheBootstrap />
      {!isChat && <header className="admin-pwa-header">
        <Image
          src="/LOGO and NAME.png"
          alt="Sydney School"
          width={190}
          height={70}
          priority
          className="admin-pwa-logo"
        />
        <div className="admin-pwa-header-right">
          <div className="admin-pwa-identity" aria-live="polite">
            <span className="admin-pwa-eyebrow">ADMIN PORTAL</span>
            <strong>{loading ? "Loading your workspace…" : displayName}</strong>
          </div>
          <Link
            href="/admin/chat"
            className={`admin-pwa-chat-control${unreadCount > 0 ? " has-unread" : ""}`}
            aria-label={unreadCount > 0 ? `Chat, ${unreadCount} unread message${unreadCount === 1 ? "" : "s"}` : "Chat, no unread messages"}
          >
            <span className="admin-pwa-nav-icon-wrap">
              <MessageCircle size={22} aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="admin-pwa-unread-badge" aria-hidden="true">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </span>
          </Link>
        </div>
      </header>}

      <main className={`admin-pwa-main${isChat ? " admin-pwa-chat-main" : ""}`}>
        {loading ? (
          <section className="admin-pwa-status" role="status" aria-live="polite">
            Checking your Admin access…
          </section>
        ) : isChat ? (
          children
        ) : isStudentInformation ? (
          <AdminPwaStudentInformation />
        ) : isSettings ? (
          <AdminPwaSettings />
        ) : isDashboard ? (
          <AdminPwaDashboard />
        ) : (
          null
        )}
      </main>

      <nav className="admin-pwa-bottom-nav" aria-label="Admin PWA navigation">
        <Link
          href="/admin"
          className={isDashboard ? "is-active" : ""}
          aria-current={isDashboard ? "page" : undefined}
          aria-label={dashboardCount > 0 ? `Dashboard, ${dashboardCount} unread notifications` : "Dashboard"}
        >
          <span className="pwa-nav-icon-wrap">
            <LayoutDashboard size={22} aria-hidden="true" />
            {dashboardCount > 0 && <span className="pwa-unread-badge" aria-hidden="true">{badge(dashboardCount)}</span>}
          </span>
          <span>Dashboard</span>
        </Link>
        <Link
          href="/admin/chat"
          className={isChat ? "is-active" : ""}
          aria-current={isChat ? "page" : undefined}
          aria-label={unreadCount > 0 ? `Messages, ${unreadCount} unread` : "Messages"}
        >
          <span className="admin-pwa-nav-icon-wrap">
            <MessageCircle size={22} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="admin-pwa-unread-badge" aria-label={`${unreadCount} unread chat messages`}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </span>
          <span>Messages</span>
        </Link>
        <Link
          href="/admin?tab=student-information"
          className={isStudentInformation ? "is-active" : ""}
          aria-current={isStudentInformation ? "page" : undefined}
          aria-label="Student Information"
        >
          <UserRound size={22} aria-hidden="true" />
          <span>Student Information</span>
        </Link>
        <Link
          href="/admin?tab=settings"
          className={isSettings ? "is-active" : ""}
          aria-current={isSettings ? "page" : undefined}
          aria-label="Settings"
        >
          <Settings size={22} aria-hidden="true" />
          <span>Settings</span>
        </Link>
      </nav>
    </div>
  );
}
