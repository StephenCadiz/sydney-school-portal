"use client";

import Link from "next/link";
import { BookOpen, FolderOpen, Home, Settings, TrendingUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

const items = [
  { href: "/student", label: "Dashboard", icon: Home },
  { href: "/student/homework", label: "Homework", icon: BookOpen },
  { href: "/student/resources", label: "Resources", icon: FolderOpen },
  { href: "/student/progress", label: "Progress", icon: TrendingUp },
  { href: "/student/settings", label: "Settings", icon: Settings },
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
      // a large height loss while an editable control is focused as the
      // on-screen keyboard. Scrolling and dynamic viewport changes must never
      // hide the navigation bar.
      const isNormalScale = !viewport || viewport.scale <= 1.05;
      const activeElement = document.activeElement;
      const isEditable =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        activeElement?.getAttribute("contenteditable") === "true";
      setKeyboardOpen(heightDifference > 120 && isNormalScale && isEditable);
    };

    updateKeyboardState();
    viewport?.addEventListener("resize", updateKeyboardState);
    viewport?.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("resize", updateKeyboardState);
    document.addEventListener("focusin", updateKeyboardState);
    document.addEventListener("focusout", updateKeyboardState);
    return () => {
      viewport?.removeEventListener("resize", updateKeyboardState);
      viewport?.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("resize", updateKeyboardState);
      document.removeEventListener("focusin", updateKeyboardState);
      document.removeEventListener("focusout", updateKeyboardState);
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
