// Pure date/geometry helpers for the Timeline view (no React, easy to unit test).
// Dates are local-calendar ISO strings ("2026-10-08"); times are minutes since midnight.

export type Mode = "day" | "week" | "month" | "quarter" | "custom";
export type Win = { start: string; end: string }; // inclusive

export const MIN_DAY = 1440;
export const HOUR_PX = 56;

export const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (iso: string) => new Date(`${iso}T12:00:00`); // noon dodges DST edges
export const shiftISO = (iso: string, days: number) => { const d = parse(iso); d.setDate(d.getDate() + days); return localISO(d); };
export const dayOffset = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / 864e5);
export const winLength = (w: Win) => dayOffset(w.start, w.end) + 1;

/** Shifts by whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, n: number) {
  const d = parse(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return localISO(d);
}
export const monthStart = (iso: string) => `${iso.slice(0, 8)}01`;
export const monthEnd = (iso: string) => { const d = parse(iso); return localISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)); };
export const quarterStart = (iso: string) => { const d = parse(iso); return localISO(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1, 12)); };
/** Monday of the week containing `iso`. */
export const weekStart = (iso: string) => { const d = parse(iso); return shiftISO(iso, -((d.getDay() + 6) % 7)); };

export function windowFor(mode: Mode, anchor: string, custom?: Win): Win {
  switch (mode) {
    case "day": return { start: anchor, end: anchor };
    case "week": { const s = weekStart(anchor); return { start: s, end: shiftISO(s, 6) }; }
    case "month": return { start: monthStart(anchor), end: monthEnd(anchor) };
    case "quarter": { const s = quarterStart(anchor); return { start: s, end: shiftISO(addMonths(s, 12), -1) }; } // 4 quarters from this one
    default: return custom ?? { start: anchor, end: shiftISO(anchor, 13) };
  }
}

/** Moves the anchor one step of the active granularity. Custom ranges slide by their own length. */
export function stepAnchor(mode: Mode, anchor: string, dir: 1 | -1, custom?: Win): string {
  switch (mode) {
    case "day": return shiftISO(anchor, dir);
    case "week": return shiftISO(anchor, 7 * dir);
    case "month": return addMonths(monthStart(anchor), dir);
    case "quarter": return addMonths(quarterStart(anchor), 3 * dir);
    default: return shiftISO(anchor, winLength(custom ?? windowFor("custom", anchor)) * dir);
  }
}

export const pxPerDay = (mode: Mode, win: Win) =>
  mode === "day" ? HOUR_PX * 24 : mode === "week" ? 120 : mode === "month" ? 36 : mode === "quarter" ? 5
  : Math.min(120, Math.max(4, Math.floor(1000 / winLength(win))));

export const presets = (today: string): { label: string; win: Win }[] => [
  { label: "Today", win: { start: today, end: today } },
  { label: "Next 14 days", win: { start: today, end: shiftISO(today, 13) } },
  { label: "This month", win: { start: monthStart(today), end: monthEnd(today) } },
  { label: "Next 30 days", win: { start: today, end: shiftISO(today, 29) } },
];

/* ---------- card spans ---------- */
type SpanCard = { start_date?: string | null; due_date: string | null; start_time?: string | null; due_time?: string | null; created_at?: string };
export type Span = { s: number; e: number; timed: boolean }; // absolute minutes from `origin`, end exclusive

const minutesOf = (t: string | null | undefined) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};
export const timeString = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;

export function cardDates(card: SpanCard, today: string) {
  const start = card.start_date ?? card.created_at?.slice(0, 10) ?? today;
  const end = card.due_date ?? shiftISO(start, 2);
  return { start, end: end < start ? start : end };
}

/** Absolute minutes relative to `origin` (a date). Untimed cards cover whole days. */
export function toSpan(card: SpanCard, origin: string, today: string): Span {
  const { start, end } = cardDates(card, today);
  const st = minutesOf(card.start_time);
  const et = minutesOf(card.due_time);
  const timed = st !== null || et !== null;
  const s = dayOffset(origin, start) * MIN_DAY + (st ?? 0);
  const e = dayOffset(origin, end) * MIN_DAY + (et ?? MIN_DAY);
  return { s, e: Math.max(e, s + (timed ? 30 : MIN_DAY)), timed };
}

/** Back to what we store: dates, plus times only for timed cards (the end may be 24:00:00). */
export function fromSpan(span: Span, origin: string) {
  const startDay = Math.floor(span.s / MIN_DAY);
  let endDay = Math.floor((span.e - 1) / MIN_DAY);
  const endMin = span.e - endDay * MIN_DAY; // 1..1440
  if (endDay < startDay) endDay = startDay;
  return {
    start_date: shiftISO(origin, startDay),
    due_date: shiftISO(origin, endDay),
    start_time: span.timed ? timeString(span.s - startDay * MIN_DAY) : null,
    due_time: span.timed ? (endMin === MIN_DAY ? "24:00:00" : timeString(endMin)) : null,
  };
}

export type GestureMode = "move" | "start" | "end";

/** Applies a drag of `deltaMin` minutes. `snap` is the grid step (30 min in day view, a whole day otherwise). */
export function applyGesture(span: Span, mode: GestureMode, deltaMin: number, snap: number): Span {
  const minLen = span.timed || snap < MIN_DAY ? snap : MIN_DAY;
  if (mode === "move") return { ...span, s: span.s + deltaMin, e: span.e + deltaMin };
  if (mode === "start") return { ...span, s: Math.min(span.s + deltaMin, span.e - minLen) };
  return { ...span, e: Math.max(span.e + deltaMin, span.s + minLen) };
}

/** Pixel box of a span inside a window starting at `origin`; null when fully outside. */
export function geometry(span: Span, win: Win, k: number) {
  const total = winLength(win) * MIN_DAY;
  if (span.e <= 0 || span.s >= total) return null;
  const from = Math.max(0, span.s);
  const to = Math.min(total, span.e);
  return { left: from * k, width: Math.max(14, (to - from) * k), clippedLeft: span.s < 0, clippedRight: span.e > total };
}
