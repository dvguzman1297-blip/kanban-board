"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { setBoardAutoArchive } from "@/app/board-settings-actions";

const OPTIONS: [string, string][] = [["", "Never"], ["7", "After 7 days"], ["30", "After 30 days"]];

export function BoardSettings({ boardId, days }: { boardId: string; days: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Keep a value that is not one of the presets (set elsewhere) selectable.
  const [value, setValue] = useState(days === null ? "" : String(days));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const change = (next: string) => {
    const previous = value;
    setValue(next);
    setMessage(null);
    start(async () => {
      const res = await setBoardAutoArchive(boardId, next ? Number(next) : null);
      if (!res.ok) { setValue(previous); return setMessage({ ok: false, text: res.error }); }
      setMessage({ ok: true, text: res.archived ? `Archived ${res.archived} card${res.archived === 1 ? "" : "s"}.` : "Saved." });
      router.refresh();
    });
  };

  const known = OPTIONS.some(([v]) => v === value);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} title="Board settings" aria-label="Board settings"
        className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-sm text-zinc-300 hover:border-zinc-700">
        <Settings2 className="h-4 w-4" />
      </button>
      {open && (
        <div role="dialog" aria-label="Board settings" className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-xl">
          <label htmlFor="auto-archive" className="mb-1.5 block text-xs font-medium text-zinc-300">Auto-archive completed cards</label>
          <select id="auto-archive" value={value} disabled={pending} onChange={(e) => change(e.target.value)}
            className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm outline-none focus:border-indigo-500">
            {!known && <option value={value}>After {value} days</option>}
            {OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <p className="mt-2 text-xs text-zinc-500">Cards that have been in Done longer than this are archived when the board is opened. Archived cards stay available under “Archived”.</p>
          {message && <p role={message.ok ? "status" : "alert"} className={`mt-2 text-xs ${message.ok ? "text-emerald-300" : "text-rose-400"}`}>{message.text}</p>}
        </div>
      )}
    </div>
  );
}
