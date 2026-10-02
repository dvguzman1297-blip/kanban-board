import "./globals.css";
import "./theme.css";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { TopBar, type Alert } from "@/components/top-bar";
import { FocusProvider } from "@/components/focus-drawer";
import { ThemeInitializer } from "@/components/theme-initializer";
import { isThemePref } from "@/lib/theme";
import { isBlockedLike, isDoneName, toISO } from "@/lib/board-utils";

export const metadata: Metadata = { title: "FlowDeck", description: "FlowDeck collaborative workspace" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body className="antialiased">
          <ThemeInitializer />
          {children}
        </body>
      </html>
    );
  }

  const [{ data: boards }, { data: cols }, { data: cards }, { data: profile }] = await Promise.all([
    supabase.from("boards").select("id, user_id, name, is_pinned, is_archived").order("created_at", { ascending: true }),
    supabase.from("columns").select("id, board_id, name, wip_limit"),
    supabase.from("cards").select("column_id, board_id, due_date"),
    supabase.from("profiles").select("first_name, full_name, display_name, avatar_url, theme").eq("id", user.id).maybeSingle(),
  ]);

  const boardList = boards ?? [];
  const activeIds = new Set(boardList.filter((b) => !b.is_archived).map((b) => b.id));
  const boardName = Object.fromEntries(boardList.map((b) => [b.id, b.name as string]));
  const colList = (cols ?? []).filter((c) => activeIds.has(c.board_id));
  const cardList = (cards ?? []).filter((c) => activeIds.has(c.board_id));

  // Sidebar WIP status per board + WIP alerts
  const wip: Record<string, { used: number; limit: number }> = {};
  const alerts: Alert[] = [];
  for (const c of colList) {
    if (c.wip_limit === null) continue;
    const used = cardList.filter((k) => k.column_id === c.id).length;
    const prev = wip[c.board_id] ?? { used: 0, limit: 0 };
    wip[c.board_id] = { used: prev.used + used, limit: prev.limit + (c.wip_limit as number) };
    if (used > c.wip_limit) {
      alerts.push({ tone: "rose", href: `/board/${c.board_id}`, text: `${boardName[c.board_id]}: ${c.name} is over its WIP limit (${used}/${c.wip_limit})` });
    }
  }

  const doneIds = new Set(colList.filter((c) => isDoneName(c.name)).map((c) => c.id));
  const blockedIds = new Set(colList.filter((c) => isBlockedLike(c.name)).map((c) => c.id));
  const today = toISO(new Date());
  const overdue = cardList.filter((c) => c.due_date && c.due_date < today && !doneIds.has(c.column_id)).length;
  const blocked = cardList.filter((c) => blockedIds.has(c.column_id)).length;
  if (blocked > 0) alerts.unshift({ tone: "rose", href: "/dashboard?view=all", text: `${blocked} blocked card${blocked === 1 ? "" : "s"} need attention` });
  if (overdue > 0) alerts.unshift({ tone: "amber", href: "/dashboard?view=all", text: `${overdue} overdue card${overdue === 1 ? "" : "s"}` });

  const metadataFirst = String(user.user_metadata?.first_name ?? "").trim();
  const profileFirst = String(profile?.first_name ?? "").trim();
  const fullName = String(user.user_metadata?.full_name || profile?.full_name || "").trim();
  const displayName = String(profile?.display_name ?? "").trim() || metadataFirst || profileFirst || fullName;
  const rawTheme = profile?.theme;
  const theme = isThemePref(rawTheme) ? rawTheme : undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeInitializer serverTheme={theme} />
        <FocusProvider>
          <div className="flex h-dvh overflow-hidden">
            <Sidebar boards={boardList} wip={wip} email={user.email ?? ""} userId={user.id} />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <TopBar boards={boardList} alerts={alerts} email={user.email ?? ""} displayName={displayName} avatarUrl={profile?.avatar_url ?? null} />
              <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
            </div>
          </div>
        </FocusProvider>
      </body>
    </html>
  );
}