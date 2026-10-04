"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { supabase } from "../../lib/supabase";
import { adminPathAllowed } from "../../lib/adminAccess";

export default function AdminRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
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
          .select("id, role")
          .eq("id", session.user.id)
          .single();

        if (
          profileError ||
          profile?.role !== "admin" ||
          !adminPathAllowed(profile?.id, pathname)
        ) {
          if (!profileError && profile?.role === "admin" && profile?.id) {
            router.replace("/admin");
          } else {
            redirectUnauthorized();
          }
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
  }, [pathname, router]);

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
