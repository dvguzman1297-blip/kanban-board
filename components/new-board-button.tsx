"use client";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, X } from "lucide-react";
import { createBoard } from "@/app/actions";
import { BOARD_TEMPLATES } from "@/lib/board-templates";

export function NewBoardButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(BOARD_TEMPLATES[0].id);
  const [examples, setExamples] = useState(true);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const template = BOARD_TEMPLATES.find((t) => t.id === templateId) ?? BOARD_TEMPLATES[0];

  const close = () => { if (!pending) setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pending && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setError("Enter a board name."); return; }
    setError("");
    start(async () => {
      const result = await createBoard(n, templateId, examples);
      if (result && "error" in result) setError(result.error);
    });
  };

  return (
    <>
      <button onClick={() => { setError(""); setOpen(true); }} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
        <Plus className="h-4 w-4" /> New Board
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="new-board-title"
            className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="new-board-title" className="text-base font-semibold">New board</h2>
              <button type="button" onClick={close} aria-label="Close" className="rounded p-1 text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <label className="block text-xs font-medium text-zinc-400">
              Board name
              <input autoFocus value={name} disabled={pending} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website relaunch"
                className="mt-1.5 h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-indigo-500" />
            </label>

            <fieldset className="mt-4">
              <legend className="mb-1.5 text-xs font-medium text-zinc-400">Start from a template</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {BOARD_TEMPLATES.map((t) => {
                  const selected = t.id === templateId;
                  return (
                    <label key={t.id} className={`relative cursor-pointer rounded-lg border p-3 ${selected ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}>
                      <input type="radio" name="template" value={t.id} checked={selected} onChange={() => setTemplateId(t.id)} className="sr-only" />
                      <span className="flex items-center justify-between gap-2 text-sm font-medium text-zinc-100">
                        {t.name}{selected && <Check className="h-4 w-4 shrink-0 text-indigo-300" />}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500">{t.description}</span>
                      <span className="mt-2 block text-[11px] leading-snug text-zinc-400">{t.columns.map((c) => c.name).join(" → ")}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {template.examples.length > 0 && (
              <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={examples} onChange={(e) => setExamples(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
                Add a few example cards I can edit or delete
              </label>
            )}

            {error && <p role="alert" className="mt-3 break-words text-sm text-rose-400">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={close} className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>
              <button disabled={pending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
                {pending ? "Creating…" : "Create board"}
              </button>
            </div>
          </form>
        </div>
      , document.body)}
    </>
  );
}
