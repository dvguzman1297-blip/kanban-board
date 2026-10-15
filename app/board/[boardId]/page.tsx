import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoardClient } from "@/components/board-client";
import { timeAgo } from "@/lib/time";
import { BUCKET, SIGNED_URL_TTL } from "@/lib/attachments";
import type { Attachment, CardComment, CardTemplate, Member, Tag } from "@/lib/types";

type ProfileRow = { id: string; first_name: string | null; full_name: string | null; display_name?: string | null; avatar_url?: string | null };

export default async function BoardPage({ params, searchParams }: {
  params: Promise<{ boardId: string }>; searchParams: Promise<{ card?: string }>;
}) {
  const { boardId } = await params;
  const { card: openCardId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // RLS guarantees a foreign/unknown id simply returns null
  const { data: board } = await supabase.from("boards").select("*").eq("id", boardId).single();
  if (!board) notFound();

  // Archive stale Done cards per the board's setting before loading them. Skipped (no round trip) when the setting is off.
  if (board.auto_archive_days) await supabase.rpc("sweep_board_archive", { target_board_id: boardId });

  // Wave 1: everything that only needs the board id, fetched together.
  const [{ data: membership }, { data: columns }, { data: cards }, { data: atts }, { data: memberRows }, { data: tagRows }, { data: templateRows }, { data: currentProfile }] = await Promise.all([
    user && board.user_id !== user.id
      ? supabase.from("board_members").select("role").eq("board_id", board.id).eq("user_id", user.id).eq("status", "accepted").maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("columns").select("*").eq("board_id", board.id).order("order_index"),
    supabase.from("cards").select("*").eq("board_id", board.id).order("order_index"),
    supabase.from("attachments").select("*").eq("board_id", board.id).order("created_at"),
    supabase.from("board_members").select("user_id").eq("board_id", board.id).eq("status", "accepted"),
    supabase.from("tags").select("*").eq("board_id", board.id).order("name"),
    supabase.from("card_templates").select("*").eq("board_id", board.id).order("created_at"),
    user ? supabase.from("profiles").select("first_name, full_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const canEdit = board.user_id === user?.id || membership?.role === "admin" || membership?.role === "editor";
  const canAdmin = board.user_id === user?.id || membership?.role === "admin";

  // Wave 2: things that need the card ids / member ids from wave 1.
  const cardIds = (cards ?? []).map((card) => card.id as string);
  const memberIds = [...new Set([board.user_id as string, ...(memberRows ?? []).map((m) => m.user_id as string)])];
  const paths = (atts ?? []).map((a) => a.path as string);
  const [signedRes, { data: commentRows }, { data: memberProfiles }, { data: cardTagRows }] = await Promise.all([
    // Private bucket -> sign every file in one round trip
    paths.length ? supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    cardIds.length ? supabase.from("card_comments").select("*").in("card_id", cardIds).order("created_at") : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("id, first_name, full_name, display_name, avatar_url").in("id", memberIds),
    cardIds.length ? supabase.from("card_tags").select("card_id, tag_id").in("card_id", cardIds) : Promise.resolve({ data: [] as { card_id: string; tag_id: string }[] }),
  ]);
  const urlByPath = new Map((signedRes.data ?? []).map((s) => [s.path, s.signedUrl]));
  const attachments: Attachment[] = (atts ?? []).map((a) => ({ ...a, url: urlByPath.get(a.path) ?? null }));

  // Wave 3: comment authors who are no longer members (members' profiles are already loaded).
  const profileMap = new Map<string, ProfileRow>((memberProfiles ?? []).map((p) => [p.id as string, p as ProfileRow]));
  const missingAuthorIds = [...new Set((commentRows ?? []).map((comment) => comment.user_id as string))].filter((id) => !profileMap.has(id));
  if (missingAuthorIds.length) {
    const { data: extra } = await supabase.from("profiles").select("id, first_name, full_name").in("id", missingAuthorIds);
    for (const p of extra ?? []) profileMap.set(p.id as string, p as ProfileRow);
  }
  const initialComments: CardComment[] = (commentRows ?? []).map((comment) => {
    const profile = profileMap.get(comment.user_id);
    return {
      ...comment,
      author: { id: comment.user_id, first_name: profile?.first_name ?? null, full_name: profile?.full_name ?? null },
      relativeLabel: timeAgo(comment.created_at),
    };
  });

  const members: Member[] = memberIds.map((id) => ({
    id, first_name: profileMap.get(id)?.first_name ?? null, full_name: profileMap.get(id)?.full_name ?? null,
    display_name: profileMap.get(id)?.display_name ?? null, avatar_url: profileMap.get(id)?.avatar_url ?? null,
  }));
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
