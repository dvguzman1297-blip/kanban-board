"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Settings2 } from "lucide-react";
import { TagPill, useTags } from "@/components/tags-context";

export function TagSelect({ value, onChange, onManage }: { value: string[]; onChange: (ids: string[]) => void; onManage?: () => void }) {
  const { tags } = useTags();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [open]);

  const selected = tags.filter((t) => value.includes(t.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="flex min-h-[2.5rem] w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-left text-sm focus:border-indigo-500">
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {selected.length ? selected.map((t) => <TagPill key={t.id} tag={t} />) : <span className="text-zinc-600">No tags</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          {tags.length === 0 && <p className="px-3 py-2 text-xs text-zinc-500">No tags on this board yet.</p>}
          <ul role="listbox" aria-multiselectable="true">
            {tags.map((t) => {
              const on = value.includes(t.id);
              return (
                <li key={t.id} role="option" aria-selected={on}>
                  <button type="button" onClick={() => toggle(t.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-800">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-indigo-500 bg-indigo-600 text-white" : "border-zinc-600"}`}>{on && <Check className="h-3 w-3" />}</span>
                    <TagPill tag={t} />
                  </button>
                </li>
              );
            })}
          </ul>
          {onManage && (
            <button type="button" onClick={() => { setOpen(false); onManage(); }}
              className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-zinc-800 px-2 py-2 text-left text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <Settings2 className="h-3.5 w-3.5" />Manage tags…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
