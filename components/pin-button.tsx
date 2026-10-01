"use client";
import { useTransition } from "react";
import { Star } from "lucide-react";
import { togglePin } from "@/app/actions";

export function PinButton({ id, pinned }: { id: string; pinned: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(() => togglePin(id, !pinned))} disabled={pending}
      title={pinned ? "Unpin from sidebar" : "Pin to sidebar"} aria-label={pinned ? "Unpin board" : "Pin board"}
      className="pointer-events-auto relative z-10 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-amber-400 disabled:opacity-50">
      <Star className={`h-4 w-4 ${pinned ? "fill-amber-400 text-amber-400" : ""}`} />
    </button>
  );
}
