"use client";
import { useEffect } from "react";

export function ThemeInitializer() {
  useEffect(() => {
    try {
      document.documentElement.classList.toggle("light", localStorage.getItem("theme") === "light");
    } catch {}
  }, []);

  return null;
}
