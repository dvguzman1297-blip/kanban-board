"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/attachments";
import { isDoneName } from "@/lib/board-utils";
import type { CardTemplate, Subtask } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const MAX_BULK = 200;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanIds(ids: string[]): string[] | null {
  const unique = [...new Set(ids)];
  return unique.length && unique.length <= MAX_BULK && unique.every((i) => uuid.test(i)) ? unique : null;
}

// RLS decides what the user may touch; every query below also pins the ids to one board.
async function loadCards(ids: string[]) {
  const supabase = await createClient();
  const { data } = await supabase.from("cards").select("id, board_id, column_id, completed_at").in("id", ids);
  const boards = new Set((data ?? []).map((c) => c.board_id as string));
  return { supabase, cards: data ?? [], boardId: boards.size === 1 ? [...boards][0] : null };
}

export async function bulkMoveCards(idsIn: string[], columnId: string): Promise<Result> {
  const ids = cleanIds(idsIn);
  if (!ids || !uuid.test(columnId)) return { ok: false, error: "Nothing to move." };
  const { supabase, cards, boardId } = await loadCards(ids);
  if (!cards.length || !boardId) return { ok: false, error: "Select cards from a single board." };

  const { data: col } = await supabase.from("columns").select("id, name").eq("id", columnId).eq("board_id", boardId).maybeSingle();
  if (!col) return { ok: false, error: "That column is not on this board." };

  const { data: last } = await supabase.from("cards").select("order_index").eq("column_id", columnId).order("order_index", { ascending: false }).limit(1);
  const base = (last?.[0]?.order_index ?? 0) as number;
  const done = isDoneName(col.name);
  const now = new Date().toISOString();

  const results = await Promise.all(cards.map((c, i) =>
    supabase.from("cards").update({
      column_id: columnId, order_index: base + (i + 1) * 1000,
      completed_at: done ? (c.completed_at ?? now) : null,
    }).eq("id", c.id)));
  if (results.some((r) => r.error)) return { ok: false, error: "Some cards could not be moved." };
  revalidatePath(`/board/${boardId}`);
  return { ok: true };
}

export type BulkPatch = { due_date?: string | null; assignee_id?: string | null; archived?: boolean };

export async function bulkUpdateCards(idsIn: string[], patch: BulkPatch): Promise<Result> {
  const ids = cleanIds(idsIn);
  if (!ids) return { ok: false, error: "Nothing selected." };
  const update: Record<string, unknown> = {};
  if ("due_date" in patch) {
    if (patch.due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(patch.due_date ?? "")) return { ok: false, error: "Invalid date." };
    update.due_date = patch.due_date;
  }
  if ("assignee_id" in patch) {
    if (patch.assignee_id !== null && !uuid.test(patch.assignee_id ?? "")) return { ok: false, error: "Invalid assignee." };
    update.assignee_id = patch.assignee_id; // membership is enforced by a DB trigger
  }
  if (patch.archived !== undefined) update.archived_at = patch.archived ? new Date().toISOString() : null;
  if (!Object.keys(update).length) return { ok: false, error: "Nothing to change." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("cards").update(update).in("id", ids).select("id, board_id");
  if (error) return { ok: false, error: error.message.includes("Assignee") ? "That person is not a member of this board." : "Could not update the cards." };
  const board = data?.[0]?.board_id;
  if (board) revalidatePath(`/board/${board}`);
  return { ok: true };
}

export async function bulkTagCards(idsIn: string[], tagId: string, add: boolean): Promise<Result> {
  const ids = cleanIds(idsIn);
  if (!ids || !uuid.test(tagId)) return { ok: false, error: "Nothing selected." };
  const supabase = await createClient();
  if (add) {
    // Plain insert of the missing pairs (RLS also requires card and tag to share a board).
    const { data: have } = await supabase.from("card_tags").select("card_id").eq("tag_id", tagId).in("card_id", ids);
    const haveIds = new Set((have ?? []).map((r) => r.card_id as string));
    const rows = ids.filter((id) => !haveIds.has(id)).map((card_id) => ({ card_id, tag_id: tagId }));
    if (rows.length) {
      const { error } = await supabase.from("card_tags").insert(rows);
      if (error) return { ok: false, error: "Could not add the tag." };
    }
  } else {
    const { error } = await supabase.from("card_tags").delete().eq("tag_id", tagId).in("card_id", ids);
    if (error) return { ok: false, error: "Could not remove the tag." };
  }
  return { ok: true };
}

export async function bulkDeleteCards(idsIn: string[]): Promise<Result<{ deleted: string[] }>> {
  const ids = cleanIds(idsIn);
  if (!ids) return { ok: false, error: "Nothing selected." };
  const supabase = await createClient();
  // Storage files are not removed by DB cascades, so delete them first.
  const { data: atts } = await supabase.from("attachments").select("path").in("card_id", ids);
  const paths = (atts ?? []).map((a) => a.path as string);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { data, error } = await supabase.from("cards").delete().in("id", ids).select("id, board_id");
  if (error) return { ok: false, error: "Could not delete the cards." };
  const board = data?.[0]?.board_id;
  if (board) revalidatePath(`/board/${board}`);
  return { ok: true, deleted: (data ?? []).map((c) => c.id as string) };
}

/* ---------------- templates ---------------- */
const cleanSubtasks = (subs: Subtask[]) =>
  (subs ?? []).slice(0, 50).map((s) => ({ id: crypto.randomUUID(), title: String(s.title ?? "").trim().slice(0, 200), done: false })).filter((s) => s.title);

export async function saveCardAsTemplate(cardId: string, nameIn: string): Promise<Result<{ template: CardTemplate }>> {
  const name = nameIn.trim().slice(0, 60);
  if (!name) return { ok: false, error: "Name the template." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("board_id, title, description, priority, energy_level, subtasks").eq("id", cardId).maybeSingle();
  if (!card) return { ok: false, error: "Card not found." };
  const { data, error } = await supabase.from("card_templates").insert({
    board_id: card.board_id, name, title: card.title, description: card.description,
    priority: card.priority, energy_level: card.energy_level, subtasks: cleanSubtasks(card.subtasks as Subtask[]),
  }).select().single();
  if (error) return { ok: false, error: "Could not save the template." };
  return { ok: true, template: data as CardTemplate };
}

export async function deleteCardTemplate(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("card_templates").delete().eq("id", id);
  return error ? { ok: false, error: "Could not delete the template." } : { ok: true };
}
