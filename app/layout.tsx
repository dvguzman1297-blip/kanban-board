import "./globals.css";
import "./theme.css";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { FocusProvider } from "@/components/focus-drawer";

export const metadata: Metadata = { title: "Kanban Workspace", description: "Solo multi-board Kanban" };

// Runs before paint so the saved theme never flashes.
const themeScript = `try{if(localStorage.getItem("theme")==="light")document.documentElement.classList.add("light")}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <html lang="en" suppressHydrationWarning>
        <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
        <body className="antialiased">{children}</body>
      </html>
    );
  }

  const { data: boards } = await supabase
    .from("boards")
    .select("id, name, is_pinned, is_archived")
    .order("created_at", { ascending: true });

  const { data: cols } = await supabase.from("columns").select("id, board_id, wip_limit").not("wip_limit", "is", null);
  const { data: cards } = await supabase.from("cards").select("column_id, board_id");
  const wip: Record<string, { used: number; limit: number }> = {};
  for (const c of cols ?? []) {
    const used = (cards ?? []).filter((k) => k.column_id === c.id).length;
    const prev = wip[c.board_id] ?? { used: 0, limit: 0 };
    wip[c.board_id] = { used: prev.used + used, limit: prev.limit + (c.wip_limit as number) };
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="antialiased">
        <FocusProvider>
          <div className="flex h-dvh overflow-hidden">
            <Sidebar boards={boards ?? []} wip={wip} email={user.email ?? ""} />
            <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
          </div>
        </FocusProvider>
      </body>
    </html>
  );
}
