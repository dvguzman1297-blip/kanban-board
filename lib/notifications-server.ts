import type { createClient } from "@/lib/supabase/server";
import type { InviteStatus } from "@/lib/notifications";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Records the outcome on the invitee's invitation notification(s) and marks them read.
 * Find them by notification id and/or invite id (the email-link flow only knows the invite).
 * Must run BEFORE the invite row is deleted, otherwise the delete trigger marks it "cancelled".
 */
export async function resolveInviteNotifications(
  supabase: Supabase, userId: string, status: InviteStatus, ref: { notificationId?: string; inviteId?: string },
) {
  let q = supabase.from("notifications").select("id, metadata").eq("user_id", userId).eq("type", "board_invite");
  if (ref.notificationId) q = q.eq("id", ref.notificationId);
  else if (ref.inviteId) q = q.eq("metadata->>invite_id", ref.inviteId);
  else return;
  const { data } = await q;
  await Promise.all((data ?? []).map((n) =>
    supabase.from("notifications").update({ is_read: true, metadata: { ...(n.metadata as object), status } }).eq("id", n.id)));
}
