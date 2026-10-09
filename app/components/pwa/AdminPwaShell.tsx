"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "../../../lib/supabase";
import PasskeyEnrollment from "./PasskeyEnrollment";

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

  const isChat = pathname === "/admin/chat";
  const displayName = fullName.trim() || "Admin staff";

  return (
    <div className={`admin-pwa-shell${isChat ? " is-admin-chat-pwa" : ""}`}>
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
        ) : (
          <section className="admin-pwa-landing" aria-labelledby="admin-pwa-title">
            <span className="admin-pwa-eyebrow">STAFF COMMUNICATION</span>
            <h1 id="admin-pwa-title">Stay connected with your team</h1>
            <p>Open Staff Chat to message authorised Teachers and Admin staff.</p>
            <Link className="admin-pwa-chat-entry" href="/admin/chat">
              <MessageCircle size={22} aria-hidden="true" />
              <span>Open Staff Chat</span>
            </Link>
            <PasskeyEnrollment />
          </section>
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
      </nav>
    </div>
  );
}
