import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationsPage } from "@/components/notifications-page";
import type { AppNotification } from "@/lib/notifications";

export const metadata = { title: "Notifications · FlowDeck" };

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/notifications");
  const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  return <NotificationsPage userId={user.id} initial={(data ?? []) as AppNotification[]} />;
}
