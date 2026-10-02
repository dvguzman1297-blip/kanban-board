"use server";
import { createClient } from "@/lib/supabase/server";
import { describeEvent } from "@/lib/card-events";
import { COLOR_KEYS } from "@/lib/colors";
import { timeAgo } from "@/lib/time";
import { REACTION_EMOJIS, type CardEventItem, type ReactionSummary, type Tag } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/* ---------------- audit trail ---------------- */
export async function getCardActivity(cardId: string): Promise<CardEventItem[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("card_events").select("id, user_id, kind, detail, created_at")
    .eq("card_id", cardId).order("created_at", { ascending: false }).limit(50);
  const ids = [...new Set((rows ?? []).map((r) => r.user_id as string | null).filter((x): x is string => !!x))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, first_name, full_name, display_name, avatar_url").in("id", ids)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  return (rows ?? []).map((r) => {
    const p = r.user_id ? byId.get(r.user_id as string) : undefined;
    return {
      id: r.id as string, kind: r.kind as string,
      text: describeEvent(r.kind as string, r.detail as Record<string, string | null>),
      createdAt: r.created_at as string, relativeLabel: timeAgo(r.created_at as string),
      actor: { name: (p?.display_name || p?.full_name || p?.first_name || "Someone") as string, avatarUrl: (p?.avatar_url as string | null) ?? null },
    };
  });
}

/* ---------------- reactions ---------------- */
export async function getReactions(commentIds: string[]): Promise<Record<string, ReactionSummary[]>> {
  if (!commentIds.length) return {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase.from("comment_reactions").select("comment_id, user_id, emoji").in("comment_id", commentIds);
  const out: Record<string, ReactionSummary[]> = {};
  for (const r of data ?? []) {
    const list = (out[r.comment_id as string] ??= []);
    let s = list.find((x) => x.emoji === r.emoji);
    if (!s) list.push((s = { emoji: r.emoji as string, count: 0, mine: false }));
    s.count++;
    if (r.user_id === user?.id) s.mine = true;
  }
  const order = REACTION_EMOJIS as readonly string[];
  for (const list of Object.values(out)) list.sort((a, b) => order.indexOf(a.emoji) - order.indexOf(b.emoji));
  return out;
}

export async function toggleReaction(commentId: string, emoji: string): Promise<Result<{ added: boolean }>> {
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) return { ok: false, error: "Unsupported reaction." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const { data: existing } = await supabase.from("comment_reactions").select("emoji")
    .eq("comment_id", commentId).eq("user_id", user.id).eq("emoji", emoji).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("comment_reactions").delete().eq("comment_id", commentId).eq("user_id", user.id).eq("emoji", emoji);
    return error ? { ok: false, error: "Could not remove reaction." } : { ok: true, added: false };
  }
  const { error } = await supabase.from("comment_reactions").insert({ comment_id: commentId, user_id: user.id, emoji });
  return error ? { ok: false, error: "Could not add reaction." } : { ok: true, added: true };
}

/* ---------------- tags ---------------- */
const cleanName = (n: string) => n.trim().replace(/\s+/g, " ").slice(0, 30);
const cleanColor = (c: string) => ((COLOR_KEYS as string[]).includes(c) ? c : "indigo");

export async function createTag(boardId: string, name: string, color: string): Promise<Result<{ tag: Tag }>> {
  const n = cleanName(name);
  if (!n) return { ok: false, error: "Enter a tag name." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tags").insert({ board_id: boardId, name: n, color: cleanColor(color) }).select().single();
  if (error) return { ok: false, error: error.code === "23505" ? "A tag with that name already exists." : "Could not create the tag." };
  return { ok: true, tag: data as Tag };
}

export async function updateTag(tagId: string, name: string, color: string): Promise<Result<{ tag: Tag }>> {
  const n = cleanName(name);
  if (!n) return { ok: false, error: "Enter a tag name." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tags").update({ name: n, color: cleanColor(color) }).eq("id", tagId).select().single();
  if (error) return { ok: false, error: error.code === "23505" ? "A tag with that name already exists." : "Could not update the tag." };
  return { ok: true, tag: data as Tag };
}

export async function deleteTag(tagId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("tags").delete().eq("id", tagId);
  return error ? { ok: false, error: "Could not delete the tag." } : { ok: true };
}

/** Replaces a card's tags with exactly `tagIds` (adds the missing, removes the extra). */
export async function setCardTags(cardId: string, tagIds: string[]): Promise<Result> {
  const supabase = await createClient();
  const { data: current, error } = await supabase.from("card_tags").select("tag_id").eq("card_id", cardId);
  if (error) return { ok: false, error: "Could not load the card's tags." };
  const have = new Set((current ?? []).map((r) => r.tag_id as string));
  const want = new Set(tagIds);
  const add = [...want].filter((id) => !have.has(id));
  const drop = [...have].filter((id) => !want.has(id));
  if (add.length) {
    const { error: e } = await supabase.from("card_tags").insert(add.map((tag_id) => ({ card_id: cardId, tag_id })));
    if (e) return { ok: false, error: "Could not add tags." };
  }
  if (drop.length) {
    const { error: e } = await supabase.from("card_tags").delete().eq("card_id", cardId).in("tag_id", drop);
    if (e) return { ok: false, error: "Could not remove tags." };
  }
  return { ok: true };
}
