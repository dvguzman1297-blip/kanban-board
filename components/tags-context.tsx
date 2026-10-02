"use client";
import { createContext, useContext } from "react";
import { PALETTE, type ColorKey } from "@/lib/colors";
import type { Tag } from "@/lib/types";

type TagsValue = { tags: Tag[]; byCard: Record<string, string[]> };
const TagsContext = createContext<TagsValue>({ tags: [], byCard: {} });
export const TagsProvider = TagsContext.Provider;
export const useTags = () => useContext(TagsContext);

export const tagColor = (c: string): ColorKey => (c in PALETTE ? (c as ColorKey) : "indigo");

export function TagPill({ tag }: { tag: Pick<Tag, "name" | "color"> }) {
  const k = tagColor(tag.color);
  return (
    <span className={`inline-flex max-w-[9rem] items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] text-zinc-200 ${PALETTE[k].card}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PALETTE[k].dot}`} />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

/** Pills for a card face: first three, then "+n". */
export function CardTagPills({ cardId }: { cardId: string }) {
  const { tags, byCard } = useTags();
  const mine = (byCard[cardId] ?? []).map((id) => tags.find((t) => t.id === id)).filter((t): t is Tag => !!t);
  if (!mine.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {mine.slice(0, 3).map((t) => <TagPill key={t.id} tag={t} />)}
      {mine.length > 3 && <span className="text-[10px] text-zinc-500">+{mine.length - 3}</span>}
    </div>
  );
}
