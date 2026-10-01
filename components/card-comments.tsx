"use client";
import { useEffect, useState } from "react";
import { Pencil, Send, Trash2, X } from "lucide-react";
import { createCardComment, deleteCardComment, updateCardComment } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/time";

export type CommentItem = {
  id: string; card_id: string; user_id: string; content: string; created_at: string; updated_at: string;
  author: { id: string; first_name: string | null; full_name: string | null };
  relativeLabel: string;
};

export function CardComments({ cardId, initialComments, currentUser }: {
  cardId: string; initialComments: CommentItem[]; currentUser: { id: string; name: string };
}) {
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    const refresh = async () => {
      const { data } = await supabase.from("card_comments").select("*").eq("card_id", cardId).order("created_at");
      const rows = data ?? [];
      const authorIds = [...new Set(rows.map((row) => row.user_id))];
      const { data: profiles } = authorIds.length
        ? await supabase.from("profiles").select("id, first_name, full_name").in("id", authorIds)
        : { data: [] as { id: string; first_name: string | null; full_name: string | null }[] };
      const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      setComments(rows.map((row) => ({
        ...row,
        author: { id: row.user_id, first_name: byId.get(row.user_id)?.first_name ?? null, full_name: byId.get(row.user_id)?.full_name ?? null },
        relativeLabel: timeAgo(row.created_at),
      })));
    };
    const channel = supabase.channel(`card-comments:${cardId}`).on("postgres_changes", {
      event: "*", schema: "public", table: "card_comments",
    }, refresh).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [cardId]);

  const post = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setPending(true); setError("");
    try {
      const row = await createCardComment(cardId, draft);
      setComments((all) => all.some((comment) => comment.id === row.id) ? all : [...all, {
        ...row, author: { id: currentUser.id, first_name: currentUser.name, full_name: currentUser.name }, relativeLabel: "just now",
      } as CommentItem].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not post comment.");
    } finally {
      setPending(false);
    }
  };

  const saveEdit = async (id: string) => {
    setPending(true); setError("");
    try {
      const updated = await updateCardComment(id, editDraft);
      setComments((all) => all.map((comment) => comment.id === id ? { ...comment, ...updated } : comment));
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update comment.");
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: string) => {
    setPending(true); setError("");
    try {
      await deleteCardComment(id);
      setComments((all) => all.filter((comment) => comment.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete comment.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="border-t border-zinc-800 pt-4">
      <h3 className="mb-3 text-sm font-medium">Comments &amp; Discussion</h3>
      <form onSubmit={post} className="space-y-2">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000} rows={3}
          placeholder="Write a comment…" className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-600">{draft.length}/5000</span>
          <button disabled={pending || !draft.trim()} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            <Send className="h-3.5 w-3.5" />Post Comment
          </button>
        </div>
      </form>
      {error && <p role="alert" className="mt-2 break-words text-xs text-rose-400">{error}</p>}
      <ol className="mt-4 space-y-3">
        {comments.map((comment) => {
          const authorName = comment.author.first_name || comment.author.full_name?.trim().split(/\s+/)[0] || "FlowDeck member";
          const initials = authorName.slice(0, 1).toUpperCase();
          const own = comment.user_id === currentUser.id;
          return (
            <li key={comment.id} className="flex min-w-0 gap-2.5">
              <span aria-label={`${authorName} avatar`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-200">{initials}</span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="max-w-full truncate text-xs font-medium text-zinc-200">{authorName}</span>
                  <time title={new Date(comment.created_at).toLocaleString()} className="shrink-0 text-[10px] text-zinc-500">{comment.relativeLabel}</time>
                  {comment.updated_at !== comment.created_at && <span className="text-[10px] text-zinc-600">edited</span>}
                </div>
                {editingId === comment.id ? (
                  <div className="mt-1 space-y-1.5">
                    <textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={5000} rows={2}
                      className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-indigo-500" />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(comment.id)} disabled={pending || !editDraft.trim()} className="rounded bg-indigo-600 px-2.5 py-1 text-xs text-white disabled:opacity-50">Save</button>
                      <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:text-white"><X className="h-3 w-3" />Cancel</button>
                    </div>
                  </div>
                ) : <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-300">{comment.content}</p>}
                {own && editingId !== comment.id && (
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => { setEditingId(comment.id); setEditDraft(comment.content); }} title="Edit comment" aria-label="Edit comment" className="text-zinc-600 hover:text-zinc-300"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => remove(comment.id)} title="Delete comment" aria-label="Delete comment" disabled={pending} className="text-zinc-600 hover:text-rose-400"><Trash2 className="h-3 w-3" /></button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {comments.length === 0 && <p className="mt-3 text-xs text-zinc-600">No comments yet.</p>}
    </section>
  );
}