import { supabase } from "./supabase";

export type SelfPushCategory = "announcement" | "calendar" | "classwork";

export async function notifySelf(category: SelfPushCategory, eventKey: string, url: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !eventKey.trim()) return;
  await fetch("/api/push/self", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ category, eventKey: eventKey.slice(0, 180), url }),
  });
}
