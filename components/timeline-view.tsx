"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { PALETTE, effectiveColor, type ColorKey } from "@/lib/colors";
import { isDoneName, toISO } from "@/lib/board-utils";
import {
  MIN_DAY, applyGesture, cardDates, dayOffset, fromSpan, geometry, localISO, presets, pxPerDay, shiftISO, stepAnchor, toSpan,
  weekStart, windowFor, winLength, type GestureMode, type Mode, type Span, type Win,
} from "@/lib/timeline";
import type { Card, Column } from "@/lib/types";

export type TimelinePatch = Pick<Card, "start_date" | "due_date" | "start_time" | "due_time">;

const LABEL_W = 200;
const MODES: [Mode, string][] = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["quarter", "Quarter"]];
const STORAGE_KEY = "flowdeck:timeline-mode";

type Seg = { key: string; label: string; sub?: string; days: number; strong?: boolean };
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, o);

/* ---------- header segments ---------- */
function daySegs(win: Win, today: string): Seg[] {
  return Array.from({ length: winLength(win) }, (_, i) => {
    const iso = shiftISO(win.start, i);
    return { key: iso, label: String(new Date(`${iso}T12:00:00`).getDate()), sub: fmt(iso, { weekday: "short" }), days: 1, strong: iso === today };
  });
}
function chunk(win: Win, boundary: (iso: string) => string, label: (start: string) => string): Seg[] {
  const out: Seg[] = [];
  let cur = win.start;
  while (cur <= win.end) {
    const next = boundary(cur); // first day of the following chunk
    const end = next <= win.end ? next : shiftISO(win.end, 1);
    out.push({ key: cur, label: label(cur), days: dayOffset(cur, end) });
    cur = end;
  }
  return out;
}
const nextMonth = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return localISO(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)); };
const nextQuarter = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return localISO(new Date(d.getFullYear(), (Math.floor(d.getMonth() / 3) + 1) * 3, 1, 12)); };
const monthSegs = (win: Win) => chunk(win, nextMonth, (s) => fmt(s, { month: "short", year: "numeric" }));
const weekSegs = (win: Win) => chunk(win, (s) => shiftISO(weekStart(s), 7), (s) => `Week of ${fmt(weekStart(s) < win.start ? win.start : weekStart(s), { month: "short", day: "numeric" })}`);
const quarterSegs = (win: Win) => chunk(win, nextQuarter, (s) => { const d = new Date(`${s}T12:00:00`); return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`; });

function headerFor(mode: Mode, win: Win, today: string, k: number): { top: Seg[]; bottom: Seg[] } {
  if (mode === "day") {
    return {
      top: [{ key: "d", label: fmt(win.start, { weekday: "long", month: "long", day: "numeric", year: "numeric" }), days: 1, strong: win.start === today }],
      bottom: Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: `${String(h).padStart(2, "0")}:00`, days: 1 / 24 })),
    };
  }
  if (mode === "week") return { top: [{ key: "w", label: `${fmt(win.start, { month: "short", day: "numeric" })} – ${fmt(win.end, { month: "short", day: "numeric", year: "numeric" })}`, days: 7 }], bottom: daySegs(win, today) };
  if (mode === "month") return { top: weekSegs(win), bottom: daySegs(win, today) };
  if (mode === "quarter") return { top: quarterSegs(win), bottom: monthSegs(win) };
  // custom: months on top; days when there is room, otherwise weeks
  return { top: monthSegs(win), bottom: k >= 14 ? daySegs(win, today) : weekSegs(win) };
}

type Gesture = { cardId: string; pointerId: number; mode: GestureMode; originX: number; deltaMin: number; base: Span };

export function TimelineView({ columns, cards, colColors, onEdit, onChange }: {
  columns: Column[]; cards: Card[]; colColors: Record<string, ColorKey>;
  onEdit: (id: string) => void; onChange: (id: string, patch: TimelinePatch) => void;
}) {
  const today = toISO(new Date());
  const [mode, setMode] = useState<Mode>(() => {
    try { const v = localStorage.getItem(STORAGE_KEY); if (v === "day" || v === "week" || v === "month" || v === "quarter") return v; } catch {}
    return "week"; // default
  });
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState<Win | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const suppressClick = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  const win = useMemo(() => windowFor(mode, anchor, custom ?? undefined), [mode, anchor, custom]);
  const perDay = pxPerDay(mode, win);
  const k = perDay / MIN_DAY; // pixels per minute
  const snap = mode === "day" ? 30 : MIN_DAY;
  const trackW = winLength(win) * perDay;
  const header = useMemo(() => headerFor(mode, win, today, perDay), [mode, win, today, perDay]);
  const todayOffset = dayOffset(win.start, today);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const todayLeft = todayOffset >= 0 && todayOffset < winLength(win) ? (todayOffset * MIN_DAY + (mode === "day" ? nowMin : MIN_DAY / 2)) * k : null;

  // Day view opens around working hours instead of midnight.
  useEffect(() => { if (mode === "day" && scroller.current) scroller.current.scrollLeft = 7 * perDay / 24; }, [mode, anchor, perDay]);

  const pickMode = (m: Mode) => {
    if (mode === "custom" && custom) setAnchor(custom.start);
    setMode(m);
    setCustom(null);
    try { localStorage.setItem(STORAGE_KEY, m); } catch {}
  };
  const step = (dir: 1 | -1) => {
    if (mode === "custom" && custom) {
      const len = winLength(custom);
      const next = { start: shiftISO(custom.start, len * dir), end: shiftISO(custom.end, len * dir) };
      setCustom(next); setAnchor(next.start);
    } else setAnchor(stepAnchor(mode, anchor, dir));
  };
  const jumpToday = () => {
    if (mode === "custom" && custom) { const len = winLength(custom); setCustom({ start: today, end: shiftISO(today, len - 1) }); }
    setAnchor(today);
  };
  const applyPreset = (label: string, w: Win) => {
    if (label === "Today") { setMode("day"); setCustom(null); setAnchor(today); return; }
    if (label === "This month") { setMode("month"); setCustom(null); setAnchor(today); return; }
    setMode("custom"); setCustom(w); setAnchor(w.start);
  };
  const setRange = (start: string, end: string) => {
    if (!start || !end || end < start) return;
    setMode("custom"); setCustom({ start, end }); setAnchor(start);
  };

  const rangeLabel =
    mode === "day" ? fmt(win.start, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : mode === "month" ? fmt(win.start, { month: "long", year: "numeric" })
    : `${fmt(win.start, { month: "short", day: "numeric", year: win.start.slice(0, 4) === win.end.slice(0, 4) ? undefined : "numeric" })} – ${fmt(win.end, { month: "short", day: "numeric", year: "numeric" })}`;

  /* ---------- drag to move / resize ---------- */
  const begin = (e: React.PointerEvent<HTMLDivElement>, card: Card) => {
    if (e.button !== 0) return;
    const handle = (e.target as HTMLElement).closest<HTMLElement>("[data-resize]")?.dataset.resize;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    suppressClick.current = false;
    setGesture({ cardId: card.id, pointerId: e.pointerId, mode: handle === "start" ? "start" : handle === "end" ? "end" : "move", originX: e.clientX, deltaMin: 0, base: toSpan(card, win.start, today) });
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const deltaMin = Math.round((e.clientX - gesture.originX) / k / snap) * snap;
    if (deltaMin !== gesture.deltaMin) suppressClick.current = true;
    setGesture({ ...gesture, deltaMin });
  };
  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    if (gesture.deltaMin) {
      const next = applyGesture(gesture.base, gesture.mode, gesture.deltaMin, snap);
      // Hour-level edits in Day view turn a whole-day card into a timed one.
      onChange(gesture.cardId, fromSpan({ ...next, timed: next.timed || mode === "day" }, win.start));
    }
    setGesture(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Timeline granularity" className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
            {MODES.map(([m, label]) => (
              <button key={m} onClick={() => pickMode(m)} aria-pressed={mode === m}
                className={`rounded-md px-3 py-1.5 text-sm ${mode === m ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}>
                {label}<span className="hidden sm:inline">{m === "quarter" ? " / Roadmap" : ""}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} aria-label="Previous" className="flex h-9 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-sm text-zinc-300 hover:border-zinc-700"><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Prev</span></button>
            <button onClick={jumpToday} className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 hover:border-zinc-700">Jump to Today</button>
            <button onClick={() => step(1)} aria-label="Next" className="flex h-9 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-sm text-zinc-300 hover:border-zinc-700"><span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" /></button>
          </div>
          <h2 aria-live="polite" className="flex items-center gap-1.5 text-sm font-semibold"><CalendarRange className="h-4 w-4 text-zinc-500" />{rangeLabel}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">Quick range:</span>
          {presets(today).map((p) => (
            <button key={p.label} onClick={() => applyPreset(p.label, p.win)}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-zinc-300 hover:border-zinc-600">{p.label}</button>
          ))}
          <span className="ml-2 text-zinc-500">Custom:</span>
          <label className="flex items-center gap-1 text-zinc-500">From
            <input type="date" value={win.start} max={win.end} onChange={(e) => setRange(e.target.value, win.end)} className="h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-indigo-500" />
          </label>
          <label className="flex items-center gap-1 text-zinc-500">To
            <input type="date" value={win.end} min={win.start} onChange={(e) => setRange(win.start, e.target.value)} className="h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-indigo-500" />
          </label>
          <span className="hidden text-zinc-600 lg:inline">Drag a bar to move it; drag either edge to resize{mode === "day" ? " (30-minute steps)" : ""}.</span>
        </div>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950">
        <div style={{ width: LABEL_W + trackW }} className="min-w-full">
          {/* header */}
          <div className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-900">
            {[header.top, header.bottom].map((segs, row) => (
              <div key={row} className="flex">
                <div style={{ width: LABEL_W }} className={`sticky left-0 z-30 flex shrink-0 items-center border-r border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-400 ${row === 0 ? "h-8" : "h-10"}`}>
                  {row === 0 ? "Stage / task" : ""}
                </div>
                {segs.map((s) => (
                  <div key={s.key} title={s.sub ? `${s.sub} ${s.label}` : s.label} style={{ width: s.days * perDay }}
                    className={`flex shrink-0 flex-col items-center justify-center overflow-hidden whitespace-nowrap border-r border-zinc-800/70 text-[10px] ${row === 0 ? "h-8" : "h-10"} ${s.strong ? "bg-indigo-500/10 text-indigo-200" : "text-zinc-500"}`}>
                    {row === 1 && s.sub && perDay >= 30 ? <span>{s.sub}</span> : null}
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {columns.map((column) => {
            const stage = cards.filter((c) => c.column_id === column.id).sort((a, b) => a.order_index - b.order_index);
            return (
              <section key={column.id}>
                <div className="sticky left-0 z-10 flex h-9 items-center gap-2 border-y border-zinc-800 bg-zinc-900/70 px-3 text-xs font-semibold text-zinc-300" style={{ width: LABEL_W }}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${PALETTE[colColors[column.id]].dot}`} />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{column.name}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{stage.length}</span>
                </div>
                {stage.map((card) => {
                  const active = gesture?.cardId === card.id ? gesture : null;
                  const base = toSpan(card, win.start, today);
                  const span = active ? applyGesture(active.base, active.mode, active.deltaMin, snap) : base;
                  const box = geometry(span, win, k);
                  const colorKey = effectiveColor(card.color, colColors[column.id]);
                  const { start, end } = cardDates(card, today);
                  const shifted = fromSpan({ ...span, timed: span.timed || (active !== null && mode === "day") }, win.start);
                  const side = span.e <= 0 ? "earlier" : "later";
                  return (
                    <div key={card.id} className="flex min-h-12 border-b border-zinc-800/70">
                      <button onClick={() => onEdit(card.id)} title={card.title} style={{ width: LABEL_W }}
                        className="sticky left-0 z-[1] shrink-0 border-r border-zinc-800 bg-zinc-950 px-3 text-left text-xs text-zinc-300 hover:bg-zinc-900">
                        <span className="block truncate">{card.title}</span>
                      </button>
                      <div className="relative min-h-12" style={{
                        width: trackW,
                        backgroundImage: "linear-gradient(to right, rgba(63,63,70,0.42) 1px, transparent 1px)",
                        backgroundSize: mode === "day" ? `${perDay / 24}px 100%` : mode === "quarter" ? "0 0" : `${perDay * (perDay < 10 ? 7 : 1)}px 100%`,
                      }}>
                        {todayLeft !== null && <span aria-hidden className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-indigo-400/60" style={{ left: todayLeft }} />}
                        {box ? (
                          <div className={`absolute top-2 z-[2] flex h-8 touch-none select-none items-center overflow-hidden border px-1 text-[11px] shadow-sm ${PALETTE[colorKey].card} ${isDoneName(column.name) ? "opacity-55" : ""} ${box.clippedLeft ? "rounded-l-none border-l-0" : "rounded-l"} ${box.clippedRight ? "rounded-r-none border-r-0" : "rounded-r"}`}
                            style={{ left: box.left, width: box.width }}
                            role="button" tabIndex={0}
                            aria-label={`${card.title}, ${shifted.start_date}${shifted.start_time ? ` ${shifted.start_time.slice(0, 5)}` : ""} to ${shifted.due_date}${shifted.due_time ? ` ${shifted.due_time.slice(0, 5)}` : ""}`}
                            onPointerDown={(e) => begin(e, card)} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => setGesture(null)}
                            onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onEdit(card.id); }}
                            onKeyDown={(e) => {
                              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                              e.preventDefault();
                              const next = applyGesture(base, "move", (e.key === "ArrowLeft" ? -1 : 1) * snap, snap);
                              onChange(card.id, fromSpan({ ...next, timed: next.timed || mode === "day" }, win.start));
                            }}>
                            {!box.clippedLeft && <span data-resize="start" role="separator" aria-label="Resize task start" className="-ml-1 mr-1 h-full w-2 shrink-0 cursor-ew-resize touch-none rounded-l hover:bg-white/20" />}
                            <span className="min-w-0 flex-1 truncate">{card.title}</span>
                            {!box.clippedRight && <span data-resize="end" role="separator" aria-label="Resize task end" className="-mr-1 ml-1 h-full w-2 shrink-0 cursor-ew-resize touch-none rounded-r hover:bg-white/20" />}
                          </div>
                        ) : (
                          <button onClick={() => onEdit(card.id)} className={`absolute top-3 text-[11px] text-zinc-600 hover:text-zinc-300 ${side === "earlier" ? "left-2" : "right-2"}`}>
                            {side === "earlier" ? `◀ ${fmt(end, { month: "short", day: "numeric" })}` : `${fmt(start, { month: "short", day: "numeric" })} ▶`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {stage.length === 0 && <div className="h-8 border-b border-zinc-800/70" />}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
