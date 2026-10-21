import { supabase } from "./supabase";

export async function getStaffChatUnreadCount() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Authentication required.");
  const response = await fetch("/api/chat/unread-count", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Unable to load unread chat count.");
  const count = Number(payload?.unread_count || 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}
