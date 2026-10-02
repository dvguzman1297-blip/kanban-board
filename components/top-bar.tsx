"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Plus, Search, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { QuickTaskModal } from "@/components/quick-task-modal";
import { NotificationList, useNotifications } from "@/components/notifications";
import type { AppNotification } from "@/lib/notifications";

type Board = { id: string; name: string; is_archived: boolean };
export type Alert = { text: string; href: string; tone: "rose" | "amber" };

function Popover({ button, children, wide = false }: { wide?: boolean; button: (open: boolean, toggle: () => void) => React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {button(open, () => setOpen((o) => !o))}
      {open && (
        <div className={`absolute right-0 top-11 z-50 rounded-xl border border-zinc-800 bg-zinc-900 p-2 shadow-xl ${wide ? "w-[26rem] max-w-[calc(100vw-1rem)]" : "w-72"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function TopBar({ boards, alerts, email, displayName, avatarUrl, userId, initialNotifications }: { boards: Board[]; alerts: Alert[]; email: string; displayName: string; avatarUrl: string | null; userId: string; initialNotifications: AppNotification[] }) {
  const { items: notes, unread, patch, markRead, markAllRead } = useNotifications(userId, initialNotifications);
  const badge = unread + alerts.length;
  const [palette, setPalette] = useState(false);
  const [quick, setQuick] = useState(false);
  const active = boards.filter((b) => !b.is_archived);
  const initial = (displayName || email || "?").trim()[0]?.toUpperCase() ?? "?";

  // Ctrl/Cmd + K opens the search palette from anywhere
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const iconBtn = "relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100";

  return (
    <>
      <header className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950 py-2.5 pl-14 pr-3 md:px-6">
        <button onClick={() => setPalette(true)}
          className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-500 hover:border-zinc-700">
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">Search workspace…</span>
          <kbd className="hidden rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] sm:block">Ctrl K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setQuick(true)} disabled={active.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Quick Task</span>
          </button>

          <Popover wide button={(_o, toggle) => (
            <button onClick={toggle} title="Notifications" aria-label={`Notifications${badge ? `, ${badge} unread` : ""}`} className={iconBtn}>
              <Bell className="h-4 w-4" />
              {badge > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{badge > 99 ? "99+" : badge}</span>}
            </button>
          )}>
            {(close) => (
              <div className="max-h-[70dvh] overflow-y-auto">
                <div className="flex items-center justify-between px-3 py-2">
                  <h2 className="text-sm font-semibold">Notifications</h2>
                  <div className="flex items-center gap-3 text-xs">
                    {unread > 0 && <button onClick={markAllRead} className="text-indigo-300 hover:text-indigo-200">Mark all read</button>}
                    <Link href="/notifications" onClick={close} className="text-zinc-400 hover:text-zinc-200">View all</Link>
                  </div>
                </div>
                <NotificationList items={notes.slice(0, 8)} onRead={markRead} onPatch={patch} onNavigate={close} empty="No notifications yet." />
                {alerts.length > 0 && (
                  <>
                    <h3 className="mt-2 border-t border-zinc-800 px-3 pb-1 pt-3 text-[11px] uppercase tracking-wide text-zinc-500">Board alerts</h3>
                    <ul>
                      {alerts.map((a, i) => (
                        <li key={i}>
                          <Link href={a.href} onClick={close} className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-800">
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.tone === "rose" ? "bg-rose-500" : "bg-amber-500"}`} />{a.text}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </Popover>

          <Popover button={(_o, toggle) => (
            <button onClick={toggle} title="Settings" aria-label="Settings" className={iconBtn}><Settings className="h-4 w-4" /></button>
          )}>
            {() => (
              <div className="space-y-1 p-1 text-sm">
                <div className="flex items-center justify-between rounded-lg px-3 py-2"><span>Theme</span><ThemeToggle /></div>
                <div className="rounded-lg px-3 py-2 text-xs text-zinc-500">
                  <p className="mb-1 font-medium text-zinc-400">Shortcuts</p>
                  <p>Ctrl K — search workspace</p>
                  <p>Esc — close dialogs and menus</p>
                </div>
              </div>
            )}
          </Popover>

          <Popover button={(_o, toggle) => (
            <button onClick={toggle} title="Account" aria-label="Account"
              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-indigo-600 text-sm font-semibold text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
            </button>
          )}>
            {(close) => (
              <div className="space-y-2 p-2 text-sm">
                <div className="px-1">
                  {displayName && <p className="truncate font-medium">{displayName}</p>}
                  <p className="truncate text-xs text-zinc-500">{email}</p>
                </div>
                <Link href="/settings" onClick={close} className="block rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-zinc-800">Account settings</Link>
                <button onClick={async () => { await createClient().auth.signOut(); location.href = "/auth/login"; }}
                  className="w-full rounded-lg border border-zinc-800 py-1.5 text-zinc-300 hover:bg-zinc-800">Sign out</button>
              </div>
            )}
          </Popover>
        </div>
      </header>

      {palette && <CommandPalette boards={boards} onClose={() => setPalette(false)} />}
      {quick && <QuickTaskModal boards={active} onClose={() => setQuick(false)} />}
    </>
  );
}
