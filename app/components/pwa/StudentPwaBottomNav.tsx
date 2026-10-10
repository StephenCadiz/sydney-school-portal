"use client";

import Link from "next/link";
import { BookOpen, FolderOpen, Home, TrendingUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

const items = [
  { href: "/student", label: "Dashboard", icon: Home },
  { href: "/student/homework", label: "Homework", icon: BookOpen },
  { href: "/student/resources", label: "Resources", icon: FolderOpen },
  { href: "/student/progress", label: "Progress", icon: TrendingUp },
];

export default function StudentPwaBottomNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const viewport = window.visualViewport;
    const updateKeyboardState = () => {
      const heightDifference = window.innerHeight - (viewport?.height || window.innerHeight);
      // Pinch/viewport resizing also changes visualViewport.height. Only treat
      // a large height loss at the normal scale as the on-screen keyboard.
      const isNormalScale = !viewport || viewport.scale <= 1.05;
      setKeyboardOpen(heightDifference > 120 && isNormalScale);
    };

    updateKeyboardState();
    viewport?.addEventListener("resize", updateKeyboardState);
    viewport?.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("resize", updateKeyboardState);
    return () => {
      viewport?.removeEventListener("resize", updateKeyboardState);
      viewport?.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("resize", updateKeyboardState);
    };
  }, []);

  if (!mounted || keyboardOpen) return null;

  return createPortal(
    <nav className="student-pwa-bottom-nav is-standalone" aria-label="Student PWA navigation">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/student"
          ? pathname === href
          : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={active ? "is-active" : ""}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>,
    document.body
  );
}
