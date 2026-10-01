// Class names are written out in full so Tailwind can detect them.
export const PALETTE = {
  slate:   { label: "Slate",   card: "bg-slate-500/20 border-slate-500/40 hover:border-slate-500/70",     dot: "bg-slate-500" },
  sky:     { label: "Sky",     card: "bg-sky-500/20 border-sky-500/40 hover:border-sky-500/70",           dot: "bg-sky-500" },
  teal:    { label: "Teal",    card: "bg-teal-500/20 border-teal-500/40 hover:border-teal-500/70",        dot: "bg-teal-500" },
  emerald: { label: "Green",   card: "bg-emerald-500/20 border-emerald-500/40 hover:border-emerald-500/70", dot: "bg-emerald-500" },
  amber:   { label: "Amber",   card: "bg-amber-500/20 border-amber-500/40 hover:border-amber-500/70",     dot: "bg-amber-500" },
  orange:  { label: "Orange",  card: "bg-orange-500/20 border-orange-500/40 hover:border-orange-500/70",  dot: "bg-orange-500" },
  rose:    { label: "Red",     card: "bg-rose-500/20 border-rose-500/40 hover:border-rose-500/70",        dot: "bg-rose-500" },
  pink:    { label: "Pink",    card: "bg-pink-500/20 border-pink-500/40 hover:border-pink-500/70",        dot: "bg-pink-500" },
  violet:  { label: "Violet",  card: "bg-violet-500/20 border-violet-500/40 hover:border-violet-500/70",  dot: "bg-violet-500" },
  indigo:  { label: "Indigo",  card: "bg-indigo-500/20 border-indigo-500/40 hover:border-indigo-500/70",  dot: "bg-indigo-500" },
} as const;

export type ColorKey = keyof typeof PALETTE;
export const COLOR_KEYS = Object.keys(PALETTE) as ColorKey[];

// Default colour per status column (matched by name), then cycles for custom columns.
const BY_NAME: Record<string, ColorKey> = {
  backlog: "slate", "up next": "sky", "in progress": "amber", blocked: "rose", done: "emerald",
};
const CYCLE: ColorKey[] = ["slate", "sky", "amber", "rose", "emerald", "violet", "teal", "orange"];

export const columnColor = (name: string, index: number): ColorKey =>
  BY_NAME[name.trim().toLowerCase()] ?? CYCLE[index % CYCLE.length];

export const effectiveColor = (cardColor: string | null | undefined, fallback: ColorKey): ColorKey =>
  cardColor && cardColor in PALETTE ? (cardColor as ColorKey) : fallback;
