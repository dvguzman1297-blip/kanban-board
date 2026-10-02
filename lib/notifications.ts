export type NotificationType = "board_invite" | "card_assigned" | "comment_mention" | "system";
export type InviteStatus = "accepted" | "declined" | "cancelled";

export type NotificationMeta = {
  board_id?: string; board_name?: string | null; invite_id?: string; inviter_id?: string | null; inviter_name?: string;
  role?: string; status?: InviteStatus; card_id?: string; card_title?: string; assigner_name?: string;
};

export type AppNotification = {
  id: string; user_id: string; type: NotificationType; title: string; message: string;
  metadata: NotificationMeta; is_read: boolean; created_at: string;
};

export const roleLabel = (role?: string) => (role === "viewer" ? "Viewer" : role === "admin" ? "Admin" : "Editor");

/** The pieces of "Dave invited you to collaborate on Main Operations as Editor" (bold parts rendered by the UI). */
export function inviteParts(m: NotificationMeta) {
  return { inviter: m.inviter_name || "Someone", board: m.board_name || "a board", role: roleLabel(m.role) };
}

export const unreadCount = (items: AppNotification[]) => items.filter((n) => !n.is_read).length;

/** Where clicking a notification should go (invites have their own buttons). */
export function notificationHref(n: AppNotification): string | null {
  const m = n.metadata;
  if (n.type === "card_assigned" && m.board_id) return m.card_id ? `/board/${m.board_id}?card=${m.card_id}` : `/board/${m.board_id}`;
  return null;
}

/** Merge a realtime change into the list, newest first. */
export function applyChange(items: AppNotification[], event: "INSERT" | "UPDATE" | "DELETE", row: Partial<AppNotification> & { id: string }): AppNotification[] {
  if (event === "DELETE") return items.filter((n) => n.id !== row.id);
  const exists = items.some((n) => n.id === row.id);
  const next = exists ? items.map((n) => (n.id === row.id ? { ...n, ...row } : n)) : [row as AppNotification, ...items];
  return next.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
