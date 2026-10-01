"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.classList.contains("light")), []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try { localStorage.setItem("theme", next ? "light" : "dark"); } catch {}
  };

  return (
    <button onClick={toggle} title={light ? "Switch to dark mode" : "Switch to light mode"}
      aria-label="Toggle theme" className="rounded p-1 hover:text-zinc-200">
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
