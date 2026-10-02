import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsTabs, type SettingsProfile } from "@/components/settings-tabs";

export const metadata = { title: "Settings · FlowDeck" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/settings");

  const [{ data: profile }, { data: boards }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("boards").select("id, name").eq("is_archived", false).order("created_at"),
  ]);

  const meta = user.user_metadata ?? {};
  const settings: SettingsProfile = {
    first_name: profile?.first_name ?? meta.first_name ?? "",
    last_name: profile?.last_name ?? meta.last_name ?? "",
    display_name: profile?.display_name ?? "",
    job_title: profile?.job_title ?? "",
    bio: profile?.bio ?? "",
    avatar_url: profile?.avatar_url ?? null,
    default_board_id: profile?.default_board_id ?? null,
    theme: profile?.theme ?? "dark",
    notify_invites: profile?.notify_invites ?? true,
    notify_mentions: profile?.notify_mentions ?? true,
    notify_assignments: profile?.notify_assignments ?? true,
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-xl font-semibold md:text-2xl">Settings</h1>
        <p className="mb-6 text-sm text-zinc-500">Manage your profile, security and workspace preferences.</p>
        <SettingsTabs
          profile={settings}
          email={user.email ?? ""}
          verified={!!user.email_confirmed_at}
          pendingEmail={user.new_email ?? null}
          boards={(boards ?? []) as { id: string; name: string }[]}
        />
      </div>
    </div>
  );
}
