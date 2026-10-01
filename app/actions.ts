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

export async function createCard(input: { column_id: string; board_id: string; title: string; order_index: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cards").insert(input).select().single();
  if (error) throw error;
  return data;
}
export async function moveCard(id: string, column_id: string, order_index: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("cards").update({ column_id, order_index }).eq("id", id);
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
