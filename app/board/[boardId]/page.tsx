import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoardClient } from "@/components/board-client";
import { BUCKET, SIGNED_URL_TTL } from "@/lib/attachments";
import type { Attachment } from "@/lib/types";

export default async function BoardPage({ params, searchParams }: {
  params: Promise<{ boardId: string }>; searchParams: Promise<{ card?: string }>;
}) {
  const { boardId } = await params;
  const { card: openCardId } = await searchParams;
  const supabase = await createClient();

  // RLS guarantees a foreign/unknown id simply returns null
  const { data: board } = await supabase.from("boards").select("*").eq("id", boardId).single();
  if (!board) notFound();

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

  return (
    <BoardClient key={board.id} board={board} initialColumns={columns ?? []}
      initialCards={cards ?? []} initialAttachments={attachments} initialOpenCardId={openCardId ?? null} />
  );
}
