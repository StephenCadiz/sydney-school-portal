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
    let pinchListenersEnabled = false;

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

    const preventGestureZoom = (event: Event) => event.preventDefault();
    const preventMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };

    const updatePinchProtection = () => {
      const shouldProtect = isStandalonePwa();
      if (shouldProtect && !pinchListenersEnabled) {
        document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
        document.addEventListener("gesturechange", preventGestureZoom, { passive: false });
        document.addEventListener("gestureend", preventGestureZoom, { passive: false });
        document.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });
        pinchListenersEnabled = true;
      } else if (!shouldProtect && pinchListenersEnabled) {
        document.removeEventListener("gesturestart", preventGestureZoom);
        document.removeEventListener("gesturechange", preventGestureZoom);
        document.removeEventListener("gestureend", preventGestureZoom);
        document.removeEventListener("touchmove", preventMultiTouchZoom);
        pinchListenersEnabled = false;
      }
    };

    const updateViewport = () => {
      updatePinchProtection();
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
      if (pinchListenersEnabled) {
        document.removeEventListener("gesturestart", preventGestureZoom);
        document.removeEventListener("gesturechange", preventGestureZoom);
        document.removeEventListener("gestureend", preventGestureZoom);
        document.removeEventListener("touchmove", preventMultiTouchZoom);
      }
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
