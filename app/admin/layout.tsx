"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { supabase } from "../../lib/supabase";

export default function AdminRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    let isMounted = true;

    function redirectUnauthorized() {
      if (isMounted) {
        router.replace("/login");
      }
    }

    async function checkAdminAccess() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          redirectUnauthorized();
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (profileError || profile?.role !== "admin") {
          redirectUnauthorized();
          return;
        }

        if (isMounted) {
          setIsAuthorized(true);
        }
      } catch {
        redirectUnauthorized();
      }
    }

    checkAdminAccess();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (!isAuthorized) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ss-page-bg, #f5f7fa)",
          color: "var(--ss-blue-dark, #1f3c88)",
          fontWeight: 700,
        }}
      >
        Checking access...
      </div>
    );
  }

  return <>{children}</>;
}
