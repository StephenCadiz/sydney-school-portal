"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";

export type PwaUnreadCounts = {
  chat: number;
  messages: number;
  notifications: number;
  homework: number;
  total: number;
};

const EMPTY_COUNTS: PwaUnreadCounts = {
  chat: 0,
  messages: 0,
  notifications: 0,
  homework: 0,
  total: 0,
};

function normalizeCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function updateAppBadge(total: number) {
  if (typeof navigator === "undefined") return;
  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (value?: number) => Promise<void> | void;
    clearAppBadge?: () => Promise<void> | void;
  };
  try {
    if (total > 0 && typeof badgeNavigator.setAppBadge === "function") {
      void badgeNavigator.setAppBadge(total);
    } else if (total === 0 && typeof badgeNavigator.clearAppBadge === "function") {
      void badgeNavigator.clearAppBadge();
    }
  } catch {
    // App-icon badges are progressive enhancement and are not supported by
    // every browser/PWA host.
  }
}

export default function usePwaUnreadCounts(enabled = true) {
  const [counts, setCounts] = useState<PwaUnreadCounts>(EMPTY_COUNTS);

  useEffect(() => {
    let active = true;
    let refreshInFlight: Promise<void> | null = null;
    let lastRefreshAt = 0;

    const clear = () => {
      if (active) setCounts(EMPTY_COUNTS);
      updateAppBadge(0);
    };

    const refresh = async () => {
      if (!enabled) {
        clear();
        return;
      }

      // Unread badges are event-driven while the app is visible. Hidden PWAs
      // should not wake Supabase every minute just to refresh a badge the user
      // cannot see; the push service remains responsible for background alerts.
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastRefreshAt < 5_000) return;
      if (refreshInFlight) return refreshInFlight;
      lastRefreshAt = now;

      refreshInFlight = (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            clear();
            return;
          }
          const response = await fetch("/api/pwa/unread-count", {
            cache: "no-store",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) return;
          const next: PwaUnreadCounts = {
            chat: normalizeCount(payload.chat),
            messages: normalizeCount(payload.messages),
            notifications: normalizeCount(payload.notifications),
            homework: normalizeCount(payload.homework),
            total: normalizeCount(payload.total),
          };
          // Protect against an incomplete server response and keep the app
          // badge mathematically consistent with the visible counters.
          next.total = next.chat + next.messages + next.notifications + next.homework;
          if (!active) return;
          setCounts(next);
          updateAppBadge(next.total);
        } catch {
          // Keep the last known count while offline; the next focus/event/interval
          // refresh will retry without interrupting the PWA experience.
        } finally {
          refreshInFlight = null;
        }
      })();

      return refreshInFlight;
    };

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 180000);
    const events = [
      "staff-chat-unread-changed",
      "teacher-unread-messages-changed",
      "admin-unread-messages-changed",
      "student-unread-messages-changed",
      "pwa-unread-changed",
    ];
    const onRefresh = () => void refresh();
    events.forEach((eventName) => window.addEventListener(eventName, onRefresh));
    window.addEventListener("focus", onRefresh);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onRefresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const { data: authListener } = supabase.auth.onAuthStateChange(() => void refresh());

    return () => {
      active = false;
      window.clearInterval(intervalId);
      events.forEach((eventName) => window.removeEventListener(eventName, onRefresh));
      window.removeEventListener("focus", onRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      authListener.subscription.unsubscribe();
    };
  }, [enabled]);

  return { counts };
}
