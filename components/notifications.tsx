"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Check, Loader2, MailPlus, UserCheck, Bell, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { acceptBoardInviteAction, declineBoardInviteAction } from "@/app/notification-actions";
import { useToast } from "@/components/toast";
import { applyChange, inviteParts, notificationHref, unreadCount, type AppNotification } from "@/lib/notifications";
import { timeAgo } from "@/lib/time";

/** Notification state for the signed-in user, kept live through Supabase Realtime. */
export function useNotifications(userId: string, initial: AppNotification[]) {
  const [items, setItems] = useState(initial);
  const toast = useToast();
  // The bell and the /notifications page both call this hook. Supabase hands back the SAME channel for a repeated topic,
  // and adding listeners to an already-subscribed channel throws, so every instance gets its own topic.
  const instance = useId();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`notifications:${userId}:${instance}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const event = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        const row = (event === "DELETE" ? payload.old : payload.new) as AppNotification;
        if (!row?.id) return;
        setItems((cur) => applyChange(cur, event, row));
        if (event === "INSERT") toastRef.current(row.type === "board_invite" ? `${inviteParts(row.metadata).inviter} invited you to ${inviteParts(row.metadata).board}` : row.message || row.title, "info");
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, instance]);

  const patch = (id: string, change: Partial<AppNotification>) => setItems((cur) => cur.map((n) => (n.id === id ? { ...n, ...change } : n)));
  const markRead = (id: string) => {
    patch(id, { is_read: true });
    void createClient().from("notifications").update({ is_read: true }).eq("id", id);
  };
  const markAllRead = () => {
    setItems((cur) => cur.map((n) => ({ ...n, is_read: true })));
    void createClient().from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
  };
  return { items, unread: unreadCount(items), patch, markRead, markAllRead };
}

const ICON = { board_invite: MailPlus, card_assigned: UserCheck, comment_mention: AtSign, system: Bell } as const;

export function NotificationItem({ n, onRead, onPatch, onNavigate }: {
  n: AppNotification; onRead: (id: string) => void; onPatch: (id: string, c: Partial<AppNotification>) => void; onNavigate?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const Icon = ICON[n.type] ?? Bell;
  const m = n.metadata;

  const accept = async () => {
    setBusy("accept"); setError(null);
    const res = await acceptBoardInviteAction(m.invite_id ?? "", n.id).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy(null);
    if (!res.ok) return setError(res.error);
    onPatch(n.id, { is_read: true, metadata: { ...m, status: "accepted" } });
    toast(`You have joined ${res.boardName}!`, "success");
    onNavigate?.();
    router.push(`/board/${res.boardId}`);
    router.refresh(); // the sidebar's board list comes from the server layout
  };
  const decline = async () => {
    setBusy("decline"); setError(null);
    const res = await declineBoardInviteAction(m.invite_id ?? "", n.id).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy(null);
    if (!res.ok) return setError(res.error);
    onPatch(n.id, { is_read: true, metadata: { ...m, status: "declined" } });
  };

  const shell = `flex gap-3 rounded-xl px-3 py-3 text-sm ${n.is_read ? "" : "bg-indigo-500/10"}`;
  const icon = (
    <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300"><Icon className="h-4 w-4" /></span>
  );
  const time = <time dateTime={n.created_at} title={new Date(n.created_at).toLocaleString()} className="text-xs text-zinc-500">{timeAgo(n.created_at)}</time>;

  if (n.type === "board_invite") {
    const { inviter, board, role } = inviteParts(m);
    const done = m.status;
    return (
      <li className={shell}>
        {icon}
        <div className="min-w-0 flex-1">
          <p className="break-words leading-snug">
            <strong className="font-semibold">{inviter}</strong> invited you to collaborate on <strong className="font-semibold">{board}</strong> as {role}
          </p>
          <div className="mt-1">{time}</div>
          {done ? (
            <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
              done === "accepted" ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-700/60 text-zinc-300"}`}>
              {done === "accepted" && <Check className="h-3 w-3" />}{done === "accepted" ? "Accepted" : done === "declined" ? "Declined" : "Cancelled"}
            </span>
          ) : (
            <div className="mt-2 flex gap-2">
              <button onClick={accept} disabled={busy !== null} className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
                {busy === "accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accept
              </button>
              <button onClick={decline} disabled={busy !== null} className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60">
                {busy === "decline" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}Decline
              </button>
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-xs text-rose-400">{error}</p>}
        </div>
        {!n.is_read && !done && <span aria-label="Unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />}
      </li>
    );
  }

  const href = notificationHref(n);
  const body = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{n.title}</p>
        {n.message && <p className="break-words text-zinc-400">{n.message}</p>}
        <div className="mt-1">{time}</div>
      </div>
      {!n.is_read && <span aria-label="Unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />}
    </>
  );
  return (
    <li>
      {href
        ? <Link href={href} onClick={() => { onRead(n.id); onNavigate?.(); }} className={`${shell} hover:bg-zinc-800`}>{body}</Link>
        : <button onClick={() => onRead(n.id)} className={`${shell} w-full text-left hover:bg-zinc-800`}>{body}</button>}
    </li>
  );
}

export function NotificationList({ items, onRead, onPatch, onNavigate, empty }: {
  items: AppNotification[]; onRead: (id: string) => void; onPatch: (id: string, c: Partial<AppNotification>) => void; onNavigate?: () => void; empty?: string;
}) {
  if (!items.length) return <p className="px-3 py-6 text-center text-sm text-zinc-500">{empty ?? "No notifications yet."}</p>;
  return <ul className="space-y-1">{items.map((n) => <NotificationItem key={n.id} n={n} onRead={onRead} onPatch={onPatch} onNavigate={onNavigate} />)}</ul>;
}
