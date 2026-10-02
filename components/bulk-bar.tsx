"use client";
import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, CalendarClock, MoveRight, Tag as TagIcon, Trash2, UserPlus, X } from "lucide-react";
import { bulkDeleteCards, bulkMoveCards, bulkTagCards, bulkUpdateCards } from "@/app/bulk-actions";
import { memberName } from "@/lib/board-stats";
import { TagPill } from "@/components/tags-context";
import type { Card, Column, Member, Tag } from "@/lib/types";

const sel = "h-8 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-indigo-500";
const btn = "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50";

type Panel = "move" | "due" | "assign" | "tag" | null;

/** Floating action bar shown while one or more cards are selected. */
export function BulkBar({ ids, cards, columns, members, tags, onClear, onCardsChange, onCardsRemoved, onTagsChange, onRefresh }: {
  ids: string[]; cards: Card[]; columns: Column[]; members: Member[]; tags: Tag[];
  onClear: () => void;
  onCardsChange: (ids: string[], patch: Partial<Card>) => void;
  onCardsRemoved: (ids: string[]) => void;
  onTagsChange: (ids: string[], tagId: string, add: boolean) => void;
  onRefresh: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();
  const picked = cards.filter((c) => ids.includes(c.id));
  const allArchived = picked.length > 0 && picked.every((c) => c.archived_at);

  // Optimistic: apply locally first, call the server, and let the caller re-sync on failure.
  const run = (apply: () => void, task: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setError(null);
    apply();
    const res = await task().catch(() => ({ ok: false, error: "Something went wrong." }));
    if (!res.ok) { setError(res.error ?? "Something went wrong."); onRefresh(); }
    else setPanel(null);
  });

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

  return (
    <div role="toolbar" aria-label={`${ids.length} cards selected`}
      className="fixed inset-x-3 bottom-4 z-[60] mx-auto w-fit max-w-[calc(100vw-1.5rem)] rounded-2xl border border-zinc-700 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur">
      {panel && (
        <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-zinc-800 px-1 pb-2">
          {panel === "move" && (
            <select aria-label="Move to column" defaultValue="" className={sel} disabled={pending}
              onChange={(e) => { const col = e.target.value; if (!col) return;
                run(() => onCardsChange(ids, { column_id: col }), () => bulkMoveCards(ids, col)); }}>
              <option value="" disabled>Move to…</option>
              {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {panel === "due" && (
            <>
              <input type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} className={sel} />
              <button disabled={pending || !due} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}
                onClick={() => run(() => onCardsChange(ids, { due_date: due }), () => bulkUpdateCards(ids, { due_date: due }))}>Set date</button>
              <button disabled={pending} className={btn}
                onClick={() => run(() => onCardsChange(ids, { due_date: null }), () => bulkUpdateCards(ids, { due_date: null }))}>Clear date</button>
            </>
          )}
          {panel === "assign" && (
            <select aria-label="Assign to" defaultValue="" className={sel} disabled={pending}
              onChange={(e) => { const v = e.target.value; if (!v) return; const id = v === "none" ? null : v;
                run(() => onCardsChange(ids, { assignee_id: id }), () => bulkUpdateCards(ids, { assignee_id: id })); }}>
              <option value="" disabled>Assign to…</option>
              <option value="none">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
            </select>
          )}
          {panel === "tag" && (tags.length === 0 ? <span className="text-xs text-zinc-500">Create tags first (Tags button in the header).</span> : (
            <ul className="flex max-w-[80vw] flex-wrap gap-1.5">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center gap-0.5 rounded-full bg-zinc-800/60 pr-0.5">
                  <TagPill tag={t} />
                  <button disabled={pending} aria-label={`Add ${t.name} to selected cards`} title="Add to selected"
                    onClick={() => run(() => onTagsChange(ids, t.id, true), () => bulkTagCards(ids, t.id, true))}
                    className="h-5 w-5 rounded-full text-xs text-emerald-300 hover:bg-zinc-700">+</button>
                  <button disabled={pending} aria-label={`Remove ${t.name} from selected cards`} title="Remove from selected"
                    onClick={() => run(() => onTagsChange(ids, t.id, false), () => bulkTagCards(ids, t.id, false))}
                    className="h-5 w-5 rounded-full text-xs text-rose-300 hover:bg-zinc-700">−</button>
                </li>
              ))}
            </ul>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mb-2 px-2 text-xs text-rose-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-1">
        <span className="px-2 text-xs font-medium text-zinc-100">{ids.length} selected</span>
        <button className={btn} aria-expanded={panel === "move"} onClick={() => toggle("move")}><MoveRight className="h-3.5 w-3.5" />Move</button>
        <button className={btn} aria-expanded={panel === "due"} onClick={() => toggle("due")}><CalendarClock className="h-3.5 w-3.5" />Due date</button>
        <button className={btn} aria-expanded={panel === "assign"} onClick={() => toggle("assign")}><UserPlus className="h-3.5 w-3.5" />Assign</button>
        <button className={btn} aria-expanded={panel === "tag"} onClick={() => toggle("tag")}><TagIcon className="h-3.5 w-3.5" />Tags</button>
        <button className={btn} disabled={pending}
          onClick={() => run(() => onCardsChange(ids, { archived_at: allArchived ? null : new Date().toISOString() }), () => bulkUpdateCards(ids, { archived: !allArchived }))}>
          {allArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}{allArchived ? "Restore" : "Archive"}
        </button>
        <button className={`${btn} text-rose-300 hover:text-rose-200`} disabled={pending}
          onClick={() => { if (!confirm(`Delete ${ids.length} card${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
            run(() => onCardsRemoved(ids), () => bulkDeleteCards(ids)); onClear(); }}>
          <Trash2 className="h-3.5 w-3.5" />Delete
        </button>
        <button onClick={onClear} aria-label="Clear selection" title="Clear selection (Esc)" className="ml-1 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
