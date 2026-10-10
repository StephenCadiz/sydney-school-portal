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
    let viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const created = !viewport;

    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.name = "viewport";
      document.head.appendChild(viewport);
    }

    const originalContent = viewport.getAttribute("content");
    const updateViewport = () => {
      if (isStandalonePwa()) {
        viewport?.setAttribute("content", PWA_VIEWPORT);
      } else if (originalContent) {
        viewport?.setAttribute("content", originalContent);
      } else if (created) {
        viewport?.remove();
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
    };
  }, []);

  return null;
}
