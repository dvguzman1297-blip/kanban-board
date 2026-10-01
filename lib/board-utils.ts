export const isDoneName = (n: string) => n.trim().toLowerCase() === "done";
export const isBlockedName = (n: string) => n.trim().toLowerCase() === "blocked";
export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const isBlockedLike = (n: string) => ["blocked", "waiting"].includes(n.trim().toLowerCase());
