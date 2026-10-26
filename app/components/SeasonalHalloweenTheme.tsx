"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { isHalloweenThemeActive } from "../../lib/seasonalTheme";

const themedRoutes = ["/login", "/teacher", "/admin", "/student"];

function shouldThemeRoute(pathname: string) {
  return themedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export default function SeasonalHalloweenTheme() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const active = isHalloweenThemeActive() && shouldThemeRoute(pathname);
      setActive(active);

      if (active) {
        root.dataset.seasonalTheme = "halloween";
      } else {
        delete root.dataset.seasonalTheme;
      }
    };
    const previousTheme = root.dataset.seasonalTheme;

    applyTheme();

    const nextLocalMidnight = new Date();
    nextLocalMidnight.setHours(24, 0, 0, 0);
    const midnightTimer = window.setTimeout(
      applyTheme,
      Math.max(1000, nextLocalMidnight.getTime() - Date.now() + 100)
    );

    return () => {
      window.clearTimeout(midnightTimer);
      if (previousTheme) {
        root.dataset.seasonalTheme = previousTheme;
      } else {
        delete root.dataset.seasonalTheme;
      }
    };
  }, [pathname]);

  if (!active) return null;

  return (
    <div className="seasonal-halloween-decoration" aria-hidden="true">
      <svg className="seasonal-halloween-vine seasonal-halloween-vine-top-left" viewBox="0 0 220 160" role="presentation">
        <path className="seasonal-halloween-vine-stem" d="M-10 27c45 2 61 29 84 41 33 18 59 16 94-10 14-11 29-19 54-18" />
        <path className="seasonal-halloween-vine-stem" d="M53 52c-10 18-12 35-4 55m69-31c-4 16-1 30 9 43m54-60c-3 16 2 27 13 37" />
        <path className="seasonal-halloween-vine-leaf" d="M36 47c-18-15-27-4-13 11 8 8 15 7 21 3m47 13c-17-15-27-3-14 12 8 8 16 7 22 1m53-13c-12-19-25-13-20 3 3 10 10 13 18 11" />
      </svg>
      <svg className="seasonal-halloween-vine seasonal-halloween-vine-bottom-right" viewBox="0 0 240 170" role="presentation">
        <path className="seasonal-halloween-vine-stem" d="M250 153c-43-4-63-31-87-53-29-27-56-37-98-22-22 8-41 8-71-5" />
        <path className="seasonal-halloween-vine-stem" d="M193 107c-9-17-9-31-2-46M135 75c-7-15-5-29 4-42M76 59c-4-13-1-25 9-35" />
        <path className="seasonal-halloween-vine-leaf" d="M168 91c18 4 22-10 8-17-10-5-17-1-20 6m-44-18c16 1 20-13 6-18-9-3-16 2-18 9m-48-11c14-3 16-16 1-18-9-1-14 5-14 12" />
      </svg>
      <div className="seasonal-halloween-pumpkin-art seasonal-halloween-pumpkin-top-left">
        <svg viewBox="0 0 120 120" role="presentation">
          <path className="seasonal-halloween-glow" d="M60 20c16-18 42-4 42 13 18 6 15 34 2 45-10 9-20 13-44 13S26 87 16 78C3 67 0 39 18 33c0-17 26-31 42-13Z" />
          <path className="seasonal-halloween-pumpkin" d="M60 29c14-13 37-3 36 13 16 3 16 27 4 37-10 8-21 12-40 12S30 87 20 79C8 69 8 45 24 42c-1-16 22-26 36-13Z" />
          <path className="seasonal-halloween-stem" d="M57 29c-2-8 1-14 8-18 6-3 10 1 7 6-3 5-7 8-6 13" />
          <path className="seasonal-halloween-face" d="m35 57 12 5-11 7m49-12-12 5 11 7M40 76c11 8 29 8 40 0" />
          <path className="seasonal-halloween-ridge" d="M60 36c-7 13-7 34 0 49m0-49c7 13 7 34 0 49M37 41c-7 14-5 31 4 43m42-43c7 14 5 31-4 43" />
        </svg>
      </div>
      <div className="seasonal-halloween-pumpkin-art seasonal-halloween-pumpkin-top-right seasonal-halloween-pumpkin-small">
        <svg viewBox="0 0 120 120" role="presentation">
          <path className="seasonal-halloween-glow" d="M60 20c16-18 42-4 42 13 18 6 15 34 2 45-10 9-20 13-44 13S26 87 16 78C3 67 0 39 18 33c0-17 26-31 42-13Z" />
          <path className="seasonal-halloween-pumpkin" d="M60 29c14-13 37-3 36 13 16 3 16 27 4 37-10 8-21 12-40 12S30 87 20 79C8 69 8 45 24 42c-1-16 22-26 36-13Z" />
          <path className="seasonal-halloween-stem" d="M57 29c-2-8 1-14 8-18 6-3 10 1 7 6-3 5-7 8-6 13" />
          <path className="seasonal-halloween-face" d="m35 57 12 5-11 7m49-12-12 5 11 7M40 76c11 8 29 8 40 0" />
          <path className="seasonal-halloween-ridge" d="M60 36c-7 13-7 34 0 49m0-49c7 13 7 34 0 49M37 41c-7 14-5 31 4 43m42-43c7 14 5 31-4 43" />
        </svg>
      </div>
      <div className="seasonal-halloween-pumpkin-art seasonal-halloween-pumpkin-bottom-right seasonal-halloween-pumpkin-tiny">
        <svg viewBox="0 0 120 120" role="presentation">
          <path className="seasonal-halloween-glow" d="M60 20c16-18 42-4 42 13 18 6 15 34 2 45-10 9-20 13-44 13S26 87 16 78C3 67 0 39 18 33c0-17 26-31 42-13Z" />
          <path className="seasonal-halloween-pumpkin" d="M60 29c14-13 37-3 36 13 16 3 16 27 4 37-10 8-21 12-40 12S30 87 20 79C8 69 8 45 24 42c-1-16 22-26 36-13Z" />
          <path className="seasonal-halloween-stem" d="M57 29c-2-8 1-14 8-18 6-3 10 1 7 6-3 5-7 8-6 13" />
          <path className="seasonal-halloween-face" d="m35 57 12 5-11 7m49-12-12 5 11 7M40 76c11 8 29 8 40 0" />
          <path className="seasonal-halloween-ridge" d="M60 36c-7 13-7 34 0 49m0-49c7 13 7 34 0 49M37 41c-7 14-5 31 4 43m42-43c7 14 5 31-4 43" />
        </svg>
      </div>
    </div>
  );
}
