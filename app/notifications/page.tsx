import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationsPage } from "@/components/notifications-page";
import { overdueNotifications, type AppNotification, type OverdueCard } from "@/lib/notifications";
import { isDoneName, toISO } from "@/lib/board-utils";

export const metadata = { title: "Notifications · FlowDeck" };

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/notifications");
  const today = toISO(new Date());
  const [{ data }, { data: boards }, { data: cols }, { data: cards }] = await Promise.all([
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("boards").select("id, name, is_archived"),
    supabase.from("columns").select("id, name"),
    supabase.from("cards").select("id, title, column_id, board_id, due_date").lt("due_date", today).is("archived_at", null),
  ]);
  const active = new Set((boards ?? []).filter((b) => !b.is_archived).map((b) => b.id));
  const doneCols = new Set((cols ?? []).filter((c) => isDoneName(c.name)).map((c) => c.id));
  const overdue = (cards ?? []).filter((c) => active.has(c.board_id) && !doneCols.has(c.column_id)) as OverdueCard[];
  const boardName = Object.fromEntries((boards ?? []).map((b) => [b.id, b.name as string]));
  return <NotificationsPage userId={user.id} initial={(data ?? []) as AppNotification[]} derived={overdueNotifications(overdue, boardName)} />;
}
