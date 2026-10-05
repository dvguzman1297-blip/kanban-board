export type NotificationType = "board_invite" | "card_assigned" | "card_overdue" | "comment_mention" | "system";
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
  if ((n.type === "card_assigned" || n.type === "card_overdue") && m.board_id) return m.card_id ? `/board/${m.board_id}?card=${m.card_id}` : `/board/${m.board_id}`;
  return null;
}

/** Merge a realtime change into the list, newest first. */
export function applyChange(items: AppNotification[], event: "INSERT" | "UPDATE" | "DELETE", row: Partial<AppNotification> & { id: string }): AppNotification[] {
  if (event === "DELETE") return items.filter((n) => n.id !== row.id);
  const exists = items.some((n) => n.id === row.id);
  const next = exists ? items.map((n) => (n.id === row.id ? { ...n, ...row } : n)) : [row as AppNotification, ...items];
  return next.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export type OverdueCard = { id: string; board_id: string; title: string; due_date: string };

/**
 * Overdue cards shown as notifications. They aren't stored: they're derived from the cards on every load, so they
 * disappear once a card is done, rescheduled or archived. `is_read` is true so they never inflate the unread badge.
 */
export function overdueNotifications(cards: OverdueCard[], boardName: Record<string, string>): AppNotification[] {
  return [...cards].sort((a, b) => a.due_date.localeCompare(b.due_date)).map((c) => ({
    id: `${OVERDUE_PREFIX}${c.id}`, user_id: "", type: "card_overdue" as const, title: "Card overdue",
    message: `“${c.title}” was due ${c.due_date}${boardName[c.board_id] ? ` · ${boardName[c.board_id]}` : ""}`,
    metadata: { board_id: c.board_id, card_id: c.id, card_title: c.title },
    is_read: true, created_at: `${c.due_date}T00:00:00.000Z`,
  }));
}
export const OVERDUE_PREFIX = "overdue:";
