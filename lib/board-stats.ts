import { isDoneName } from "./board-utils";
import type { Card, Column, Member } from "./types";

export const memberName = (m: Pick<Member, "display_name" | "full_name" | "first_name">) =>
  m.display_name?.trim() || m.full_name?.trim() || m.first_name?.trim() || "Member";

export type MemberRow = {
  id: string | null; name: string; avatar_url: string | null;
  assigned: number; open: number; completed: number; overdue: number; created: number; comments: number;
};

export type Slice = { key: string; label: string; count: number };

export function computeBoardStats(
  cards: Card[], columns: Column[], members: Member[], commentAuthors: string[], today: string,
) {
  const colById = new Map(columns.map((c) => [c.id, c]));
  const isDone = (c: Card) => isDoneName(colById.get(c.column_id)?.name ?? "");
  const isOverdue = (c: Card) => !isDone(c) && !!c.due_date && c.due_date < today;

  const perList: Slice[] = columns.map((col) => ({
    key: col.id, label: col.name, count: cards.filter((c) => c.column_id === col.id).length,
  }));

  const weekAhead = new Date(`${today}T00:00:00`);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const weekISO = `${weekAhead.getFullYear()}-${String(weekAhead.getMonth() + 1).padStart(2, "0")}-${String(weekAhead.getDate()).padStart(2, "0")}`;
  const bucketOf = (c: Card) =>
    isDone(c) ? "done" : !c.due_date ? "none" : c.due_date < today ? "overdue" : c.due_date === today ? "today" : c.due_date <= weekISO ? "week" : "later";
  const DUE: [string, string][] = [["overdue", "Overdue"], ["today", "Due today"], ["week", "Next 7 days"], ["later", "Later"], ["none", "No due date"], ["done", "Completed"]];
  const perDue: Slice[] = DUE.map(([key, label]) => ({ key, label, count: cards.filter((c) => bucketOf(c) === key).length }));

  const PRIORITIES: [string, string][] = [["urgent", "Urgent"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]];
  const perPriority: Slice[] = PRIORITIES.map(([key, label]) => ({ key, label, count: cards.filter((c) => c.priority === key).length }));

  const rows = new Map<string | null, MemberRow>();
  const row = (id: string | null): MemberRow => {
    let r = rows.get(id);
    if (!r) {
      const m = members.find((x) => x.id === id);
      r = { id, name: id === null ? "Unassigned" : m ? memberName(m) : "Former member", avatar_url: m?.avatar_url ?? null,
        assigned: 0, open: 0, completed: 0, overdue: 0, created: 0, comments: 0 };
      rows.set(id, r);
    }
    return r;
  };
  members.forEach((m) => row(m.id));
  row(null);
  for (const c of cards) {
    const a = row(c.assignee_id ?? null);
    a.assigned++;
    if (isDone(c)) a.completed++; else a.open++;
    if (isOverdue(c)) a.overdue++;
    if (c.user_id) row(c.user_id).created++;
  }
  for (const id of commentAuthors) row(id).comments++;
  const perMember = [...rows.values()]
    .filter((r) => r.id !== null || r.assigned > 0)
    .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : 0) || b.assigned - a.assigned || a.name.localeCompare(b.name));

  return {
    total: cards.length,
    completed: cards.filter(isDone).length,
    overdue: cards.filter(isOverdue).length,
    unassigned: cards.filter((c) => !c.assignee_id && !isDone(c)).length,
    perList, perDue, perPriority, perMember,
  };
}
