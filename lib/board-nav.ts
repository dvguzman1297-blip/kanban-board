export type NavKey = "down" | "up" | "left" | "right";

/**
 * Moves a keyboard cursor over a board laid out as columns of card ids.
 * J/K step within a column; H/L jump to the nearest non-empty neighbouring column,
 * keeping the same row where possible. With no current card, any key lands on the first card.
 */
export function moveCursor(columns: string[][], current: string | null, key: NavKey): string | null {
  const firstOverall = columns.find((c) => c.length)?.[0] ?? null;
  if (!current) return firstOverall;
  const col = columns.findIndex((c) => c.includes(current));
  if (col === -1) return firstOverall;
  const row = columns[col].indexOf(current);

  if (key === "down") return columns[col][Math.min(row + 1, columns[col].length - 1)];
  if (key === "up") return columns[col][Math.max(row - 1, 0)];

  const step = key === "right" ? 1 : -1;
  for (let c = col + step; c >= 0 && c < columns.length; c += step) {
    if (columns[c].length) return columns[c][Math.min(row, columns[c].length - 1)];
  }
  return current;
}

/** True when a key event came from somewhere the user is typing. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}
