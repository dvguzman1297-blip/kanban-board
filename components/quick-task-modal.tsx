"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { quickCreateCard } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";

type Board = { id: string; name: string };
type Col = { id: string; name: string };

const field = "w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500";
const label = "mb-1 block text-xs font-medium text-zinc-500";

export function QuickTaskModal({ boards, onClose }: { boards: Board[]; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [cols, setCols] = useState<Col[]>([]);
  const [columnId, setColumnId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [energy, setEnergy] = useState("medium");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    if (!boardId) return;
    let live = true;
    createClient().from("columns").select("id, name, order_index").eq("board_id", boardId).order("order_index")
      .then(({ data }) => {
        if (!live) return;
        const list = (data ?? []) as Col[];
        setCols(list);
        setColumnId(list[0]?.id ?? "");
      });
    return () => { live = false; };
  }, [boardId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !boardId || !columnId) return;
    setError(null);
    start(async () => {
      try {
        await quickCreateCard({ board_id: boardId, column_id: columnId, title, priority, energy_level: energy, due_date: due || null });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add the task.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Quick task</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-zinc-500 hover:text-zinc-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className={label}>What needs doing?</label>
            <input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field} placeholder="Task title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Board</label>
              <select value={boardId} onChange={(e) => setBoardId(e.target.value)} className={field}>
                {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Column</label>
              <select value={columnId} onChange={(e) => setColumnId(e.target.value)} className={field}>
                {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={`${field} capitalize`}>
                {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Energy</label>
              <select value={energy} onChange={(e) => setEnergy(e.target.value)} className={`${field} capitalize`}>
                {["low", "medium", "high"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Due date (optional)</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>
          <button disabled={pending || !title.trim() || !columnId}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
            {pending ? "Adding…" : "Add task"}
          </button>
        </div>
      </form>
    </div>
  );
}
