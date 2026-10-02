"use client";
import { useEffect } from "react";
import { applyTheme, readStoredTheme, type ThemePref } from "@/lib/theme";

// `serverTheme` is the signed-in user's saved preference; this device's own choice wins when present.
export function ThemeInitializer({ serverTheme }: { serverTheme?: ThemePref }) {
  useEffect(() => {
    const pref = readStoredTheme() ?? serverTheme ?? "dark";
    applyTheme(pref);
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [serverTheme]);

  return null;
}
