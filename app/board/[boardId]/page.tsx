import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoardClient } from "@/components/board-client";
import { timeAgo } from "@/lib/time";
import { BUCKET, SIGNED_URL_TTL } from "@/lib/attachments";
import type { Attachment, CardComment } from "@/lib/types";

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
  const fullName = String(user?.user_metadata?.full_name || currentProfile?.full_name || "").trim();
  const displayName = String(user?.user_metadata?.first_name || currentProfile?.first_name || fullName || "");
  const currentUser = { id: user?.id ?? "", name: displayName.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || "You" };

  return (
    <BoardClient key={board.id} board={board} initialColumns={columns ?? []}
      initialCards={cards ?? []} initialAttachments={attachments} initialComments={initialComments}
      currentUser={currentUser} canInvite={board.user_id === user?.id} canEdit={canEdit} canAdmin={canAdmin} initialOpenCardId={openCardId ?? null} />
  );
}
