"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, FileText, Paperclip, Plus, Trash2, X } from "lucide-react";
import type { Attachment, Card, Subtask } from "@/lib/types";
import type { CardComment } from "@/lib/types";
import { CardComments } from "@/components/card-comments";
import { CardActivity } from "@/components/card-activity";
import { MarkdownEditor } from "@/components/markdown-editor";
import { TagSelect } from "@/components/tag-select";
import { useTags } from "@/components/tags-context";
import { formatSize, isImage } from "@/lib/attachments";
import { COLOR_KEYS, PALETTE, type ColorKey } from "@/lib/colors";
import { useMembers } from "@/components/members-context";
import { memberName } from "@/lib/board-stats";

const field = "w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500";
const label = "mb-1 block text-xs font-medium text-zinc-500";

export function CardModal({ card, columnColor, attachments, comments, currentUser, readOnly = false, onUpload, onRemoveAttachment, onSave, onSaveTags, onManageTags, onSaveTemplate, onDelete, onClose }: {
  card: Card; columnColor: ColorKey; attachments: Attachment[]; comments: CardComment[]; currentUser: { id: string; name: string }; readOnly?: boolean;
  onUpload: (cardId: string, files: File[]) => Promise<string[]>; onRemoveAttachment: (a: Attachment) => void;
  onSave: (patch: Partial<Card>) => void; onSaveTags: (ids: string[]) => void; onManageTags?: () => void; onSaveTemplate?: (name: string) => Promise<string | null>; onDelete: () => void; onClose: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [priority, setPriority] = useState<Card["priority"]>(card.priority);
  const [energy, setEnergy] = useState<Card["energy_level"]>(card.energy_level);
  const [due, setDue] = useState(card.due_date ?? "");
  const members = useMembers();
  const [templateMsg, setTemplateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const saveTemplate = async () => {
    const name = prompt("Template name (saves the card as last saved):", card.title.slice(0, 60));
    if (!name?.trim() || !onSaveTemplate) return;
    const err = await onSaveTemplate(name.trim());
    setTemplateMsg(err ? { ok: false, text: err } : { ok: true, text: "Template saved." });
  };
  const { byCard } = useTags();
  const initialTagIds = byCard[card.id] ?? [];
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [assignee, setAssignee] = useState(card.assignee_id ?? "");
  const [color, setColor] = useState<string | null>(card.color ?? null); // null = Auto (column colour)
  const [subtasks, setSubtasks] = useState<Subtask[]>(card.subtasks ?? []);
  const [newSub, setNewSub] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgs = attachments.filter((a) => isImage(a.mime_type) && a.url);
  const others = attachments.filter((a) => !(isImage(a.mime_type) && a.url));

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const addSub = () => {
    const t = newSub.trim();
    if (!t) return;
    setSubtasks((s) => [...s, { id: crypto.randomUUID(), title: t, done: false }]);
    setNewSub("");
  };

  const handleFiles = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setUploading(true);
    setUploadErrors([]);
    try { setUploadErrors(await onUpload(card.id, files)); } finally { setUploading(false); }
  };

  const save = () => {
    if (!title.trim()) return;
    const subs = newSub.trim() ? [...subtasks, { id: crypto.randomUUID(), title: newSub.trim(), done: false }] : subtasks;
    onSave({
      title: title.trim(), description: description.trim() || null, priority,
      energy_level: energy, due_date: due || null, subtasks: subs, color, assignee_id: assignee || null,
    });
    if (tagIds.length !== initialTagIds.length || tagIds.some((id) => !initialTagIds.includes(id))) onSaveTags(tagIds);
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); handleFiles(e.clipboardData.files); } }}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Edit card</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-zinc-500 hover:text-zinc-200"><X className="h-5 w-5" /></button>
        </div>

        <fieldset disabled={readOnly} className="min-w-0 space-y-4 border-0 p-0">
          <div>
            <label className={label}>Title</label>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Description</label>
            <MarkdownEditor value={description} onChange={setDescription} readOnly={readOnly} />
          </div>

          <div>
            <label className={label}>Colour</label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setColor(null)} title={`Auto (follows the column: ${PALETTE[columnColor].label})`}
                className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs ${
                  color === null ? "border-indigo-500 text-zinc-100" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}>
                <span className={`h-3 w-3 rounded-full ${PALETTE[columnColor].dot}`} /> Auto
              </button>
              {COLOR_KEYS.map((k) => (
                <button key={k} type="button" onClick={() => setColor(k)} title={PALETTE[k].label} aria-label={PALETTE[k].label}
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${PALETTE[k].dot} ${
                    color === k ? "ring-2 ring-zinc-100 ring-offset-2 ring-offset-zinc-900" : "opacity-80 hover:opacity-100"}`}>
                  {color === k && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-600">Auto uses the column&apos;s colour, so a card changes colour when you move it.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Card["priority"])} className={`${field} capitalize`}>
                {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Energy level</label>
              <select value={energy} onChange={(e) => setEnergy(e.target.value as Card["energy_level"])} className={`${field} capitalize`}>
                {["low", "medium", "high"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Tags</label>
            <TagSelect value={tagIds} onChange={setTagIds} onManage={readOnly ? undefined : onManageTags} />
          </div>

          <div>
            <label className={label}>Assignee</label>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
            </select>
          </div>

          <div>
            <label className={label}>Due date</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
          </div>

          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}>
            <label className={label}>Attachments</label>
            <div className={`rounded-lg border border-dashed p-3 ${dragOver ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-700"}`}>
              {imgs.length > 0 && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {imgs.map((a) => (
                    <div key={a.id} className="group relative">
                      <a href={a.url!} target="_blank" rel="noreferrer" title={a.name}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url!} alt={a.name} className="aspect-square w-full rounded-md object-cover" />
                      </a>
                      <button type="button" aria-label="Remove attachment" title="Remove"
                        onClick={() => confirm(`Remove ${a.name}?`) && onRemoveAttachment(a)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white md:opacity-0 md:group-hover:opacity-100">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {others.length > 0 && (
                <ul className="mb-3 space-y-1.5">
                  {others.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                      <a href={a.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{a.name}</a>
                      <span className="shrink-0 text-xs text-zinc-500">{formatSize(a.size)}</span>
                      <button type="button" aria-label="Remove attachment" onClick={() => confirm(`Remove ${a.name}?`) && onRemoveAttachment(a)}
                        className="text-zinc-500 hover:text-rose-400"><X className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-sm text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200 disabled:opacity-60">
                <Paperclip className="h-4 w-4" /> {uploading ? "Uploading…" : "Add files — or drop / paste here"}
              </button>
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {uploadErrors.map((m, i) => <p key={i} className="mt-1 text-xs text-rose-400">{m}</p>)}
            <p className="mt-1.5 text-[11px] text-zinc-600">Images and files up to 10 MB each. Images show as a preview on the card.</p>
          </div>

          <div>
            <label className={label}>Subtasks</label>
            <ul className="space-y-1.5">
              {subtasks.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={s.done}
                    onChange={() => setSubtasks((all) => all.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                    className="h-4 w-4 accent-indigo-500" />
                  <span className={`min-w-0 flex-1 break-words [overflow-wrap:anywhere] ${s.done ? "text-zinc-500 line-through" : ""}`}>{s.title}</span>
                  <button onClick={() => setSubtasks((all) => all.filter((x) => x.id !== s.id))} aria-label="Remove subtask"
                    className="text-zinc-500 hover:text-rose-400"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add a subtask"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} className={field} />
              <button onClick={addSub} aria-label="Add subtask" className="rounded-lg border border-zinc-800 px-3 hover:bg-zinc-800"><Plus className="h-4 w-4" /></button>
            </div>
          </div>
        </fieldset>
        <CardComments cardId={card.id} initialComments={comments} currentUser={currentUser} />
        <CardActivity cardId={card.id} />

        {templateMsg && <p role={templateMsg.ok ? "status" : "alert"} className={`mt-3 text-xs ${templateMsg.ok ? "text-emerald-300" : "text-rose-400"}`}>{templateMsg.text}</p>}
        <div className="mt-6 flex items-center justify-between">
          {onSaveTemplate && <button type="button" onClick={saveTemplate} title="Save this card as a reusable template"
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">Save as template</button>}
          {!readOnly && <button onClick={() => confirm("Delete this card?") && (onDelete(), onClose())}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10">
            <Trash2 className="h-4 w-4" /> Delete
          </button>}
          <div className="flex gap-2">
            {!readOnly && <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>}
            {readOnly ? <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Close</button>
              : <button onClick={save} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Save</button>}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
