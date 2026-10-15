"use client";
import { useEffect, useRef, useState } from "react";
import { ListFilter } from "lucide-react";

const select = "fd-select h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm capitalize outline-none focus:border-indigo-500";

/** One "Filters" button instead of a row of dropdowns; shows how many filters are active. */
export function FiltersMenu({ priority, energy, onPriority, onEnergy }: {
  priority: string; energy: string; onPriority: (v: string) => void; onEnergy: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = Number(priority !== "all") + Number(energy !== "all");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm ${active ? "border-indigo-500 bg-indigo-500/15 text-indigo-200" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"}`}>
        <ListFilter className="h-4 w-4" />Filters
        {active > 0 && <span className="rounded-full bg-indigo-500 px-1.5 text-[11px] font-medium leading-5 text-white">{active}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Filter cards" className="absolute left-0 top-11 z-40 w-64 space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
          <div>
            <label htmlFor="flt-priority" className="mb-1 block text-xs font-medium text-zinc-400">Priority</label>
            <select id="flt-priority" value={priority} onChange={(e) => onPriority(e.target.value)} className={select}>
              <option value="all">All priorities</option>
              {["low", "medium", "high", "urgent"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="flt-energy" className="mb-1 block text-xs font-medium text-zinc-400">Energy</label>
            <select id="flt-energy" value={energy} onChange={(e) => onEnergy(e.target.value)} className={select}>
              <option value="all">All energy levels</option>
              {["low", "medium", "high"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <button disabled={!active} onClick={() => { onPriority("all"); onEnergy("all"); }}
            className="w-full rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-40">Clear filters</button>
        </div>
      )}
    </div>
  );
}
