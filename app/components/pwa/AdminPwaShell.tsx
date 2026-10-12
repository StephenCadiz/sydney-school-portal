"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Settings, UserRound } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "../../../lib/supabase";
import AdminPwaDashboard from "./AdminPwaDashboard";
import AdminPwaSettings from "./AdminPwaSettings";
import AdminPwaStudentInformation from "./AdminPwaStudentInformation";
import PwaViewportLock from "./PwaViewportLock";

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
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (loading) return;
    let active = true;

    async function loadUnreadCount() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const response = await fetch("/api/chat/conversations", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.conversations)) return;
        const count = payload.conversations.reduce(
          (total: number, conversation: { unread_count?: unknown }) =>
            total + Math.max(0, Number(conversation.unread_count) || 0),
          0
        );
        if (active) setUnreadCount(count);
      } catch {
        // The chat page remains the source of truth if the badge cannot load.
      }
    }

    void loadUnreadCount();
    const intervalId = window.setInterval(loadUnreadCount, 60000);
    window.addEventListener("staff-chat-unread-changed", loadUnreadCount);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("staff-chat-unread-changed", loadUnreadCount);
    };
  }, [loading]);

  const pwaView = searchParams.get("tab") || "dashboard";
  const isChat = pathname === "/admin/chat";
  const isStudentInformation = pathname === "/admin" && pwaView === "student-information";
  const isSettings = pathname === "/admin" && pwaView === "settings";
  const isDashboard = pathname === "/admin" && !isStudentInformation && !isSettings;
  const displayName = fullName.trim() || "Admin staff";

  return (
    <div className={`admin-pwa-shell${isChat ? " is-admin-chat-pwa" : ""}`}>
      <PwaViewportLock />
      {!isChat && <header className="admin-pwa-header">
        <Image
          src="/LOGO and NAME.png"
          alt="Sydney School"
          width={190}
          height={70}
          priority
          className="admin-pwa-logo"
        />
        <div className="admin-pwa-identity" aria-live="polite">
          <span className="admin-pwa-eyebrow">ADMIN PORTAL</span>
          <strong>{loading ? "Loading your workspace…" : displayName}</strong>
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
