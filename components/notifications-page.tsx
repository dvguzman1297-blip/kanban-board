"use client";
import { NotificationList, useNotifications } from "@/components/notifications";
import type { AppNotification } from "@/lib/notifications";

export function NotificationsPage({ userId, initial }: { userId: string; initial: AppNotification[] }) {
  const { items, unread, patch, markRead, markAllRead } = useNotifications(userId, initial);
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold md:text-2xl">Notifications</h1>
            <p className="text-sm text-zinc-500">{unread ? `${unread} unread` : "You’re all caught up."}</p>
          </div>
          {unread > 0 && <button onClick={markAllRead} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">Mark all as read</button>}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2">
          <NotificationList items={items} onRead={markRead} onPatch={patch} />
        </div>
      </div>
    </div>
  );
}
