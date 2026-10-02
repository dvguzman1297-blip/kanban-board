"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveInviteNotifications } from "@/lib/notifications-server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadInvite(inviteId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Your session expired. Sign in again." } as const;
  if (!uuid.test(inviteId)) return { error: "This invitation is no longer available." } as const;
  // RLS only lets the invited email read the invite.
  const { data: invite } = await supabase.from("board_invites").select("id, board_id, email, role, expires_at").eq("id", inviteId).maybeSingle();
  if (!invite || invite.email.toLowerCase() !== user.email.toLowerCase()) return { error: "This invitation is no longer available." } as const;
  return { supabase, user, invite } as const;
}

export async function acceptBoardInviteAction(inviteId: string, notificationId: string): Promise<Result<{ boardId: string; boardName: string }>> {
  const ctx = await loadInvite(inviteId);
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Something went wrong." };
  const { supabase, user, invite } = ctx;
  if (new Date(invite.expires_at) <= new Date()) return { ok: false, error: "This invitation has expired. Ask the board owner to send a new one." };

  // Joining = a board_members row; the "invite_accept" RLS policy checks the invite matches this user's email and role.
  const { error } = await supabase.from("board_members").insert({ board_id: invite.board_id, user_id: user.id, role: invite.role, status: "accepted" });
  if (error && error.code !== "23505") return { ok: false, error: "Could not join this board." }; // 23505 = already a member

  // Read the name only now: before joining, RLS hides the board from the invitee.
  const { data: board } = await supabase.from("boards").select("name").eq("id", invite.board_id).maybeSingle();
  await resolveInviteNotifications(supabase, user.id, "accepted", { notificationId });
  await supabase.from("board_invites").delete().eq("id", invite.id);
  revalidatePath("/", "layout");
  return { ok: true, boardId: invite.board_id as string, boardName: (board?.name as string | undefined) ?? "the board" };
}

export async function declineBoardInviteAction(inviteId: string, notificationId: string): Promise<Result> {
  const ctx = await loadInvite(inviteId);
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Something went wrong." };
  const { supabase, user, invite } = ctx;
  await resolveInviteNotifications(supabase, user.id, "declined", { notificationId });
  const { error } = await supabase.from("board_invites").delete().eq("id", invite.id);
  if (error) return { ok: false, error: "Could not decline this invitation." };
  revalidatePath("/", "layout");
  return { ok: true };
}
