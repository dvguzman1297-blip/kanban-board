import Link from "next/link";
import {
  ArrowRight, Ban, CheckCircle2, Clock, Flag, Gauge, Inbox, LayoutDashboard, ListTodo, Plus, TrendingUp, Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PALETTE, columnColor } from "@/lib/colors";
import { isBlockedLike, isDoneName, toISO } from "@/lib/board-utils";
import { timeAgo } from "@/lib/time";
import { PinButton } from "@/components/pin-button";
import { NewBoardButton } from "@/components/new-board-button";
import { FocusWidget } from "@/components/focus-widget";
import { PriorityBadge } from "@/components/card-view";
import { InviteMembersButton } from "@/components/invite-members-button";
import type { Card, Column } from "@/lib/types";

type Board = { id: string; name: string; user_id: string; is_pinned: boolean; is_archived: boolean; created_at: string };
type Act = {
  id: string; board_id: string | null; card_id: string | null; card_title: string | null;
  kind: string; from_column: string | null; to_column: string | null; created_at: string;
};

const TONE = {
  emerald: "bg-emerald-500/15 text-emerald-300", amber: "bg-amber-500/15 text-amber-300",
  rose: "bg-rose-500/15 text-rose-300", indigo: "bg-indigo-500/15 text-indigo-300",
};

function Stat({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string | number; sub: string; tone: keyof typeof TONE }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${TONE[tone]}`}>{icon}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-0.5 truncate text-xs text-zinc-500">{sub}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: boardsRaw }, { data: colsRaw }, { data: cardsRaw }, { data: actsRaw }, { data: profile }] = await Promise.all([
    supabase.from("boards").select("*").order("created_at"),
    supabase.from("columns").select("*").order("order_index"),
    supabase.from("cards").select("*"),
    supabase.from("activity").select("*").order("created_at", { ascending: false }).limit(200),
    user ? supabase.from("profiles").select("first_name, full_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const allBoards = (boardsRaw ?? []) as Board[];
  const boards = allBoards.filter((b) => !b.is_archived)
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || a.created_at.localeCompare(b.created_at));
  const boardById = new Map(allBoards.map((b) => [b.id, b]));
  const activeIds = new Set(boards.map((b) => b.id));
  const columns = ((colsRaw ?? []) as Column[]).filter((c) => activeIds.has(c.board_id));
  const colById = new Map(columns.map((c) => [c.id, c]));
  const cards = ((cardsRaw ?? []) as Card[]).filter((c) => colById.has(c.column_id));
  const acts = (actsRaw ?? []) as Act[]; // empty until migration 005 has been run

  const today = toISO(new Date());
  const weekAgo = Date.now() - 7 * 864e5;
  const colName = (c: Card) => colById.get(c.column_id)?.name ?? "";
  const isDone = (c: Card) => isDoneName(colName(c));
  const isBlocked = (c: Card) => isBlockedLike(colName(c));

  /* ---- headline stats ---- */
  const activeCards = cards.filter((c) => !isDone(c)).length;
  const velocity = cards.filter((c) => c.completed_at && new Date(c.completed_at).getTime() >= weekAgo).length;
  const blocked = cards.filter(isBlocked).length;
  const wipCols = columns.filter((c) => c.wip_limit !== null)
    .map((col) => ({ col, used: cards.filter((c) => c.column_id === col.id).length }));
  const over = wipCols.filter((x) => x.used > x.col.wip_limit!);
  const full = wipCols.filter((x) => x.used === x.col.wip_limit);
  const wipFocus = over[0] ?? full[0];
  const wip = over.length
    ? { value: `${over.length} over limit`, tone: "rose" as const }
    : full.length ? { value: "At limit", tone: "amber" as const }
    : { value: "Healthy", tone: "emerald" as const };
  const wipSub = wipFocus
    ? `${boardById.get(wipFocus.col.board_id)?.name}: ${wipFocus.col.name} ${wipFocus.used}/${wipFocus.col.wip_limit}`
    : wipCols.length ? "All columns within limits" : "No WIP limits set";

  /* ---- per-board overview ---- */
  const lastByBoard = new Map<string, string>();
  for (const a of acts) if (a.board_id && !lastByBoard.has(a.board_id)) lastByBoard.set(a.board_id, a.created_at);

  const boardCards = boards.map((b) => {
    const cols = columns.filter((c) => c.board_id === b.id);
    const segs = cols.map((c, i) => ({
      name: c.name, key: columnColor(c.name, i), n: cards.filter((k) => k.column_id === c.id).length,
    }));
    const total = segs.reduce((s, x) => s + x.n, 0);
    const limited = cols.filter((c) => c.wip_limit !== null);
    const used = limited.reduce((s, c) => s + cards.filter((k) => k.column_id === c.id).length, 0);
    const limit = limited.reduce((s, c) => s + (c.wip_limit as number), 0);
    return { b, segs, total, used, limit, hasLimit: limited.length > 0, last: lastByBoard.get(b.id) ?? b.created_at };
  });

  /* ---- urgent & due today ---- */
  const rank = (c: Card) => (isBlocked(c) ? 0 : c.priority === "urgent" ? 1 : c.due_date && c.due_date <= today ? 2 : 3);
  const urgent = cards
    .filter((c) => !isDone(c) && (isBlocked(c) || c.priority === "urgent" || c.priority === "high" || (c.due_date && c.due_date <= today)))
    .sort((a, b) => rank(a) - rank(b) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .slice(0, 8);

  /* ---- activity stream ---- */
  const feed = acts.filter((a) => a.board_id && activeIds.has(a.board_id)).slice(0, 12);
  const describe = (a: Act) => {
    const board = boardById.get(a.board_id!)?.name ?? "a board";
    const t = `“${a.card_title ?? "Untitled"}”`;
    switch (a.kind) {
      case "card_completed": return { icon: <CheckCircle2 className="h-4 w-4" />, tone: TONE.emerald, text: `Completed ${t} on ${board}` };
      case "card_moved": return { icon: <ArrowRight className="h-4 w-4" />, tone: TONE.indigo, text: `Moved ${t} from ${a.from_column} to ${a.to_column} on ${board}` };
      case "board_created": return { icon: <LayoutDashboard className="h-4 w-4" />, tone: TONE.amber, text: `Created board ${board}` };
      default: return { icon: <Plus className="h-4 w-4" />, tone: TONE.indigo, text: `Added ${t} to ${a.to_column ?? "a column"} on ${board}` };
    }
  };

  const fullName = String(user?.user_metadata?.full_name || profile?.full_name || "").trim();
  const first = String(user?.user_metadata?.first_name || profile?.first_name || fullName.split(/\s+/)[0] || "").trim();

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section>
          <h1 className="mb-4 text-xl font-semibold md:text-2xl">Welcome back{first ? `, ${first}` : ""}! 👋</h1>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={<ListTodo className="h-4 w-4" />} label="Active cards" value={activeCards} sub="Not yet done, all boards" tone="indigo" />
            <Stat icon={<Gauge className="h-4 w-4" />} label="WIP status" value={wip.value} sub={wipSub} tone={wip.tone} />
            <Stat icon={<TrendingUp className="h-4 w-4" />} label="Weekly velocity" value={velocity} sub="Cards moved to Done in 7 days" tone="emerald" />
            <Stat icon={<Ban className="h-4 w-4" />} label="Blocked" value={blocked} sub={blocked ? "Needs attention" : "Nothing blocked"} tone={blocked ? "rose" : "emerald"} />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">My boards</h2>
                <NewBoardButton />
              </div>
              {boardCards.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">No boards yet — create your first one.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {boardCards.map(({ b, segs, total, used, limit, hasLimit, last }) => {
                    const wipTone = !hasLimit ? "bg-zinc-800 text-zinc-400"
                      : used > limit ? "bg-rose-500/20 text-rose-300"
                      : used === limit && limit > 0 ? "bg-amber-500/20 text-amber-300"
                      : used === 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-400";
                    return (
                      <div key={b.id} className="group relative rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900">
                        <Link href={`/board/${b.id}`} aria-label={`Open ${b.name}`} className="absolute inset-0 rounded-xl" />
                        <div className="pointer-events-none relative z-10">
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <h3 className="min-w-0 truncate font-medium">{b.name}</h3>
                            {b.user_id === user?.id && <PinButton id={b.id} pinned={b.is_pinned} />}
                          </div>
                          <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-zinc-800">
                            {segs.filter((s) => s.n > 0).map((s) => (
                              <div key={s.name} title={`${s.name}: ${s.n}`} className={PALETTE[s.key].dot} style={{ flex: s.n }} />
                            ))}
                          </div>
                          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                            {segs.map((s) => (
                              <span key={s.name} className="flex items-center gap-1">
                                <span className={`h-2 w-2 rounded-full ${PALETTE[s.key].dot}`} />{s.name} {s.n}
                              </span>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-zinc-400">{total} card{total === 1 ? "" : "s"}</span>
                            <span className={`rounded-full px-2 py-0.5 ${wipTone}`}>
                              {hasLimit ? `WIP ${used}/${limit}` : "No WIP limit"}
                            </span>
                            <span className="text-zinc-500">Updated {timeAgo(last)}</span>
                          </div>
                          {b.user_id === user?.id && (
                            <div className="pointer-events-auto mt-3 flex justify-end">
                              <InviteMembersButton boardId={b.id} boardName={b.name} compact />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent activity</h2>
              {feed.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
                  <Inbox className="mx-auto mb-2 h-5 w-5" />No activity yet — add or move a card to get started.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
                  {feed.map((a) => {
                    const d = describe(a);
                    return (
                      <li key={a.id}>
                        <Link href={`/board/${a.board_id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-zinc-800/50">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${d.tone}`}>{d.icon}</span>
                          <span className="min-w-0 flex-1 truncate">{d.text}</span>
                          <span className="shrink-0 text-xs text-zinc-500">{timeAgo(a.created_at)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Urgent &amp; due today</h2>
              {urgent.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
                  <CheckCircle2 className="mx-auto mb-2 h-5 w-5" />Nothing urgent — you&apos;re clear.
                </p>
              ) : (
                <ul className="space-y-2">
                  {urgent.map((c) => {
                    const blockedCard = isBlocked(c);
                    const overdue = c.due_date && c.due_date < today;
                    const dueToday = c.due_date === today;
                    return (
                      <li key={c.id}>
                        <Link href={`/board/${c.board_id}?card=${c.id}`}
                          className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm transition-colors hover:border-zinc-700 hover:bg-zinc-900">
                          <div className="flex items-start gap-2">
                            {blockedCard ? <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                              : c.priority === "urgent" || c.priority === "high" ? <Zap className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                              : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
                            <p className="min-w-0 flex-1 break-words font-medium leading-snug">{c.title}</p>
                          </div>
                          <p className="mt-1 truncate pl-6 text-xs text-zinc-500">From: {boardById.get(c.board_id)?.name} ({colName(c)})</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6 text-[11px]">
                            <PriorityBadge value={c.priority} />
                            {overdue && <span className="flex items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300"><Clock className="h-3 w-3" />Overdue · {c.due_date}</span>}
                            {dueToday && <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300"><Clock className="h-3 w-3" />Due today</span>}
                            {blockedCard && <span className="flex items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300"><Flag className="h-3 w-3" />Blocked</span>}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <FocusWidget />
          </div>
        </div>
      </div>
    </div>
  );
}
