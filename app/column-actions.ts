"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDoneName } from "@/lib/board-utils";
import { checkColumnName, cleanColumnName, MAX_COLUMNS, parseColumnColor, parseWipLimit } from "@/lib/column-rules";

type Result = { error: string } | { ok: true };
const NO_ACCESS = "You don't have permission to edit this board's columns.";
const fail = (error: string): Result => ({ error });

async function boardColumns(supabase: Awaited<ReturnType<typeof createClient>>, boardId: string) {
  const { data } = await supabase.from("columns").select("id, name, order_index, wip_limit").eq("board_id", boardId).order("order_index");
  return (data ?? []) as { id: string; name: string; order_index: number; wip_limit: number | null }[];
}
const doneRefresh = (boardId: string): Result => { revalidatePath(`/board/${boardId}`); revalidatePath("/", "layout"); return { ok: true }; };

export async function addColumn(boardId: string, nameInput: string, wipInput?: number | string | null): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Sign in again.");
  const name = cleanColumnName(nameInput);
  const wip = parseWipLimit(wipInput);
  if ("error" in wip) return fail(wip.error);

  const cols = await boardColumns(supabase, boardId);
  if (cols.length >= MAX_COLUMNS) return fail(`A board can have at most ${MAX_COLUMNS} columns.`);
  const invalid = checkColumnName(name, cols);
  if (invalid) return fail(invalid);

  const order_index = (cols.length ? Math.max(...cols.map((c) => c.order_index)) : 0) + 1000;
  const { error } = await supabase.from("columns").insert({ board_id: boardId, name, order_index, wip_limit: wip.value });
  if (error) return fail(error.code === "42501" ? NO_ACCESS : `Could not add the column: ${error.message}`);
  return doneRefresh(boardId);
}

export async function updateColumn(columnId: string, input: { name?: string; wip_limit?: number | string | null; color?: string | null }): Promise<Result> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("columns").select("id, board_id, name").eq("id", columnId).maybeSingle();
  if (!existing) return fail("Column not found.");

  const patch: { name?: string; wip_limit?: number | null; color?: string | null } = {};
  if (input.name !== undefined) {
    const name = cleanColumnName(input.name);
    if (name !== existing.name) {
      if (isDoneName(existing.name)) return fail("The Done column can't be renamed: it records when cards are completed.");
      const invalid = checkColumnName(name, await boardColumns(supabase, existing.board_id), columnId);
      if (invalid) return fail(invalid);
      patch.name = name;
    }
  }
  if (input.wip_limit !== undefined) {
    const wip = parseWipLimit(input.wip_limit);
    if ("error" in wip) return fail(wip.error);
    patch.wip_limit = wip.value;
  }
  if (input.color !== undefined) {
    const color = parseColumnColor(input.color);
    if ("error" in color) return fail(color.error);
    patch.color = color.value;
  }
  if (!Object.keys(patch).length) return { ok: true };

  const { data, error } = await supabase.from("columns").update(patch).eq("id", columnId).select("id");
  if (error) {
    if (/color/i.test(error.message)) return fail("Column colours need the latest database migration (016_column_color.sql). Run it in Supabase, then try again.");
    return fail(`Could not update the column: ${error.message}`);
  }
  if (!data?.length) return fail(NO_ACCESS); // row-level security hides rows you can't edit instead of raising an error
  return doneRefresh(existing.board_id);
}

/** Saves a new left-to-right order. `orderedIds` must list every column of the board exactly once. */
export async function reorderColumns(boardId: string, orderedIds: string[]): Promise<Result> {
  const supabase = await createClient();
  const cols = await boardColumns(supabase, boardId);
  const ids = Array.isArray(orderedIds) ? orderedIds.map(String) : [];
  if (ids.length !== cols.length || new Set(ids).size !== ids.length || !cols.every((c) => ids.includes(c.id))) {
    return fail("The columns changed in the meantime. Refresh the page and try again.");
  }
  const results = await Promise.all(ids.map((id, i) => supabase.from("columns").update({ order_index: (i + 1) * 1000 }).eq("id", id).select("id")));
  if (results.some((r) => r.error)) return fail("Could not reorder the columns.");
  if (results.some((r) => !r.data?.length)) return fail(NO_ACCESS); // row-level security hides rows you can't edit
  return doneRefresh(boardId);
}

export async function deleteColumn(columnId: string): Promise<Result> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("columns").select("id, board_id, name").eq("id", columnId).maybeSingle();
  if (!existing) return fail("Column not found.");
  if (isDoneName(existing.name)) return fail("The Done column can't be deleted: it records when cards are completed.");

  const cols = await boardColumns(supabase, existing.board_id);
  if (cols.length <= 1) return fail("A board needs at least one column.");
  // Deleting a column cascades to its cards, so only allow it when nothing (archived cards included) would be lost.
  const { count } = await supabase.from("cards").select("id", { count: "exact", head: true }).eq("column_id", columnId);
  if (count) return fail(`This column still has ${count} card${count === 1 ? "" : "s"} (archived ones included). Move or delete ${count === 1 ? "it" : "them"} first.`);

  const { data, error } = await supabase.from("columns").delete().eq("id", columnId).select("id");
  if (error) return fail(`Could not delete the column: ${error.message}`);
  if (!data?.length) return fail(NO_ACCESS);
  return doneRefresh(existing.board_id);
}
