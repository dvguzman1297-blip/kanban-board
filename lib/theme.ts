export type ThemePref = "system" | "dark" | "light";

export const isThemePref = (v: unknown): v is ThemePref => v === "system" || v === "dark" || v === "light";

export function readStoredTheme(): ThemePref | null {
  try {
    const v = localStorage.getItem("theme");
    return isThemePref(v) ? v : null;
  } catch { return null; }
}

/** Applies a preference to <html> ("light" class = light mode; dark is the default). */
export function applyTheme(pref: ThemePref, persist = false) {
  const light = pref === "light" || (pref === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("light", light);
  if (persist) { try { localStorage.setItem("theme", pref); } catch {} }
}
