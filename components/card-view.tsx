"use client";
import { useRef, useState } from "react";
import { Calendar, CheckSquare, FileText, Flag, GripVertical, Paperclip, PencilLine, Play, SquarePen, Trash2, Zap } from "lucide-react";
import { useFocus } from "@/components/focus-drawer";
import { PALETTE, type ColorKey } from "@/lib/colors";
import { isImage } from "@/lib/attachments";
import { useMembers } from "@/components/members-context";
import { memberName } from "@/lib/board-stats";
import { stripMarkdown } from "@/lib/markdown";
import { useBoardUi } from "@/components/board-ui-context";
import { CardTagPills } from "@/components/tags-context";
import type { Attachment, Card } from "@/lib/types";

// Priority = slate -> indigo -> orange -> red.  Energy = green -> yellow -> violet.  (No overlap, so they never blend.)
export const PRIORITY_STYLE: Record<Card["priority"], string> = {
  low: "bg-slate-500/20 text-slate-300",
  medium: "bg-indigo-500/20 text-indigo-300",
  high: "bg-orange-500/20 text-orange-300",
  urgent: "bg-rose-500/25 text-rose-300",
};
export const ENERGY_STYLE: Record<Card["energy_level"], string> = {
  low: "bg-emerald-500/20 text-emerald-300",
  medium: "bg-yellow-500/20 text-yellow-300",
  high: "bg-violet-500/20 text-violet-300",
};

export function PriorityBadge({ value }: { value: Card["priority"] }) {
  return (
    <span title={`Priority: ${value}`} className={`flex min-w-0 max-w-full items-center gap-1 break-words rounded px-1.5 py-0.5 capitalize ${PRIORITY_STYLE[value]}`}>
      <Flag className="h-3 w-3 shrink-0" />{value}
    </span>
  );
}
export function EnergyBadge({ value }: { value: Card["energy_level"] }) {
  return (
    <span title={`Energy: ${value}`} className={`flex min-w-0 max-w-full items-center gap-1 break-words rounded px-1.5 py-0.5 capitalize ${ENERGY_STYLE[value]}`}>
      <Zap className="h-3 w-3 shrink-0" />{value}
    </span>
  );
}

export function CardView({ card, colorKey, overlay, attachments = [], showPreviews = true, canEdit = true, onEdit, onDelete, onRename }: {
  card: Card; colorKey: ColorKey; overlay?: boolean; attachments?: Attachment[]; showPreviews?: boolean; canEdit?: boolean;
  onEdit?: () => void; onDelete?: () => void; onRename?: (title: string) => void;
}) {
  const { startFocus } = useFocus();
  const assignee = useMembers().find((m) => m.id === card.assignee_id);
  const ui = useBoardUi();
  const [localRenaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(card.title);
  const [prevTitle, setPrevTitle] = useState(card.title);
  if (prevTitle !== card.title) { setPrevTitle(card.title); setDraft(card.title); } // follow edits made elsewhere
  const cancel = useRef(false);
  const renaming = localRenaming || (!overlay && ui.renameId === card.id); // E hotkey sets renameId
  const selected = !overlay && ui.selectedIds.has(card.id);
  const focused = !overlay && ui.focusedId === card.id;

  const subs = card.subtasks ?? [];
  const done = subs.filter((s) => s.done).length;
  const pct = subs.length ? Math.round((done / subs.length) * 100) : 0;

  const commit = () => {
    setRenaming(false);
    ui.clearRename();
    if (cancel.current) { cancel.current = false; return; }
    const t = draft.trim();
    if (t && t !== card.title) onRename?.(t);
  };

  // Keep toolbar buttons / the rename input from starting a drag or opening the editor
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  const btn = "rounded p-1 text-zinc-500 hover:bg-zinc-800/60";

  return (
    <div className={`rounded-lg bg-zinc-950 ${overlay ? "rotate-2 shadow-2xl" : ""}`}>
      <div id={overlay ? undefined : `card-${card.id}`} aria-selected={selected || undefined}
        onClick={(e) => {
          if (ui.selectMode || e.shiftKey || e.ctrlKey || e.metaKey) { e.preventDefault(); ui.toggleSelect(card.id); } else onEdit?.();
        }}
        className={`group relative cursor-pointer rounded-lg border p-3 text-sm shadow-sm ${PALETTE[colorKey].card} ${overlay ? "ring-1 ring-indigo-500" : ""} ${
          selected ? "ring-2 ring-indigo-400" : focused ? "ring-2 ring-sky-400/80" : ""} ${card.archived_at ? "opacity-60" : ""}`}>
        {(ui.selectMode || selected) && !overlay && (
          <input type="checkbox" checked={selected} onChange={() => ui.toggleSelect(card.id)} onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()} aria-label={`Select ${card.title}`} className="absolute right-2 top-2 z-10 h-4 w-4 accent-indigo-500" />
        )}
        {showPreviews && attachments.length > 0 && <AttachmentPreview attachments={attachments} />}

        <div className="flex items-start gap-2">
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500/60" />
          {renaming ? (
            <input autoFocus value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
              onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation(); // stops dnd-kit's keyboard drag from reacting to Space/Enter
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { cancel.current = true; e.currentTarget.blur(); }
              }}
              className="min-w-0 flex-1 rounded border border-indigo-500 bg-zinc-950 px-1.5 py-0.5 text-sm outline-none" />
          ) : (
            <p className="min-w-0 flex-1 break-words leading-snug [overflow-wrap:anywhere]">{card.title}</p>
          )}
        </div>

        {card.description && <p className="mt-1 ml-6 line-clamp-2 break-words text-xs leading-snug text-zinc-500 [overflow-wrap:anywhere]">{stripMarkdown(card.description)}</p>}

        <CardTagPills cardId={card.id} />

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {card.archived_at && <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-zinc-300">Archived</span>}
          <PriorityBadge value={card.priority} />
          <EnergyBadge value={card.energy_level} />
          {card.due_date && <span className="flex items-center gap-1 text-zinc-500"><Calendar className="h-3 w-3" />{card.due_date}</span>}
          {subs.length > 0 && <span title="Subtasks done" className="flex items-center gap-1 text-zinc-500"><CheckSquare className="h-3 w-3" />{done}/{subs.length}</span>}
          {attachments.length > 0 && <span className="flex items-center gap-0.5 text-zinc-500"><Paperclip className="h-3 w-3" />{attachments.length}</span>}
          {assignee && (
            <span title={`Assigned to ${memberName(assignee)}`} className="ml-auto flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-indigo-600 text-[10px] font-semibold text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {assignee.avatar_url ? <img src={assignee.avatar_url} alt="" className="h-full w-full object-cover" /> : memberName(assignee)[0]?.toUpperCase()}
            </span>
          )}
        </div>

        {subs.length > 0 && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-500/20">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}

        {!overlay && !renaming && (
          <div className="flowdeck-card-actions">
            <button {...stop} onClick={(e) => { e.stopPropagation(); startFocus({ id: card.id, title: card.title, boardId: card.board_id }); }}
              title="Start focus (Pomodoro)" aria-label="Start focus" className={`${btn} hover:text-indigo-400`}><Play className="h-3.5 w-3.5" /></button>
            {canEdit && <>
              <button {...stop} onClick={(e) => { e.stopPropagation(); setDraft(card.title); setRenaming(true); }}
                title="Quick rename" aria-label="Quick rename" className={`${btn} hover:text-zinc-200`}><PencilLine className="h-3.5 w-3.5" /></button>
              <button {...stop} onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                title="Edit details" aria-label="Edit details" className={`${btn} hover:text-zinc-200`}><SquarePen className="h-3.5 w-3.5" /></button>
              <button {...stop} onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                title="Delete card" aria-label="Delete card" className={`${btn} hover:text-rose-400`}><Trash2 className="h-3.5 w-3.5" /></button>
            </>}
          </div>
        )}
      </div>
    </div>
  );
}

// Fixed-height frame: wide banners fill it (cover); screenshots / tall images are letterboxed (contain).
function CoverImage({ a }: { a: Attachment }) {
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-md bg-zinc-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.url!} alt={a.name} draggable={false} loading="lazy"
        onLoad={(e) => {
          const r = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
          setFit(r >= 1.2 && r <= 2.4 ? "cover" : "contain");
        }}
        className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`} />
      {/* subtle border + bottom fade so white screenshots don't bleed into light cards */}
      <div className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-zinc-500/30" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.28), transparent)" }} />
    </div>
  );
}

function AttachmentPreview({ attachments }: { attachments: Attachment[] }) {
  const images = attachments.filter((a) => isImage(a.mime_type) && a.url);
  const files = attachments.filter((a) => !(isImage(a.mime_type) && a.url));
  const [cover, ...rest] = images;
  const thumbs = rest.slice(0, 3);
  const moreImages = rest.length - thumbs.length;
  const chip = "flex max-w-full items-center gap-1 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[11px] text-zinc-400";

  return (
    <div className="mb-2 space-y-1.5">
      {cover && <CoverImage a={cover} />}
      {thumbs.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {thumbs.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={t.id} src={t.url!} alt={t.name} draggable={false} loading="lazy"
              className="h-10 w-full rounded object-cover ring-1 ring-inset ring-zinc-500/30" />
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
