"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  Pin, PinOff, Plus, Archive, ArchiveRestore, Trash2, LayoutDashboard, ChevronDown,
  LogOut, Menu, PanelLeftClose, PanelLeftOpen, X, Home,
} from "lucide-react";
import { createBoard, togglePin, archiveBoard, deleteBoard } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppLogo } from "@/components/app-logo";

type B = { id: string; name: string; is_pinned: boolean; is_archived: boolean };

export function Sidebar({ boards, wip, email }: { boards: B[]; wip: Record<string, { used: number; limit: number }>; email: string }) {
  const path = usePathname();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState(false);   // desktop: icon-only rail
  const [mobileOpen, setMobileOpen] = useState(false); // mobile: off-canvas drawer
  const [pending, start] = useTransition();

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("sidebar-collapsed") === "1"); } catch {}
  }, []);
  useEffect(() => setMobileOpen(false), [path]); // close drawer after navigating

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("sidebar-collapsed", next ? "1" : "0"); } catch {}
      return next;
    });

  const slim = collapsed && !mobileOpen; // the drawer is always full width

  const active = boards.filter((b) => !b.is_archived);
  const pinned = active.filter((b) => b.is_pinned);
  const others = active.filter((b) => !b.is_pinned);
  const archived = boards.filter((b) => b.is_archived);

  const row = (b: B) => {
    const w = wip[b.id];
    const isActive = path === `/board/${b.id}`;
    return (
      <li key={b.id} className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${isActive ? "bg-indigo-500/15 text-indigo-200" : "text-zinc-400 hover:bg-zinc-800/70"}`}>
        <Link href={`/board/${b.id}`} title={b.name} className={`flex flex-1 items-center gap-2 truncate ${slim ? "justify-center" : ""}`}>
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {!slim && (
            <>
              <span className="truncate">{b.name}</span>
              {w && <span className={`ml-auto text-[10px] ${w.used > w.limit ? "text-rose-400" : "text-zinc-500"}`}>WIP {w.used}/{w.limit}</span>}
            </>
          )}
        </Link>
        {!slim && (
          <div className="hidden items-center group-hover:flex max-md:flex">
            <button title={b.is_pinned ? "Unpin" : "Pin"} onClick={() => start(() => togglePin(b.id, !b.is_pinned))} className="p-1 hover:text-indigo-300">
              {b.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
            <button title={b.is_archived ? "Restore" : "Archive"} onClick={() => start(() => archiveBoard(b.id, !b.is_archived))} className="p-1 hover:text-amber-300">
              {b.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </button>
            <button title="Delete" onClick={() => confirm(`Delete "${b.name}" and all its cards?`) && start(() => deleteBoard(b.id))} className="p-1 hover:text-rose-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)} aria-label="Open menu"
        className="fixed left-3 top-3 z-30 rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 md:hidden">
        <Menu className="h-5 w-5" />
      </button>
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/60 md:hidden" />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 p-3 transition-all duration-200 md:static md:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"} ${slim ? "md:w-14 md:px-2" : "md:w-64"}`}>

        <div className={`mb-4 flex items-center ${slim ? "flex-col gap-2" : "justify-between px-2"}`}>
          {slim ? <AppLogo className="h-7 w-7" /> : (
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <AppLogo className="h-6 w-6" /> Kanban Workspace
            </Link>
          )}
          <div className={`flex items-center gap-1 ${slim ? "flex-col" : ""}`}>
            <button onClick={() => { if (slim) toggleCollapsed(); setAdding(true); }} title="New board"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"><Plus className="h-4 w-4" /></button>
            <button onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label="Toggle sidebar"
              className="hidden rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 md:block">
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 md:hidden"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {adding && !slim && (
          <form className="mb-3" onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const n = name.trim(); setName(""); setAdding(false); start(() => createBoard(n));
          }}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name && setAdding(false)} placeholder="New board name"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" />
          </form>
        )}

        <nav className={`flex-1 space-y-4 overflow-y-auto ${pending ? "opacity-70" : ""}`}>
          <Link href="/dashboard" title="Home"
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${path === "/dashboard" ? "bg-indigo-500/15 text-indigo-200" : "text-zinc-400 hover:bg-zinc-800/70"} ${slim ? "justify-center" : ""}`}>
            <Home className="h-4 w-4 shrink-0" />{!slim && "Home"}
          </Link>
          {pinned.length > 0 && (
            <div>
              {!slim && <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-600">Pinned</p>}
              <ul>{pinned.map(row)}</ul>
            </div>
          )}
          <div>
            {!slim && <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-600">All boards</p>}
            <ul>{others.map(row)}</ul>
          </div>
          {archived.length > 0 && !slim && (
            <div>
              <button onClick={() => setShowArchived((s) => !s)} className="flex items-center gap-1 px-2 text-[11px] uppercase tracking-wide text-zinc-600">
                Archived <ChevronDown className={`h-3 w-3 transition ${showArchived ? "rotate-180" : ""}`} />
              </button>
              {showArchived && <ul className="mt-1 opacity-60">{archived.map(row)}</ul>}
            </div>
          )}
        </nav>

        <div className={`mt-3 flex items-center border-t border-zinc-800 pt-3 text-xs text-zinc-500 ${slim ? "flex-col gap-2" : "justify-between px-2"}`}>
          {!slim && <span className="truncate">{email}</span>}
          <div className={`flex items-center gap-1 ${slim ? "flex-col" : ""}`}>
            <ThemeToggle />
            <button title="Sign out" aria-label="Sign out" className="rounded p-1 hover:text-zinc-200"
              onClick={async () => { await createClient().auth.signOut(); location.href = "/auth/login"; }}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
