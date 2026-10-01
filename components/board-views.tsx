"use client";
import { useMemo, useRef, useState } from "react";
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

const DAY_WIDTH = 36;
const DAY_MS = 864e5;
type Gesture = { cardId: string; pointerId: number; mode: "move" | "start" | "end"; originX: number; delta: number; start: string; end: string };

function localISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function shiftISO(iso: string, delta: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return localISO(date);
}
function dayOffset(start: string, end: string) {
  return Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / DAY_MS);
}

export function TimelineView({ columns, cards, colColors, onEdit, onDateChange }: ViewProps & {
  onDateChange: (id: string, start_date: string, due_date: string) => void;
}) {
  const [rangeStart] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay() - 7);
    date.setHours(12, 0, 0, 0);
    return localISO(date);
  });
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const suppressClick = useRef(false);
  const days = Array.from({ length: 42 }, (_, index) => shiftISO(rangeStart, index));
  const today = toISO(new Date());
  const gridStyle = { gridTemplateColumns: `200px repeat(${days.length}, ${DAY_WIDTH}px)` };

  const begin = (event: React.PointerEvent<HTMLDivElement>, card: Card) => {
    if (event.button !== 0) return;
    const resize = (event.target as HTMLElement).closest<HTMLElement>("[data-resize]")?.dataset.resize;
    const start = card.start_date ?? card.created_at?.slice(0, 10) ?? today;
    const end = card.due_date ?? shiftISO(start, 2);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClick.current = false;
    setGesture({ cardId: card.id, pointerId: event.pointerId, mode: resize === "start" ? "start" : resize === "end" ? "end" : "move", originX: event.clientX, delta: 0, start, end });
  };

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const delta = Math.round((event.clientX - gesture.originX) / DAY_WIDTH);
    if (delta !== gesture.delta) suppressClick.current = true;
    setGesture({ ...gesture, delta });
  };

  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    let start = gesture.start;
    let end = gesture.end;
    if (gesture.mode === "move") { start = shiftISO(start, gesture.delta); end = shiftISO(end, gesture.delta); }
    if (gesture.mode === "start") start = shiftISO(start, Math.min(gesture.delta, dayOffset(start, end)));
    if (gesture.mode === "end") end = shiftISO(end, Math.max(gesture.delta, -dayOffset(start, end)));
    if (gesture.delta) onDateChange(gesture.cardId, start, end);
    setGesture(null);
  };

  const visibleRange = (start: string, end: string, delta = 0, mode: Gesture["mode"] | null = null) => {
    const shiftedStart = mode === "move" ? shiftISO(start, delta) : mode === "start" ? shiftISO(start, Math.min(delta, dayOffset(start, end))) : start;
    const shiftedEnd = mode === "move" ? shiftISO(end, delta) : mode === "end" ? shiftISO(end, Math.max(delta, -dayOffset(start, end))) : end;
    const from = Math.max(0, dayOffset(rangeStart, shiftedStart));
    const to = Math.min(days.length, dayOffset(rangeStart, shiftedEnd) + 1);
    return { start: from, end: Math.max(from + 1, to), shiftedStart, shiftedEnd };
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Timeline · 6 weeks</h2>
        <p className="hidden text-xs text-zinc-500 sm:block">Drag a task to shift dates; drag either edge to resize.</p>
      </div>
      <div className="w-max min-w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="grid border-b border-zinc-800 bg-zinc-900/80" style={gridStyle}>
          <div className="sticky left-0 z-20 flex h-12 items-center border-r border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-400">Stage / task</div>
          {days.map((iso) => {
            const date = new Date(`${iso}T12:00:00`);
            return <div key={iso} className={`flex h-12 flex-col items-center justify-center border-r border-zinc-800/70 text-[10px] ${iso === today ? "bg-indigo-500/10 text-indigo-200" : "text-zinc-500"}`}>
              <span>{date.toLocaleDateString(undefined, { weekday: "short" })}</span><span className="mt-0.5">{date.getDate()}</span>
            </div>;
          })}
        </div>
        {columns.map((column) => {
          const stageCards = cards.filter((card) => card.column_id === column.id).sort((a, b) => a.order_index - b.order_index);
          return (
            <section key={column.id}>
              <div className="sticky left-0 z-10 flex h-9 items-center gap-2 border-b border-t border-zinc-800 bg-zinc-900/70 px-3 text-xs font-semibold text-zinc-300">
                <span className={`h-2 w-2 shrink-0 rounded-full ${PALETTE[colColors[column.id]].dot}`} />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{column.name}</span>
                <span className="ml-auto shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{stageCards.length}</span>
              </div>
              {stageCards.map((card) => {
                const start = card.start_date ?? card.created_at?.slice(0, 10) ?? today;
                const end = card.due_date ?? shiftISO(start, 2);
                const active = gesture?.cardId === card.id ? gesture : null;
                const range = visibleRange(start, end, active?.delta ?? 0, active?.mode ?? null);
                const colorKey = effectiveColor(card.color, colColors[column.id]);
                return (
                  <div key={card.id} className="grid min-h-12 border-b border-zinc-800/70" style={gridStyle}>
                    <button onClick={() => onEdit(card.id)} title={card.title} className="sticky left-0 z-[1] min-w-0 border-r border-zinc-800 bg-zinc-950 px-3 text-left text-xs text-zinc-300 hover:bg-zinc-900">
                      <span className="block truncate">{card.title}</span>
                    </button>
                    <div className="relative min-h-12 bg-[linear-gradient(to_right,rgba(63,63,70,0.42)_1px,transparent_1px)] bg-[size:36px_100%]" style={{ gridColumn: "2 / span 42" }}>
                      <div className={`absolute top-2 flex h-8 touch-none select-none items-center overflow-hidden rounded border px-1 text-[11px] shadow-sm ${PALETTE[colorKey].card} ${isDoneName(column.name) ? "opacity-55" : ""}`}
                        style={{ left: `${range.start * DAY_WIDTH}px`, width: `${Math.max(DAY_WIDTH - 4, (range.end - range.start) * DAY_WIDTH - 4)}px` }}
                        role="button" tabIndex={0} aria-label={`${card.title}, ${range.shiftedStart} to ${range.shiftedEnd}`}
                        onPointerDown={(event) => begin(event, card)} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => setGesture(null)}
                        onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onEdit(card.id); }}
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                          event.preventDefault();
                          const amount = event.key === "ArrowLeft" ? -1 : 1;
                          onDateChange(card.id, shiftISO(start, amount), shiftISO(end, amount));
                        }}>
                        <span data-resize="start" role="separator" aria-label="Resize task start" className="-ml-1 mr-1 h-full w-2 shrink-0 cursor-ew-resize touch-none rounded-l" />
                        <span className="min-w-0 flex-1 truncate">{card.title}</span>
                        <span data-resize="end" role="separator" aria-label="Resize task end" className="-mr-1 ml-1 h-full w-2 shrink-0 cursor-ew-resize touch-none rounded-r" />
                      </div>
                    </div>
                  </div>
                );
              })}
              {stageCards.length === 0 && <div className="h-8 border-b border-zinc-800/70" />}
            </section>
          );
        })}
      </div>
    </div>
  );
}
