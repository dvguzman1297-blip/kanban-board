"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MemberRow = { userId: string; name: string; email: string | null; avatarUrl: string | null; role: "admin" | "editor" | "viewer" };
export type InviteRow = { id: string; email: string; role: string; expiresAt: string };
export type MembersResult =
  | { ok: true; members: MemberRow[]; invites: InviteRow[] }
  | { ok: false; error: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Every action below is owner-only; RLS enforces the same rule in the database.
async function requireOwner(boardId: string): Promise<{ supabase: Supabase } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  const { data: board } = await supabase.from("boards").select("user_id").eq("id", boardId).maybeSingle();
  if (!board || board.user_id !== user.id) return { error: "Only the board owner can manage members." };
  return { supabase };
}

export async function listBoardMembers(boardId: string): Promise<MembersResult> {
  const auth = await requireOwner(boardId);
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const [{ data: rows, error }, { data: invites }] = await Promise.all([
    supabase.from("board_members").select("user_id, role").eq("board_id", boardId).eq("status", "accepted").order("invited_at"),
    supabase.from("board_invites").select("id, email, role, expires_at").eq("board_id", boardId).gt("expires_at", new Date().toISOString()).order("created_at"),
  ]);
  if (error) return { ok: false, error: "Could not load members." };

  const ids = (rows ?? []).map((r) => r.user_id as string);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, email, first_name, full_name, display_name, avatar_url").in("id", ids)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return {
    ok: true,
    members: (rows ?? []).map((r) => {
      const p = byId.get(r.user_id as string);
      return {
        userId: r.user_id as string,
        name: (p?.display_name || p?.full_name || p?.first_name || p?.email || "Member") as string,
        email: (p?.email as string | null) ?? null,
        avatarUrl: (p?.avatar_url as string | null) ?? null,
        role: r.role as MemberRow["role"],
      };
    }),
    invites: (invites ?? []).map((i) => ({ id: i.id as string, email: i.email as string, role: i.role as string, expiresAt: i.expires_at as string })),
  };
}

export async function updateMemberRole(boardId: string, userId: string, role: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (role !== "editor" && role !== "viewer") return { ok: false, error: "Choose Editor or Viewer." };
  const auth = await requireOwner(boardId);
  if ("error" in auth) return { ok: false, error: auth.error };
  const { data, error } = await auth.supabase.from("board_members").update({ role })
    .eq("board_id", boardId).eq("user_id", userId).select("user_id");
  if (error || !data?.length) return { ok: false, error: "Could not change that member's role." };
  revalidatePath(`/board/${boardId}`);
  return { ok: true };
}

/** Removes a member and clears their card assignments on this board. Returns how many cards were unassigned. */
export async function removeBoardMember(boardId: string, userId: string): Promise<{ ok: true; unassigned: number } | { ok: false; error: string }> {
  const auth = await requireOwner(boardId);
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data: removed, error } = await supabase.from("board_members").delete()
    .eq("board_id", boardId).eq("user_id", userId).select("user_id");
  if (error || !removed?.length) return { ok: false, error: "Could not remove that member." };

  const { data: freed } = await supabase.from("cards").update({ assignee_id: null })
    .eq("board_id", boardId).eq("assignee_id", userId).select("id");
  revalidatePath(`/board/${boardId}`);
  revalidatePath("/dashboard");
  return { ok: true, unassigned: freed?.length ?? 0 };
}

export async function cancelBoardInvite(boardId: string, inviteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOwner(boardId);
  if ("error" in auth) return { ok: false, error: auth.error };
  const { error } = await auth.supabase.from("board_invites").delete().eq("id", inviteId).eq("board_id", boardId);
  if (error) return { ok: false, error: "Could not cancel that invitation." };
  return { ok: true };
}
