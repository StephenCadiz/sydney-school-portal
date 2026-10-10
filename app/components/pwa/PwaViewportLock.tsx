"use client";

import { useEffect } from "react";

const PWA_VIEWPORT =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export default function PwaViewportLock() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    let viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const created = !viewport;
    const originalRootLock = root.getAttribute("data-pwa-viewport-locked");
    const originalBodyLock = body.getAttribute("data-pwa-viewport-locked");

    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.name = "viewport";
      document.head.appendChild(viewport);
    }

    const originalContent = viewport.getAttribute("content");
    const restoreAttribute = (element: HTMLElement, original: string | null) => {
      if (original === null) {
        element.removeAttribute("data-pwa-viewport-locked");
      } else {
        element.setAttribute("data-pwa-viewport-locked", original);
      }
    };

    const updateViewport = () => {
      if (isStandalonePwa()) {
        viewport?.setAttribute("content", PWA_VIEWPORT);
        root.setAttribute("data-pwa-viewport-locked", "true");
        body.setAttribute("data-pwa-viewport-locked", "true");
      } else {
        if (originalContent) {
          viewport?.setAttribute("content", originalContent);
        } else if (created) {
          viewport?.remove();
        }
        restoreAttribute(root, originalRootLock);
        restoreAttribute(body, originalBodyLock);
      }
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      if (originalContent) {
        viewport?.setAttribute("content", originalContent);
      } else if (created) {
        viewport?.remove();
      }
      restoreAttribute(root, originalRootLock);
      restoreAttribute(body, originalBodyLock);
    };
  }, []);

  return null;
}
