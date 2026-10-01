"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, LayoutDashboard, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Board = { id: string; name: string; is_archived: boolean };
type Hit = { id: string; title: string; board_id: string; priority: string; energy_level: string };
type Item = { key: string; label: string; sub: string; href: string; kind: "board" | "card" };

const PRIORITIES = ["low", "medium", "high", "urgent"];
const ENERGIES = ["low", "medium", "high"];

export function CommandPalette({ boards, onClose }: { boards: Board[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const boardName = useMemo(() => Object.fromEntries(boards.map((b) => [b.id, b.name])), [boards]);

  // Search card titles, descriptions and tags (priority / energy) across every board (RLS keeps it to your own)
  useEffect(() => {
    const term = q.trim().replace(/[,()%*\\]/g, " ").trim();
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const ors = [`title.ilike.%${term}%`, `description.ilike.%${term}%`];
      const lower = term.toLowerCase();
      if (PRIORITIES.includes(lower)) ors.push(`priority.eq.${lower}`);
      if (ENERGIES.includes(lower)) ors.push(`energy_level.eq.${lower}`);
      const { data } = await createClient().from("cards")
        .select("id, title, board_id, priority, energy_level").or(ors.join(",")).limit(20);
      setHits((data ?? []) as Hit[]);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const items: Item[] = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const bs = boards.filter((b) => !b.is_archived && (!ql || b.name.toLowerCase().includes(ql))).slice(0, ql ? 5 : 8)
      .map<Item>((b) => ({ key: `b-${b.id}`, label: b.name, sub: "Board", href: `/board/${b.id}`, kind: "board" }));
    const cs = hits.map<Item>((h) => ({
      key: `c-${h.id}`, label: h.title, kind: "card",
      sub: `${boardName[h.board_id] ?? "Board"} · ${h.priority} priority · ${h.energy_level} energy`,
      href: `/board/${h.board_id}?card=${h.id}`,
    }));
    return [...bs, ...cs];
  }, [q, boards, hits, boardName]);

  useEffect(() => setIndex(0), [q, hits]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest" }); }, [index]);

  const go = (it?: Item) => { if (!it) return; onClose(); router.push(it.href); };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4">
          <Search className="h-4 w-4 text-zinc-500" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards, tags and boards…"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter") go(items[index]);
            }}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500" />
          <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">
              {q.trim().length < 2 ? "Type at least 2 characters to search cards." : loading ? "Searching…" : "No matches."}
            </p>
          )}
          {items.map((it, i) => (
            <button key={it.key} data-i={i} onClick={() => go(it)} onMouseEnter={() => setIndex(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === index ? "bg-indigo-500/15" : "hover:bg-zinc-800/60"}`}>
              {it.kind === "board" ? <LayoutDashboard className="h-4 w-4 shrink-0 text-zinc-500" /> : <FileText className="h-4 w-4 shrink-0 text-zinc-500" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{it.label}</span>
                <span className="block truncate text-xs capitalize text-zinc-500">{it.sub}</span>
              </span>
              {i === index && <CornerDownLeft className="h-4 w-4 shrink-0 text-zinc-500" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
