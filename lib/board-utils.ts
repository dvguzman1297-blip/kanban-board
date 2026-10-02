export const isDoneName = (n: string) => n.trim().toLowerCase() === "done";
export const isBlockedName = (n: string) => n.trim().toLowerCase() === "blocked";
export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const isBlockedLike = (n: string) => ["blocked", "waiting"].includes(n.trim().toLowerCase());

/** ISO date `days` working days (Mon–Fri) after `from`; weekends are skipped. */
export function addWorkingDays(from: Date, days: number) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return toISO(d);
}

export const DEFAULT_DUE_WORKING_DAYS = 3;
export const defaultDueDate = (from = new Date()) => addWorkingDays(from, DEFAULT_DUE_WORKING_DAYS);
