"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Conversation = {
  id: string;
  kind: "direct" | "group";
  display_name: string;
  unread_count: number;
  last_message?: { body?: string; created_at?: string } | null;
};

type Notice = {
  conversationId: string;
  displayName: string;
  preview: string;
  isGroup: boolean;
  href: string;
};

function preview(value?: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? `${text.slice(0, 160)}${text.length > 160 ? "…" : ""}` : "New message";
}

export default function DesktopStaffChatNotice() {
  const pathname = usePathname();
  const router = useRouter();
  const [installedPwa, setInstalledPwa] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const snapshotRef = useRef(new Map<string, number>());
  const readyRef = useRef(false);

  useEffect(() => {
    const update = () => setInstalledPwa(window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (installedPwa || pathname?.endsWith("/chat")) return;
    let cancelled = false;

    async function refresh() {
      if (!navigator.onLine) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      const response = await fetch("/api/chat/conversations", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }).catch(() => null);
      if (!response?.ok || cancelled) return;
      const payload = await response.json().catch(() => ({}));
      const conversations = (payload.conversations || []) as Conversation[];
      const previous = snapshotRef.current;
      if (readyRef.current) {
        const fresh = conversations
          .filter((conversation) => conversation.unread_count > (previous.get(conversation.id) || 0))
          .sort((left, right) => new Date(right.last_message?.created_at || 0).getTime() - new Date(left.last_message?.created_at || 0).getTime())[0];
        if (fresh) {
          const role = String(payload.viewer?.role || "teacher");
          setNotice({ conversationId: fresh.id, displayName: fresh.display_name, preview: preview(fresh.last_message?.body), isGroup: fresh.kind === "group", href: `${role === "admin" ? "/admin/chat" : "/teacher/chat"}?conversation=${encodeURIComponent(fresh.id)}` });
        }
      }
      snapshotRef.current = new Map(conversations.map((conversation) => [conversation.id, conversation.unread_count]));
      readyRef.current = true;
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => { cancelled = true; window.clearInterval(interval); snapshotRef.current.clear(); readyRef.current = false; };
  }, [installedPwa, pathname]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (installedPwa || pathname?.endsWith("/chat") || !notice) return null;

  return <aside className="staff-chat-desktop-notice" role="status" aria-live="polite"><button type="button" className="staff-chat-desktop-notice-content" onClick={() => { setNotice(null); router.push(notice.href); }}><strong>New chat message</strong><span>{notice.isGroup ? `Message in ${notice.displayName}` : notice.displayName}</span><small>{notice.preview}</small></button><button type="button" className="staff-chat-desktop-notice-close" aria-label="Dismiss chat notification" onClick={() => setNotice(null)}>×</button></aside>;
}
