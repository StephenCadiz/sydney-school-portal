const HALLOWEEN_THEME_START = "2026-10-26";
const HALLOWEEN_THEME_END_EXCLUSIVE = "2026-10-31";

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The seasonal treatment is intentionally date bounded so it cannot remain
 * in the portal after the Halloween week ends.
 */
export function isHalloweenThemeActive(date = new Date()) {
  const key = localDateKey(date);
  return key >= HALLOWEEN_THEME_START && key < HALLOWEEN_THEME_END_EXCLUSIVE;
}

export { HALLOWEEN_THEME_START, HALLOWEEN_THEME_END_EXCLUSIVE };
