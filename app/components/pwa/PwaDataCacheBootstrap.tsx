"use client";

import { useEffect } from "react";

import { supabase } from "../../../lib/supabase";
import { clearPwaDataCache, installPwaDataCache, stopPwaDataCache } from "../../../lib/pwaDataCache";

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

/** Installs the private, account-scoped cache only inside an installed PWA. */
export default function PwaDataCacheBootstrap() {
  useEffect(() => {
    if (!isStandalonePwa()) return;

    let active = true;
    let accountId = "";

    const applyAccount = async (nextAccountId: string) => {
      if (!active || nextAccountId === accountId) return;
      const previousAccountId = accountId;
      accountId = nextAccountId;
      stopPwaDataCache();

      if (previousAccountId && previousAccountId !== nextAccountId) {
        await clearPwaDataCache(previousAccountId);
      }
      if (!active) return;

      if (nextAccountId) installPwaDataCache(nextAccountId);
    };

    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await applyAccount(session?.user?.id || "");
    };

    void loadSession();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        const previousAccountId = accountId;
        accountId = "";
        stopPwaDataCache();
        if (previousAccountId) void clearPwaDataCache(previousAccountId);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        void applyAccount(session?.user?.id || "");
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      const previousAccountId = accountId;
      stopPwaDataCache();
      if (previousAccountId) void clearPwaDataCache(previousAccountId);
    };
  }, []);

  return null;
}
