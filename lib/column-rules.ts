// Validation shared by the column server actions and their tests.
import { isColorKey, type ColorKey } from "./colors";

export const MAX_COLUMNS = 12;
export const MAX_COLUMN_NAME = 40;

export const cleanColumnName = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_COLUMN_NAME);

/** Empty means "no limit"; otherwise a whole number from 1 to 99 (the database requires > 0). */
export function parseWipLimit(v: unknown): { value: number | null } | { error: string } {
  if (v === null || v === undefined || v === "") return { value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 99) return { error: "WIP limit must be a whole number from 1 to 99, or empty for no limit." };
  return { value: n };
}

/** Returns an error message, or null when the name is fine. Names are unique per board, ignoring case. */
export function checkColumnName(name: string, others: { id: string; name: string }[], selfId?: string): string | null {
  if (!name) return "Enter a column name.";
  const key = name.toLowerCase();
  if (others.some((o) => o.id !== selfId && o.name.trim().toLowerCase() === key)) return "A column with that name already exists.";
  return null;
}

/** Columns arranged by an id list; ids missing from the list keep their saved order after the listed ones. */
export function applyColumnOrder<T extends { id: string; order_index: number }>(columns: T[], order: string[] | null): T[] {
  if (!order) return columns;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...columns].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || a.order_index - b.order_index);
}

/** null/empty = automatic colour; otherwise a key from the shared palette. */
export function parseColumnColor(v: unknown): { value: ColorKey | null } | { error: string } {
  if (v === null || v === undefined || v === "") return { value: null };
  return isColorKey(v) ? { value: v } : { error: "Pick one of the available colours." };
}
