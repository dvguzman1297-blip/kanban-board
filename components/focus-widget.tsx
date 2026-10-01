"use client";
import Link from "next/link";
import { ExternalLink, Pause, Play, Square, Timer } from "lucide-react";
import { useFocus } from "@/components/focus-drawer";

export function FocusWidget() {
  const { card, left, running, toggle, stop, open } = useFocus();
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Timer className="h-4 w-4" /> Active focus
      </h2>
      {!card ? (
        <p className="text-sm text-zinc-500">No focus session running. Press ▶ on any card to start a 25-minute Pomodoro.</p>
      ) : (
        <>
          <p className="truncate text-sm font-medium">{card.title}</p>
          <p className="my-2 font-mono text-4xl tabular-nums">{mm}:{ss}</p>
          <p className="mb-3 text-xs text-zinc-500">{left === 0 ? "Session complete — take a break." : running ? "Running" : "Paused"}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={toggle} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{running ? "Pause" : "Resume"}
            </button>
            <button onClick={stop} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
            <button onClick={open} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">Open timer</button>
            {card.boardId && (
              <Link href={`/board/${card.boardId}?card=${card.id}`} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
                <ExternalLink className="h-4 w-4" /> Go to card
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
