"use client";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { createTag, deleteTag, updateTag } from "@/app/card-extras-actions";
import { COLOR_KEYS, PALETTE } from "@/lib/colors";
import { TagPill, tagColor } from "@/components/tags-context";
import type { Tag } from "@/lib/types";

const input = "h-9 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-sm outline-none focus:border-indigo-500";

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Tag colour" className="flex flex-wrap gap-1.5">
      {COLOR_KEYS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} aria-label={PALETTE[k].label} title={PALETTE[k].label} onClick={() => onChange(k)}
          className={`h-5 w-5 rounded-full ${PALETTE[k].dot} ${value === k ? "ring-2 ring-zinc-100 ring-offset-2 ring-offset-zinc-900" : "opacity-70 hover:opacity-100"}`} />
      ))}
    </div>
  );
}

export function TagManager({ boardId, tags, canEdit, onCreated, onUpdated, onDeleted, onClose }: {
  boardId: string; tags: Tag[]; canEdit: boolean;
  onCreated: (t: Tag) => void; onUpdated: (t: Tag) => void; onDeleted: (id: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("indigo");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", color: "indigo" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const res = await createTag(boardId, name, color);
      if (!res.ok) return setError(res.error);
      onCreated(res.tag);
      setName("");
    });
  };
  const save = (id: string) => start(async () => {
    setError(null);
    const res = await updateTag(id, draft.name, draft.color);
    if (!res.ok) return setError(res.error);
    onUpdated(res.tag);
    setEditing(null);
  });
  const remove = (t: Tag) => {
    if (!confirm(`Delete the tag “${t.name}”? It will be removed from every card.`)) return;
    start(async () => {
      setError(null);
      const res = await deleteTag(t.id);
      if (!res.ok) return setError(res.error);
      onDeleted(t.id);
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="tags-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="tags-title" className="text-base font-semibold">Manage tags</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {canEdit && (
          <form onSubmit={add} className="mb-4 space-y-2 rounded-lg border border-zinc-800 p-3">
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="New tag, e.g. Bug" aria-label="New tag name" className={input} />
              <button disabled={pending || !name.trim()} className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"><Plus className="h-4 w-4" />Add</button>
            </div>
            <Swatches value={color} onChange={setColor} />
          </form>
        )}
        {error && <p role="alert" className="mb-2 text-sm text-rose-400">{error}</p>}

        {tags.length === 0 ? <p className="py-4 text-center text-sm text-zinc-500">No tags yet.</p> : (
          <ul className="divide-y divide-zinc-800">
            {tags.map((t) => (
              <li key={t.id} className="py-2">
                {editing === t.id ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} maxLength={30} aria-label="Tag name" className={input} />
                      <button onClick={() => save(t.id)} disabled={pending || !draft.name.trim()} aria-label="Save tag" className="rounded-lg bg-indigo-600 px-2.5 text-white disabled:opacity-50"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditing(null)} aria-label="Cancel" className="rounded-lg px-2 text-zinc-400 hover:bg-zinc-800"><X className="h-4 w-4" /></button>
                    </div>
                    <Swatches value={draft.color} onChange={(c) => setDraft((d) => ({ ...d, color: c }))} />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <TagPill tag={t} />
                    <span className="flex-1" />
                    {canEdit && (
                      <>
                        <button onClick={() => { setEditing(t.id); setDraft({ name: t.name, color: tagColor(t.color) }); }} aria-label={`Edit ${t.name}`} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(t)} disabled={pending} aria-label={`Delete ${t.name}`} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>,
    document.body,
  );
}
