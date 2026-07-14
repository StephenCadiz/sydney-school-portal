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
      void runRefresh();
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
