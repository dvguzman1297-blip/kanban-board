"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PALETTE, effectiveColor, type ColorKey } from "@/lib/colors";
import { isDoneName, toISO } from "@/lib/board-utils";
import { EnergyBadge, PriorityBadge } from "@/components/card-view";
import type { Card, Column } from "@/lib/types";

type ViewProps = { columns: Column[]; cards: Card[]; colColors: Record<string, ColorKey>; onEdit: (id: string) => void };

export function ListView({ columns, cards, colColors, onEdit }: ViewProps) {
  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
      {columns.map((col) => {
        const list = cards.filter((c) => c.column_id === col.id).sort((a, b) => a.order_index - b.order_index);
        return (
          <section key={col.id}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <span className={`h-2.5 w-2.5 rounded-full ${PALETTE[colColors[col.id]].dot}`} />
              {col.name}
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{list.length}</span>
            </h2>
            {list.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-sm text-zinc-600">Nothing here</p>
            ) : (
              <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
                {list.map((c) => {
                  const subs = c.subtasks ?? [];
                  return (
                    <li key={c.id} onClick={() => onEdit(c.id)}
                      className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 bg-zinc-900/40 px-3 py-2.5 text-sm hover:bg-zinc-800/60">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PALETTE[effectiveColor(c.color, colColors[col.id])].dot}`} />
                      <span className={`min-w-0 flex-1 basis-40 truncate ${isDoneName(col.name) ? "text-zinc-500 line-through" : ""}`}>{c.title}</span>
                      <span className="flex items-center gap-1.5 text-[11px]"><PriorityBadge value={c.priority} /><EnergyBadge value={c.energy_level} /></span>
                      <span className="w-24 text-xs text-zinc-500">{c.due_date ?? "No due date"}</span>
                      <span className="w-10 text-right text-xs text-zinc-500">
                        {subs.length > 0 ? `${subs.filter((s) => s.done).length}/${subs.length}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function CalendarView({ columns, cards, colColors, onEdit }: ViewProps) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const colById = useMemo(() => Object.fromEntries(columns.map((c) => [c.id, c])), [columns]);
  const byDay = useMemo(() => {
    const m: Record<string, Card[]> = {};
    cards.forEach((c) => { if (c.due_date) (m[c.due_date] ??= []).push(c); });
    return m;
  }, [cards]);
  const noDue = cards.filter((c) => !c.due_date).length;

  const start = new Date(month);
  start.setDate(1 - month.getDay()); // grid starts on Sunday
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const todayISO = toISO(new Date());
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="mr-auto text-base font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <button onClick={() => shift(-1)} aria-label="Previous month" className="rounded-lg border border-zinc-800 p-1.5 hover:bg-zinc-800"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
          className="rounded-lg border border-zinc-800 px-3 py-1 text-sm hover:bg-zinc-800">Today</button>
        <button onClick={() => shift(1)} aria-label="Next month" className="rounded-lg border border-zinc-800 p-1.5 hover:bg-zinc-800"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-zinc-900 px-2 py-1.5 text-center font-medium text-zinc-500">{d}</div>
        ))}
        {days.map((d) => {
          const iso = toISO(d);
          const list = byDay[iso] ?? [];
          const inMonth = d.getMonth() === month.getMonth();
          return (
            <div key={iso} className={`min-h-[5.5rem] bg-zinc-950 p-1.5 ${inMonth ? "" : "opacity-40"}`}>
              <div className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                iso === todayISO ? "bg-indigo-600 font-semibold text-white" : "text-zinc-500"}`}>{d.getDate()}</div>
              <div className="space-y-1">
                {list.slice(0, 3).map((c) => {
                  const col = colById[c.column_id];
                  const key = effectiveColor(c.color, colColors[c.column_id]);
                  return (
                    <button key={c.id} onClick={() => onEdit(c.id)} title={c.title}
                      className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[11px] ${PALETTE[key].card} ${col && isDoneName(col.name) ? "line-through opacity-60" : ""}`}>
                      {c.title}
                    </button>
                  );
                })}
                {list.length > 3 && <p className="px-1 text-[11px] text-zinc-500">+{list.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
      {noDue > 0 && <p className="mt-3 text-xs text-zinc-500">{noDue} card{noDue === 1 ? "" : "s"} without a due date aren&apos;t shown here — set one in the card editor.</p>}
    </div>
  );
}
