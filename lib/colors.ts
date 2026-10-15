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
// Red is reserved for Blocked and green for Done, so names from the board templates get calm colours instead.
const BY_NAME: Record<string, ColorKey> = {
  backlog: "slate", "up next": "sky", "in progress": "amber", blocked: "rose", done: "emerald",
  // template columns
  ideas: "slate", reported: "slate", applied: "slate", new: "slate", brainstorm: "slate", "before day 1": "slate", monday: "slate",
  "to do": "sky", triaged: "sky", planned: "sky", planning: "sky", screening: "sky", "week 1": "sky", tuesday: "sky",
  doing: "amber", writing: "amber", creating: "amber", interview: "amber", building: "amber",
  review: "violet", "in review": "violet", testing: "violet", wednesday: "violet",
  scheduled: "teal", booked: "teal", offer: "teal", live: "teal", "first month": "teal", thursday: "teal",
  waiting: "orange", friday: "orange",
};
const CYCLE: ColorKey[] = ["slate", "sky", "amber", "rose", "emerald", "violet", "teal", "orange"];

export const isColorKey = (v: unknown): v is ColorKey => typeof v === "string" && Object.prototype.hasOwnProperty.call(PALETTE, v);

/** A colour the user picked wins; otherwise it comes from the column's name, then its position. */
export const columnColor = (name: string, index: number, saved?: string | null): ColorKey =>
  (isColorKey(saved) ? saved : null) ?? BY_NAME[name.trim().toLowerCase()] ?? CYCLE[index % CYCLE.length];

export const effectiveColor = (cardColor: string | null | undefined, fallback: ColorKey): ColorKey =>
  cardColor && cardColor in PALETTE ? (cardColor as ColorKey) : fallback;
