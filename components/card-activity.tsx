"use client";
import { useEffect, useState } from "react";
import { ListRowsSkeleton } from "@/components/skeletons";
import { getCardActivity } from "@/app/card-extras-actions";
import type { CardEventItem } from "@/lib/types";

export function CardActivity({ cardId }: { cardId: string }) {
  const [items, setItems] = useState<CardEventItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getCardActivity(cardId).then((rows) => { if (live) setItems(rows); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [cardId]);

  return (
    <section className="mt-4 border-t border-zinc-800 pt-4">
      <h3 className="mb-3 text-sm font-medium">Activity</h3>
      {failed ? <p className="text-xs text-zinc-600">Activity is unavailable right now.</p>
        : items === null ? <ListRowsSkeleton rows={3} />
        : items.length === 0 ? <p className="text-xs text-zinc-600">No activity recorded yet.</p>
        : (
          <ol className="fd-fade-in space-y-2.5">
            {items.map((e) => (
              <li key={e.id} className="flex items-start gap-2.5 text-xs">
                {e.actor.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={e.actor.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                  : <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-semibold text-indigo-200">{e.actor.name[0]?.toUpperCase()}</span>}
                <p className="min-w-0 flex-1 break-words leading-relaxed text-zinc-400 [overflow-wrap:anywhere]">
                  <span className="font-medium text-zinc-200">{e.actor.name}</span> {e.text}
                  <span className="text-zinc-600"> • </span>
                  <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()} className="text-zinc-500">{e.relativeLabel}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
