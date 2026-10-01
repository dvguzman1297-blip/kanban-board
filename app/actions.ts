"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/attachments";

// Storage files are not removed by DB cascades, so delete them explicitly first.
async function removeFiles(supabase: Awaited<ReturnType<typeof createClient>>, column: "card_id" | "board_id", id: string) {
  const { data } = await supabase.from("attachments").select("path").eq(column, id);
  const paths = (data ?? []).map((a) => a.path as string);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

const DEFAULT_COLS = [
  { name: "Backlog", wip_limit: null }, { name: "Up Next", wip_limit: null },
  { name: "In Progress", wip_limit: 3 }, { name: "Blocked", wip_limit: null }, { name: "Done", wip_limit: null },
];

export async function createBoard(name: string) {
  const supabase = await createClient();
  const { data: board, error } = await supabase.from("boards").insert({ name }).select("id").single();
  if (error) throw error;
  await supabase.from("columns").insert(
    DEFAULT_COLS.map((c, i) => ({ ...c, board_id: board.id, order_index: (i + 1) * 1000 }))
  );
  revalidatePath("/", "layout");
  redirect(`/board/${board.id}`);
}

export async function renameBoard(id: string, name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("Name required");
  const supabase = await createClient();
  const { error } = await supabase.from("boards").update({ name: clean }).eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}
export async function togglePin(id: string, is_pinned: boolean) {
  const supabase = await createClient();
  await supabase.from("boards").update({ is_pinned }).eq("id", id);
  revalidatePath("/", "layout");
}
export async function archiveBoard(id: string, is_archived: boolean) {
  const supabase = await createClient();
  await supabase.from("boards").update({ is_archived }).eq("id", id);
  revalidatePath("/", "layout");
  if (is_archived) redirect("/");
}
export async function deleteBoard(id: string) {
  const supabase = await createClient();
  await removeFiles(supabase, "board_id", id);
  await supabase.from("boards").delete().eq("id", id); // cascades to columns + cards + attachment rows
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createCard(input: { column_id: string; board_id: string; title: string; order_index: number } & CardAttrs) {
  const supabase = await createClient();
  const { column_id, board_id, title, order_index } = input;
  const { data, error } = await supabase.from("cards")
    .insert({ column_id, board_id, title, order_index, ...pickAttrs(input) }).select().single();
  if (error) throw error;
  return data;
}
type CardAttrs = { priority?: string; energy_level?: string; color?: string | null };

// Only these attributes may be changed through create/move (used by swimlane drops)
function pickAttrs(x: CardAttrs) {
  const out: Record<string, unknown> = {};
  if (x.priority && ["low", "medium", "high", "urgent"].includes(x.priority)) out.priority = x.priority;
  if (x.energy_level && ["low", "medium", "high"].includes(x.energy_level)) out.energy_level = x.energy_level;
  if (x.color !== undefined) out.color = x.color ? String(x.color).slice(0, 20) : null;
  return out;
}

export async function moveCard(id: string, column_id: string, order_index: number, extra: CardAttrs = {}) {
  const supabase = await createClient();
  const [{ data: col }, { data: cur }] = await Promise.all([
    supabase.from("columns").select("name").eq("id", column_id).single(),
    supabase.from("cards").select("completed_at").eq("id", id).single(),
  ]);
  const done = (col?.name ?? "").trim().toLowerCase() === "done";
  const patch: Record<string, unknown> = { column_id, order_index, ...pickAttrs(extra) };
  patch.completed_at = done ? (cur?.completed_at ?? new Date().toISOString()) : null;
  const { error } = await supabase.from("cards").update(patch).eq("id", id);
  if (error) throw error;
}
export async function updateCard(id: string, patch: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase.from("cards").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteCard(id: string) {
  const supabase = await createClient();
  await removeFiles(supabase, "card_id", id);
  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) throw error;
}

// Global "Quick Task": validates the target column and appends the card at the bottom of it.
export async function quickCreateCard(input: {
  board_id: string; column_id: string; title: string; priority?: string; energy_level?: string; due_date?: string | null;
}) {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("A title is required.");
  const supabase = await createClient();

  const { data: col } = await supabase.from("columns").select("id").eq("id", input.column_id).eq("board_id", input.board_id).maybeSingle();
  if (!col) throw new Error("That column does not belong to the chosen board.");

  const { data: last } = await supabase.from("cards").select("order_index").eq("column_id", input.column_id)
    .order("order_index", { ascending: false }).limit(1);
  const order_index = (last?.[0]?.order_index ?? 0) + 1000;
  const due_date = input.due_date && /^\d{4}-\d{2}-\d{2}$/.test(input.due_date) ? input.due_date : null;

  const { data, error } = await supabase.from("cards")
    .insert({ board_id: input.board_id, column_id: input.column_id, title, order_index, due_date, ...pickAttrs(input) })
    .select("id").single();
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath(`/board/${input.board_id}`);
  return data;
}
