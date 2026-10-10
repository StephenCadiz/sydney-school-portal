"use client";

import { useEffect, useState, type ReactNode } from "react";

import StudentPwaBottomNav from "../components/pwa/StudentPwaBottomNav";

function isStandalonePwa() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export default function StudentLayout({ children }: { children: ReactNode }) {
  const [installedPwa, setInstalledPwa] = useState(false);

  useEffect(() => {
    const updateInstalledState = () => setInstalledPwa(isStandalonePwa());
    updateInstalledState();
    window.addEventListener("resize", updateInstalledState);
    return () => window.removeEventListener("resize", updateInstalledState);
  }, []);

  return (
    <div className={`student-pwa-route-shell${installedPwa ? " is-installed-pwa" : ""}`}>
      {children}
      {installedPwa && <StudentPwaBottomNav />}
    </div>
  );
}
