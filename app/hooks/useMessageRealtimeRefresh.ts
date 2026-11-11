"use client";

import { useEffect, useRef } from "react";

import { supabase } from "../../lib/supabase";

type UseMessageRealtimeRefreshOptions = {
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
  intervalMs?: number;
  debounceMs?: number;
  customEventName?: string;
  channelName?: string;
};

type UseMessageRefreshEventsOptions = {
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
  intervalMs?: number;
  customEventName?: string;
};

let hookInstanceCounter = 0;

export function useMessageRealtimeRefresh({
  onRefresh,
  enabled = true,
  intervalMs = 60000,
  debounceMs = 250,
  customEventName,
  channelName = "message-refresh",
}: UseMessageRealtimeRefreshOptions) {
  const onRefreshRef = useRef(onRefresh);
  const instanceIdRef = useRef("");

  if (!instanceIdRef.current) {
    hookInstanceCounter += 1;
    instanceIdRef.current = `${Date.now()}-${hookInstanceCounter}`;
  }

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let refreshInFlight = false;
    let refreshPending = false;
    let refreshErrorReported = false;
    let debounceTimeout: number | null = null;
    const reportedRealtimeStatuses = new Set<string>();

    async function runRefresh() {
      if (cancelled) return;

      if (refreshInFlight) {
        refreshPending = true;
        return;
      }

      refreshInFlight = true;

      try {
        await onRefreshRef.current();
        refreshErrorReported = false;
      } catch (error) {
        if (!refreshErrorReported) {
          refreshErrorReported = true;
          console.error("Unable to refresh messages:", error);
        }
      } finally {
        refreshInFlight = false;

        if (refreshPending && !cancelled) {
          refreshPending = false;
          void runRefresh();
        }
      }
    }

    function scheduleRefresh() {
      if (debounceTimeout) {
        window.clearTimeout(debounceTimeout);
      }

      debounceTimeout = window.setTimeout(() => {
        debounceTimeout = null;
        void runRefresh();
      }, debounceMs);
    }

    void runRefresh();

    const intervalId = window.setInterval(() => {
      // Realtime events and focus still refresh promptly. The fallback timer
      // should not keep a hidden tab querying Supabase indefinitely.
      if (document.visibilityState !== "hidden") void runRefresh();
    }, intervalMs);

    const handleFocus = () => {
      void runRefresh();
    };
    const handleCustomEvent = () => {
      void runRefresh();
    };

    window.addEventListener("focus", handleFocus);

    if (customEventName) {
      window.addEventListener(customEventName, handleCustomEvent);
    }

    const channel = supabase
      .channel(`${channelName}-${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe((status) => {
        if (
          !cancelled &&
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
          !reportedRealtimeStatuses.has(status)
        ) {
          reportedRealtimeStatuses.add(status);
          console.warn(`Message Realtime channel status: ${status}`);
        }
      });

    return () => {
      cancelled = true;

      if (debounceTimeout) {
        window.clearTimeout(debounceTimeout);
      }

      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);

      if (customEventName) {
        window.removeEventListener(customEventName, handleCustomEvent);
      }

      void supabase.removeChannel(channel);
    };
  }, [enabled, intervalMs, debounceMs, customEventName, channelName]);
}

/**
 * Refresh message data from the shared staff-message event bus without
 * opening another Supabase Realtime channel. The layout owns the single
 * INSERT subscription used for notification sounds; pages and dashboard
 * cards only need to react to that event and refresh their own data.
 */
export function useMessageRefreshEvents({
  onRefresh,
  enabled = true,
  intervalMs = 180000,
  customEventName,
}: UseMessageRefreshEventsOptions) {
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let refreshInFlight = false;

    async function runRefresh() {
      if (cancelled || refreshInFlight) return;
      refreshInFlight = true;
      try {
        await onRefreshRef.current();
      } catch {
        // Individual message surfaces keep their existing error state/logging.
      } finally {
        refreshInFlight = false;
      }
    }

    const handleRefresh = () => {
      void runRefresh();
    };

    void runRefresh();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        void runRefresh();
      }
    }, intervalMs);

    window.addEventListener("focus", handleRefresh);
    if (customEventName) {
      window.addEventListener(customEventName, handleRefresh);
    }

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleRefresh);
      if (customEventName) {
        window.removeEventListener(customEventName, handleRefresh);
      }
    };
  }, [enabled, intervalMs, customEventName]);
}
