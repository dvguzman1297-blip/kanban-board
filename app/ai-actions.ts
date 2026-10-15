"use server";
import { createClient } from "@/lib/supabase/server";
import {
  chatCompletion, MAX_HISTORY, MAX_MESSAGE_CHARS, rateLimited, systemPrompt, toolsFor,
  type ChatMessage, type ModelMessage, type Scope,
} from "@/lib/ai";
import { memberName } from "@/lib/board-stats";
import { isDoneName } from "@/lib/board-utils";
import type { Card, Column } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type BoardRow = { id: string; name: string; user_id: string };
const MAX_TOOL_ROUNDS = 5;
const MAX_BOARDS = 40;
const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const limitOf = (v: unknown, def = 20) => Math.min(Math.max(Number(v) || def, 1), 50);

type Ctx = {
  supabase: Supabase; today: string; boards: BoardRow[]; columns: Column[];
  nameOf: (id: string | null | undefined) => string;
  cardBoard: Map<string, string>; // card id -> board id, so short card:ID links can be turned into real URLs
};
const boardUrl = (boardId: string, cardId?: string) => `/board/${boardId}${cardId ? `?card=${cardId}` : ""}`;
const remember = (ctx: Ctx, c: { id: string; board_id: string }) => { ctx.cardBoard.set(c.id, c.board_id); return c.id; };
/** The model links cards as (card:ID) and boards as (board:ID) to save tokens; swap in the real URLs, dropping links it made up. */
const linkify = (ctx: Ctx, text: string) => text
  .replace(/\]\(card:([0-9a-f-]{36})\)/gi, (_m, id: string) => { const b = ctx.cardBoard.get(id.toLowerCase()); return b ? `](${boardUrl(b, id.toLowerCase())})` : "]()"; })
  .replace(/\]\(board:([0-9a-f-]{36})\)/gi, (_m, id: string) => ctx.boards.some((b) => b.id === id.toLowerCase()) ? `](${boardUrl(id.toLowerCase())})` : "]()")
  .replace(/\[([^\]]*)\]\(\)/g, "$1")
  .replace(/\s*<br\s*\/?>\s*/gi, "; "); // the renderer shows raw HTML as text, and the model sometimes uses <br> in table cells
const boardName = (ctx: Ctx, id: string | null) => ctx.boards.find((b) => b.id === id)?.name ?? "Unknown board";

/** Boards matching an optional partial-name filter; unknown filter matches nothing. */
function boardIdsFor(ctx: Ctx, filter: unknown): string[] {
  const q = typeof filter === "string" ? filter.trim().toLowerCase() : "";
  return ctx.boards.filter((b) => !q || b.name.toLowerCase().includes(q)).map((b) => b.id);
}

async function fetchCards(ctx: Ctx, boardIds: string[]) {
  if (!boardIds.length) return [];
  const { data } = await ctx.supabase.from("cards").select("*").in("board_id", boardIds).is("archived_at", null).order("order_index").limit(1500);
  return (data ?? []) as Card[];
}

async function listCards(ctx: Ctx, args: Record<string, unknown>) {
  const cards = await fetchCards(ctx, boardIdsFor(ctx, args.board));
  const colName = new Map(ctx.columns.map((c) => [c.id, c.name]));
  const status = String(args.status ?? "open");
  const column = typeof args.column === "string" ? args.column.trim().toLowerCase() : "";
  const assignee = typeof args.assignee === "string" ? args.assignee.trim().toLowerCase() : "";
  const search = typeof args.search === "string" ? args.search.trim().toLowerCase() : "";

  const matches = cards.filter((c) => {
    const col = colName.get(c.column_id) ?? "";
    const done = isDoneName(col);
    if (status === "open" && done) return false;
    if (status === "done" && !done) return false;
    if (status === "overdue" && (done || !c.due_date || c.due_date >= ctx.today)) return false;
    if (column && col.toLowerCase() !== column) return false;
    if (assignee === "none" ? !!c.assignee_id : assignee && !ctx.nameOf(c.assignee_id).toLowerCase().includes(assignee)) return false;
    if (typeof args.priority === "string" && c.priority !== args.priority) return false;
    if (isDate(args.due_before) && !(c.due_date && c.due_date <= args.due_before)) return false;
    if (isDate(args.due_after) && !(c.due_date && c.due_date >= args.due_after)) return false;
    if (isDate(args.completed_since) && !(c.completed_at && c.completed_at.slice(0, 10) >= args.completed_since)) return false;
    if (search && !`${c.title} ${c.description ?? ""}`.toLowerCase().includes(search)) return false;
    return true;
  });

  return {
    total_matches: matches.length,
    cards: matches.slice(0, limitOf(args.limit)).map((c) => ({
      id: remember(ctx, c), title: clip(c.title, 100), board: ctx.boards.length > 1 ? boardName(ctx, c.board_id) : undefined,
      column: colName.get(c.column_id), priority: c.priority, assignee: c.assignee_id ? ctx.nameOf(c.assignee_id) : null,
      due: c.due_date ? `${c.due_date}${c.due_time ? ` ${c.due_time.slice(0, 5)}` : ""}` : null,
      subtasks: c.subtasks?.length ? `${c.subtasks.filter((s) => s.done).length}/${c.subtasks.length}` : undefined,
      completed: c.completed_at?.slice(0, 10),
    })),
  };
}

async function getCard(ctx: Ctx, args: Record<string, unknown>) {
  const id = String(args.card_id ?? "");
  const { data: card } = await ctx.supabase.from("cards").select("*").eq("id", id).in("board_id", ctx.boards.map((b) => b.id)).maybeSingle();
  if (!card) return { error: "Card not found." };
  const { data: comments } = await ctx.supabase.from("card_comments").select("user_id, content, created_at").eq("card_id", id).order("created_at", { ascending: false }).limit(10);
  const c = card as Card;
  return {
    id: remember(ctx, c), title: c.title, board: ctx.boards.length > 1 ? boardName(ctx, c.board_id) : undefined,
    column: ctx.columns.find((x) => x.id === c.column_id)?.name, priority: c.priority,
    assignee: c.assignee_id ? ctx.nameOf(c.assignee_id) : null, created_by: ctx.nameOf(c.user_id),
    start: c.start_date ?? null, due: c.due_date ?? null, completed: c.completed_at ?? null, archived: !!c.archived_at,
    description: clip(c.description, 1200),
    subtasks: (c.subtasks ?? []).map((s) => `${s.done ? "[x]" : "[ ]"} ${clip(s.title, 100)}`),
    recent_comments: (comments ?? []).map((m) => ({ by: ctx.nameOf(m.user_id as string), at: String(m.created_at).slice(0, 10), text: clip(m.content as string, 300) })),
  };
}

async function recentActivity(ctx: Ctx, args: Record<string, unknown>) {
  const ids = boardIdsFor(ctx, args.board);
  if (!ids.length) return { events: [] };
  const since = isDate(args.since) ? args.since : new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const { data } = await ctx.supabase.from("activity").select("user_id, board_id, card_id, card_title, kind, from_column, to_column, created_at")
    .in("board_id", ids).gte("created_at", since).order("created_at", { ascending: false }).limit(limitOf(args.limit));
  return {
    events: (data ?? []).map((a) => ({
      when: String(a.created_at).slice(0, 16).replace("T", " "), by: ctx.nameOf(a.user_id as string), what: a.kind,
      card: clip(a.card_title as string, 120), board: boardName(ctx, a.board_id as string),
      from: a.from_column, to: a.to_column, card_id: a.card_id ? remember(ctx, { id: a.card_id as string, board_id: a.board_id as string }) : undefined,
    })),
  };
}

async function listBoards(ctx: Ctx) {
  const cards = await fetchCards(ctx, ctx.boards.map((b) => b.id));
  const done = new Set(ctx.columns.filter((c) => isDoneName(c.name)).map((c) => c.id));
  return {
    boards: ctx.boards.map((b) => {
      const mine = cards.filter((c) => c.board_id === b.id);
      return { id: b.id, name: b.name, open_cards: mine.filter((c) => !done.has(c.column_id)).length, total_cards: mine.length };
    }),
  };
}

async function runTool(ctx: Ctx, name: string, rawArgs: string): Promise<string> {
  let args: Record<string, unknown> = {};
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { return JSON.stringify({ error: "Invalid arguments." }); }
  try {
    if (name === "list_cards") return JSON.stringify(await listCards(ctx, args));
    if (name === "get_card") return JSON.stringify(await getCard(ctx, args));
    if (name === "recent_activity") return JSON.stringify(await recentActivity(ctx, args));
    if (name === "list_boards") return JSON.stringify(await listBoards(ctx));
  } catch {
    return JSON.stringify({ error: "Lookup failed." });
  }
  return JSON.stringify({ error: `Unknown tool ${name}.` });
}

/** Read-only chat about one board or all boards. Runs as the signed-in user, so RLS limits what the model can see. */
export async function askAi(scope: Scope, history: ChatMessage[], today: string): Promise<{ text: string } | { error: string }> {
  const turns = (Array.isArray(history) ? history : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  const boardId = scope?.boardId ?? null;
  if (!turns.length || turns[turns.length - 1].role !== "user" || !isDate(today) || (boardId !== null && typeof boardId !== "string")) return { error: "Invalid request." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (rateLimited(user.id)) return { error: "You've reached the limit for now. Try again in a few minutes." };

  const boardQuery = supabase.from("boards").select("id, name, user_id").eq("is_archived", false).order("created_at").limit(MAX_BOARDS);
  const { data: boardRows } = await (boardId ? boardQuery.eq("id", boardId) : boardQuery);
  const boards = (boardRows ?? []) as BoardRow[];
  if (!boards.length) return { error: boardId ? "Board not found." : "You don't have any boards yet." };
  const ids = boards.map((b) => b.id);

  const [{ data: columns }, { data: memberRows }] = await Promise.all([
    supabase.from("columns").select("*").in("board_id", ids).order("order_index"),
    supabase.from("board_members").select("user_id").in("board_id", ids).eq("status", "accepted"),
  ]);
  const memberIds = [...new Set([...boards.map((b) => b.user_id), ...(memberRows ?? []).map((m) => m.user_id as string)])];
  const { data: profiles } = await supabase.from("profiles").select("id, first_name, full_name, display_name").in("id", memberIds);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, memberName(p)]));
  const cols = (columns ?? []) as Column[];
  const ctx: Ctx = { supabase, today, boards, columns: cols, nameOf: (id) => (id && names.get(id)) || "Unknown", cardBoard: new Map() };

  const tools = toolsFor({ boardId });
  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt({ boardId }, today, boards.map((b) => ({ name: b.name, columns: cols.filter((c) => c.board_id === b.id).map((c) => c.name) })), [...new Set(names.values())]) },
    ...turns,
  ];
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const reply = await chatCompletion(messages, round < MAX_TOOL_ROUNDS ? tools : null);
      if (!reply.tool_calls?.length) {
        const text = reply.content?.trim();
        return text ? { text: linkify(ctx, text) } : { error: "The AI returned an empty response." };
      }
      messages.push({ role: "assistant", content: reply.content ?? null, tool_calls: reply.tool_calls });
      for (const call of reply.tool_calls) {
        messages.push({ role: "tool", tool_call_id: call.id, content: await runTool(ctx, call.function.name, call.function.arguments) });
      }
    }
    return { error: "That took too many steps. Try a narrower question." };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "AI request failed." };
  }
}
