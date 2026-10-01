import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = (await createClient());
  const { data } = await supabase.from("boards").select("id").eq("is_archived", false)
    .order("is_pinned", { ascending: false }).order("created_at").limit(1);
  if (data?.[0]) redirect(`/board/${data[0].id}`);
  return <div className="p-10 text-zinc-400">No boards yet — create one from the sidebar.</div>;
}
