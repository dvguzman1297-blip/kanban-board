"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Sets how long cards may sit in Done before being archived (null = never) and applies it right away. */
export async function setBoardAutoArchive(boardId: string, days: number | null): Promise<{ ok: true; archived: number } | { ok: false; error: string }> {
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) return { ok: false, error: "Choose a number of days between 1 and 365." };
  const supabase = await createClient();
  // The boards update policy limits this to the owner and admins.
  const { data, error } = await supabase.from("boards").update({ auto_archive_days: days }).eq("id", boardId).select("id");
  if (error || !data?.length) return { ok: false, error: "Only the board owner or an admin can change this." };
  const { data: archived } = await supabase.rpc("sweep_board_archive", { target_board_id: boardId });
  revalidatePath(`/board/${boardId}`);
  return { ok: true, archived: typeof archived === "number" ? archived : 0 };
}
