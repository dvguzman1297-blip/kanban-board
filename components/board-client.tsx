"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor, closestCorners, useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Play, Calendar, GripVertical, AlertTriangle, Pencil, Trash2, Paperclip, FileText } from "lucide-react";
import { createCard, moveCard, updateCard, deleteCard, renameBoard } from "@/app/actions";
import { useFocus } from "@/components/focus-drawer";
import { CardModal } from "@/components/card-modal";
import { PALETTE, columnColor, effectiveColor, type ColorKey } from "@/lib/colors";
import type { Attachment, Card, Column } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { BUCKET, MAX_BYTES, SIGNED_URL_TTL, isImage, safeName } from "@/lib/attachments";

const PRIORITY_STYLE: Record<Card["priority"], string> = {
  low: "bg-zinc-700/60 text-zinc-300", medium: "bg-sky-500/20 text-sky-300",
  high: "bg-amber-500/20 text-amber-300", urgent: "bg-rose-500/20 text-rose-300",
};

export function BoardClient({ board, initialColumns, initialCards, initialAttachments }:
  { board: { id: string; name: string; description: string | null }; initialColumns: Column[]; initialCards: Card[]; initialAttachments: Attachment[] }) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState("all");
  const [energy, setEnergy] = useState("all");
  const [, startTransition] = useTransition();

  // Default colour of each column (status)
  const colColors = useMemo(() => {
    const m: Record<string, ColorKey> = {};
    initialColumns.forEach((c, i) => (m[c.id] = columnColor(c.name, i)));
    return m;
  }, [initialColumns]);

  // Board rename
  const [name, setName] = useState(board.name);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(board.name);
  const cancelRename = useRef(false);
  useEffect(() => setName(board.name), [board.name]);

  const commitRename = () => {
    setRenaming(false);
    const n = draft.trim();
    if (cancelRename.current) { cancelRename.current = false; return; }
    if (!n || n === name) return;
    const prev = name;
    setName(n);
    startTransition(async () => {
      try { await renameBoard(board.id, n); } catch { setName(prev); }
    });
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const byColumn = useMemo(() => {
    const matches = (c: Card) =>
      (priority === "all" || c.priority === priority) &&
      (energy === "all" || c.energy_level === energy) &&
      (!q || `${c.title} ${c.description ?? ""}`.toLowerCase().includes(q.toLowerCase()));
    const m: Record<string, Card[]> = {};
    initialColumns.forEach((c) => (m[c.id] = []));
    [...cards].filter(matches).sort((a, b) => a.order_index - b.order_index).forEach((c) => m[c.column_id]?.push(c));
    return m;
  }, [cards, q, priority, energy, initialColumns]);

  const activeCard = cards.find((c) => c.id === activeId) ?? null;
  const editingCard = cards.find((c) => c.id === editingId) ?? null;
  const findColumnOf = (id: string) =>
    initialColumns.find((c) => c.id === id)?.id ?? cards.find((k) => k.id === id)?.column_id;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = findColumnOf(String(active.id));
    const to = findColumnOf(String(over.id));
    if (!from || !to || from === to) return;
    setCards((prev) => prev.map((c) => (c.id === active.id ? { ...c, column_id: to } : c)));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const colId = findColumnOf(String(over.id));
    if (!colId) return;

    const siblings = cards
      .filter((c) => c.column_id === colId && c.id !== active.id)
      .sort((a, b) => a.order_index - b.order_index);
    const overIdx = siblings.findIndex((c) => c.id === over.id);
    const idx = overIdx === -1 ? siblings.length : overIdx;

    const before = siblings[idx - 1]?.order_index;
    const after = siblings[idx]?.order_index;
    const order_index =
      before === undefined && after === undefined ? 1000
      : before === undefined ? after! - 1000
      : after === undefined ? before + 1000
      : (before + after) / 2;

    const snapshot = cards;
    setCards((p) => p.map((c) => (c.id === active.id ? { ...c, column_id: colId, order_index } : c)));
    startTransition(async () => {
      try { await moveCard(String(active.id), colId, order_index); }
      catch { setCards(snapshot); }
    });
  };

  const addCard = async (column_id: string, title: string) => {
    const list = cards.filter((c) => c.column_id === column_id);
    const order_index = Math.max(0, ...list.map((c) => c.order_index)) + 1000;
    const created = await createCard({ column_id, board_id: board.id, title, order_index });
    setCards((p) => [...p, created as Card]);
  };

  const saveCard = (id: string, patch: Partial<Card>) => {
    const snapshot = cards;
    setCards((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    startTransition(async () => {
      try { await updateCard(id, patch as Record<string, unknown>); } catch { setCards(snapshot); }
    });
  };

  const removeCard = (id: string) => {
    const snapshot = cards;
    const attSnapshot = attachments;
    setCards((p) => p.filter((c) => c.id !== id));
    setAttachments((p) => p.filter((a) => a.card_id !== id));
    startTransition(async () => {
      try { await deleteCard(id); } catch { setCards(snapshot); setAttachments(attSnapshot); }
    });
  };

  // ---- Attachments: upload straight from the browser to Supabase Storage ----
  const attByCard = useMemo(() => {
    const m: Record<string, Attachment[]> = {};
    attachments.forEach((a) => (m[a.card_id] ??= []).push(a));
    return m;
  }, [attachments]);

  const uploadFiles = async (cardId: string, files: File[]): Promise<string[]> => {
    const errors: string[] = [];
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ["You are signed out. Please sign in again."];
    for (const file of files) {
      if (file.size > MAX_BYTES) { errors.push(`${file.name}: larger than 10 MB`); continue; }
      const path = `${user.id}/${cardId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) { errors.push(`${file.name}: ${up.error.message}`); continue; }
      const { data: row, error } = await supabase.from("attachments")
        .insert({ card_id: cardId, board_id: board.id, name: file.name, path, mime_type: file.type || null, size: file.size })
        .select().single();
      if (error || !row) {
        await supabase.storage.from(BUCKET).remove([path]);
        errors.push(`${file.name}: ${error?.message ?? "could not be saved"}`);
        continue;
      }
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
      setAttachments((p) => [...p, { ...(row as Attachment), url: signed?.signedUrl ?? null }]);
    }
    return errors;
  };

  const removeAttachment = async (att: Attachment) => {
    const snapshot = attachments;
    setAttachments((p) => p.filter((a) => a.id !== att.id));
    const supabase = createClient();
    const { error } = await supabase.from("attachments").delete().eq("id", att.id);
    if (error) { setAttachments(snapshot); return; }
    await supabase.storage.from(BUCKET).remove([att.path]);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 py-3 pl-14 pr-4 md:px-6 md:py-4">
        <div className="mr-auto min-w-0">
          {renaming ? (
            <input autoFocus value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") { cancelRename.current = true; (e.target as HTMLInputElement).blur(); }
              }}
              className="w-full rounded-md border border-indigo-500 bg-zinc-900 px-2 py-0.5 text-lg font-semibold outline-none" />
          ) : (
            <div className="group flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{name}</h1>
              <button onClick={() => { setDraft(name); setRenaming(true); }} title="Rename board" aria-label="Rename board"
                className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 md:opacity-0 md:group-hover:opacity-100">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {board.description && <p className="text-xs text-zinc-500">{board.description}</p>}
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards…"
            className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-8 pr-3 text-sm outline-none focus:border-indigo-500" />
        </div>
        <Select value={priority} onChange={setPriority} label="Priority" options={["low", "medium", "high", "urgent"]} />
        <Select value={energy} onChange={setEnergy} label="Energy" options={["low", "medium", "high"]} />
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        {/* Desktop: columns share the available width (no horizontal scroll). Mobile: swipe. */}
        <div className="flex flex-1 snap-x snap-proximity gap-3 overflow-x-auto p-4 md:gap-4 md:p-6">
          {initialColumns.map((col) => (
            <KanbanColumn key={col.id} column={col} colorKey={colColors[col.id]} cards={byColumn[col.id] ?? []} attByCard={attByCard}
              totalCount={cards.filter((c) => c.column_id === col.id).length}
              onAdd={addCard} onEdit={setEditingId} onDelete={removeCard} />
          ))}
        </div>
        <DragOverlay>
          {activeCard && <CardView card={activeCard} overlay attachments={attByCard[activeCard.id] ?? []} colorKey={effectiveColor(activeCard.color, colColors[activeCard.column_id])} />}
        </DragOverlay>
      </DndContext>

      <AnimatePresence>
        {editingCard && (
          <CardModal key={editingCard.id} card={editingCard} columnColor={colColors[editingCard.column_id]}
            attachments={attByCard[editingCard.id] ?? []} onUpload={uploadFiles} onRemoveAttachment={removeAttachment}
            onSave={(patch) => saveCard(editingCard.id, patch)}
            onDelete={() => removeCard(editingCard.id)}
            onClose={() => setEditingId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Select({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-sm capitalize outline-none focus:border-indigo-500">
      <option value="all">{label}: all</option>
      {options.map((o) => <option key={o} value={o}>{label}: {o}</option>)}
    </select>
  );
}

function KanbanColumn({ column, colorKey, cards, attByCard, totalCount, onAdd, onEdit, onDelete }: {
  column: Column; colorKey: ColorKey; cards: Card[]; attByCard: Record<string, Attachment[]>; totalCount: number;
  onAdd: (colId: string, title: string) => Promise<void>; onEdit: (id: string) => void; onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const overLimit = column.wip_limit !== null && totalCount > column.wip_limit;
  const atLimit = column.wip_limit !== null && totalCount === column.wip_limit;

  return (
    <section ref={setNodeRef}
      className={`flex w-[82vw] max-w-xs shrink-0 snap-start flex-col rounded-xl border bg-zinc-900/60 transition-colors md:w-auto md:max-w-none md:min-w-[11rem] md:flex-1 ${
        overLimit ? "border-rose-500/60" : isOver ? "border-indigo-500/60" : "border-zinc-800"}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PALETTE[colorKey].dot}`} />
          <span className="truncate">{column.name}</span>
        </h2>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
          overLimit ? "bg-rose-500/20 text-rose-300" : atLimit ? "bg-amber-500/20 text-amber-300" : "bg-zinc-800 text-zinc-400"}`}>
          {overLimit && <AlertTriangle className="h-3 w-3" />}
          {totalCount}{column.wip_limit !== null && ` / ${column.wip_limit}`}
        </span>
      </div>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[60px] flex-1 flex-col gap-2 overflow-y-auto px-3 pb-2">
          <AnimatePresence initial={false}>
            {cards.map((c) => (
              <SortableCard key={c.id} card={c} attachments={attByCard[c.id] ?? []} colorKey={effectiveColor(c.color, colorKey)} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>

      <div className="p-3 pt-1">
        {adding ? (
          <form onSubmit={async (e) => { e.preventDefault(); if (!title.trim()) return; await onAdd(column.id, title.trim()); setTitle(""); setAdding(false); }}>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => !title && setAdding(false)}
              placeholder="Card title, then Enter"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <Plus className="h-4 w-4" /> Add card
          </button>
        )}
      </div>
    </section>
  );
}

function SortableCard({ card, attachments, colorKey, onEdit, onDelete }:
  { card: Card; attachments: Attachment[]; colorKey: ColorKey; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
        {...attributes} {...listeners}>
        <CardView card={card} attachments={attachments} colorKey={colorKey} onEdit={() => onEdit(card.id)}
          onDelete={() => confirm("Delete this card?") && onDelete(card.id)} />
      </div>
    </motion.div>
  );
}

function CardView({ card, colorKey, overlay, attachments = [], onEdit, onDelete }:
  { card: Card; colorKey: ColorKey; overlay?: boolean; attachments?: Attachment[]; onEdit?: () => void; onDelete?: () => void }) {
  const { startFocus } = useFocus();
  const done = card.subtasks.filter((s) => s.done).length;
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  const btn = "rounded p-1 text-zinc-500 hover:bg-zinc-800/60 md:opacity-0 md:group-hover:opacity-100";

  return (
    // Solid base + translucent tint on top, so the colour looks the same on any column background
    <div className={`rounded-lg bg-zinc-950 ${overlay ? "rotate-2 shadow-2xl" : ""}`}>
      <div onClick={onEdit}
        className={`group cursor-pointer rounded-lg border p-3 text-sm shadow-sm ${PALETTE[colorKey].card} ${overlay ? "ring-1 ring-indigo-500" : ""}`}>
        {attachments.length > 0 && <AttachmentPreview attachments={attachments} />}
        <div className="flex items-start gap-2">
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500/60" />
          <p className="min-w-0 flex-1 break-words leading-snug">{card.title}</p>
          {!overlay && (
            <div className="-mr-1 -mt-1 flex shrink-0">
              <button {...stop} onClick={(e) => { e.stopPropagation(); startFocus({ id: card.id, title: card.title }); }}
                title="Focus on this card" aria-label="Focus on this card" className={`${btn} hover:text-indigo-400`}><Play className="h-3.5 w-3.5" /></button>
              <button {...stop} onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                title="Edit card" aria-label="Edit card" className={`${btn} hover:text-zinc-200`}><Pencil className="h-3.5 w-3.5" /></button>
              <button {...stop} onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                title="Delete card" aria-label="Delete card" className={`${btn} hover:text-rose-400`}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded px-1.5 py-0.5 capitalize ${PRIORITY_STYLE[card.priority]}`}>{card.priority}</span>
          <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 capitalize text-zinc-400">⚡ {card.energy_level}</span>
          {card.due_date && <span className="flex items-center gap-1 text-zinc-500"><Calendar className="h-3 w-3" />{card.due_date}</span>}
          {card.subtasks.length > 0 && <span className="text-zinc-500">{done}/{card.subtasks.length}</span>}
          {attachments.length > 0 && <span className="flex items-center gap-0.5 text-zinc-500"><Paperclip className="h-3 w-3" />{attachments.length}</span>}
        </div>
      </div>
    </div>
  );
}

// Preview on the card: first image as a cover, up to 3 more as thumbnails, other files as chips
function AttachmentPreview({ attachments }: { attachments: Attachment[] }) {
  const images = attachments.filter((a) => isImage(a.mime_type) && a.url);
  const files = attachments.filter((a) => !(isImage(a.mime_type) && a.url));
  const [cover, ...rest] = images;
  const thumbs = rest.slice(0, 3);
  const moreImages = rest.length - thumbs.length;
  const chip = "flex max-w-full items-center gap-1 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[11px] text-zinc-400";

  return (
    <div className="mb-2 space-y-1.5">
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover.url!} alt={cover.name} draggable={false} loading="lazy" className="h-28 w-full rounded-md object-cover" />
      )}
      {thumbs.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {thumbs.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={t.id} src={t.url!} alt={t.name} draggable={false} loading="lazy" className="h-10 w-full rounded object-cover" />
          ))}
        </div>
      )}
      {(files.length > 0 || moreImages > 0) && (
        <div className="flex flex-wrap gap-1">
          {files.slice(0, 2).map((f) => (
            <span key={f.id} className={chip}><FileText className="h-3 w-3 shrink-0" /><span className="truncate">{f.name}</span></span>
          ))}
          {files.length > 2 && <span className={chip}>+{files.length - 2} files</span>}
          {moreImages > 0 && <span className={chip}>+{moreImages} images</span>}
        </div>
      )}
    </div>
  );
}
