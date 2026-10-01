import { createClient } from "@/lib/supabase/server";
import { InviteAccept } from "@/components/invite-accept";

export default async function AcceptInvitePage({ searchParams }: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const { data: { user } } = await (await createClient()).auth.getUser();
  return <InviteAccept token={token} email={user?.email ?? null} />;
}