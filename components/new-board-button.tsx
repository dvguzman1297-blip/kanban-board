"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createBoard } from "@/app/actions";

export function NewBoardButton() {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!adding) {
    return (
      <button onClick={() => { setError(""); setAdding(true); }} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
        <Plus className="h-4 w-4" /> New Board
      </button>
    );
  }
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const n = name.trim();
      if (!n) return;
      setError("");
      start(async () => {
        const result = await createBoard(n);
        if (result && "error" in result) setError(result.error);
      });
    }}>
      <input autoFocus value={name} disabled={pending} onChange={(e) => setName(e.target.value)} onBlur={() => !name && setAdding(false)}
        placeholder="Board name, then Enter"
        className="h-8 w-48 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm outline-none focus:border-indigo-500" />
      {error && <p role="alert" className="mt-1 max-w-56 break-words text-xs text-rose-400">{error}</p>}
    </form>
  );
}
