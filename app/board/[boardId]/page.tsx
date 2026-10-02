import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoardClient } from "@/components/board-client";
import { timeAgo } from "@/lib/time";
import { BUCKET, SIGNED_URL_TTL } from "@/lib/attachments";
import type { Attachment, CardComment, CardTemplate, Member, Tag } from "@/lib/types";

export default async function BoardPage({ params, searchParams }: {
  params: Promise<{ boardId: string }>; searchParams: Promise<{ card?: string }>;
}) {
  const { boardId } = await params;
  const { card: openCardId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Archive stale Done cards per the board's setting before loading them (no-op when the setting is off).
  await supabase.rpc("sweep_board_archive", { target_board_id: boardId });

  // RLS guarantees a foreign/unknown id simply returns null
  const { data: board } = await supabase.from("boards").select("*").eq("id", boardId).single();
  if (!board) notFound();
  const { data: membership } = user && board.user_id !== user.id
    ? await supabase.from("board_members").select("role").eq("board_id", board.id).eq("user_id", user.id).eq("status", "accepted").maybeSingle()
    : { data: null };
  const canEdit = board.user_id === user?.id || membership?.role === "admin" || membership?.role === "editor";
  const canAdmin = board.user_id === user?.id || membership?.role === "admin";

  const [{ data: columns }, { data: cards }, { data: atts }] = await Promise.all([
    supabase.from("columns").select("*").eq("board_id", board.id).order("order_index"),
    supabase.from("cards").select("*").eq("board_id", board.id).order("order_index"),
    supabase.from("attachments").select("*").eq("board_id", board.id).order("created_at"),
  ]);

  // Private bucket -> sign every file in one round trip
  const paths = (atts ?? []).map((a) => a.path as string);
  const { data: signed } = paths.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const attachments: Attachment[] = (atts ?? []).map((a) => ({ ...a, url: urlByPath.get(a.path) ?? null }));
  const cardIds = (cards ?? []).map((card) => card.id as string);
  const { data: commentRows } = cardIds.length
    ? await supabase.from("card_comments").select("*").in("card_id", cardIds).order("created_at")
    : { data: [] };
  const authorIds = [...new Set((commentRows ?? []).map((comment) => comment.user_id as string))];
  const [{ data: authorProfiles }, { data: currentProfile }] = await Promise.all([
    authorIds.length
      ? supabase.from("profiles").select("id, first_name, full_name").in("id", authorIds)
      : Promise.resolve({ data: [] }),
    user
      ? supabase.from("profiles").select("first_name, full_name").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const profileById = new Map((authorProfiles ?? []).map((profile) => [profile.id, profile]));
  const initialComments: CardComment[] = (commentRows ?? []).map((comment) => {
    const profile = profileById.get(comment.user_id);
    return {
      ...comment,
      author: { id: comment.user_id, first_name: profile?.first_name ?? null, full_name: profile?.full_name ?? null },
      relativeLabel: timeAgo(comment.created_at),
    };
  });
  const { data: memberRows } = await supabase.from("board_members").select("user_id").eq("board_id", board.id).eq("status", "accepted");
  const memberIds = [...new Set([board.user_id as string, ...(memberRows ?? []).map((m) => m.user_id as string)])];
  const { data: memberProfiles } = await supabase.from("profiles").select("id, first_name, full_name, display_name, avatar_url").in("id", memberIds);
  const profileMap = new Map((memberProfiles ?? []).map((p) => [p.id as string, p]));
  const members: Member[] = memberIds.map((id) => ({
    id, first_name: profileMap.get(id)?.first_name ?? null, full_name: profileMap.get(id)?.full_name ?? null,
    display_name: profileMap.get(id)?.display_name ?? null, avatar_url: profileMap.get(id)?.avatar_url ?? null,
  }));
  const [{ data: tagRows }, { data: cardTagRows }] = await Promise.all([
    supabase.from("tags").select("*").eq("board_id", board.id).order("name"),
    cardIds.length ? supabase.from("card_tags").select("card_id, tag_id").in("card_id", cardIds) : Promise.resolve({ data: [] as { card_id: string; tag_id: string }[] }),
  ]);
  const { data: templateRows } = await supabase.from("card_templates").select("*").eq("board_id", board.id).order("created_at");
  const initialTemplates = (templateRows ?? []) as CardTemplate[];
  const initialTags = (tagRows ?? []) as Tag[];
  const initialCardTags: Record<string, string[]> = {};
  for (const r of cardTagRows ?? []) (initialCardTags[r.card_id as string] ??= []).push(r.tag_id as string);
  const fullName = String(user?.user_metadata?.full_name || currentProfile?.full_name || "").trim();
  const displayName = String(user?.user_metadata?.first_name || currentProfile?.first_name || fullName || "");
  const currentUser = { id: user?.id ?? "", name: displayName.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || "You" };

  return (
    <BoardClient key={board.id} board={board} initialColumns={columns ?? []}
      initialCards={cards ?? []} initialAttachments={attachments} initialComments={initialComments} members={members} initialTags={initialTags} initialCardTags={initialCardTags} initialTemplates={initialTemplates}
      currentUser={currentUser} canInvite={board.user_id === user?.id} canEdit={canEdit} canAdmin={canAdmin} initialOpenCardId={openCardId ?? null} />
  );
}
