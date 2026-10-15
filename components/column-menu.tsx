"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsLeft, Eye, EyeOff, Minus, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { addColumn, deleteColumn, updateColumn } from "@/app/column-actions";
import { isDoneName } from "@/lib/board-utils";
import { COLOR_KEYS, PALETTE, isColorKey, type ColorKey } from "@/lib/colors";
import { MAX_COLUMNS, MAX_COLUMN_NAME } from "@/lib/column-rules";
import type { Column } from "@/lib/types";

export type ColumnEdit = { boardId: string; onChanged: () => void };

const field = "h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-indigo-500 disabled:opacity-60";
const label = "text-xs font-medium text-zinc-400";
const POPOVER_W = 280;

/** − / + stepper for the WIP limit. Empty means "no limit"; the first + sets 1, and − from 1 clears it. */
function WipStepper({ value, onChange, disabled, id }: { value: string; onChange: (v: string) => void; disabled?: boolean; id?: string }) {
  const n = parseInt(value, 10);
  const current = Number.isFinite(n) ? n : 0;
  const step = "flex h-9 w-9 shrink-0 items-center justify-center text-zinc-400 hover:text-zinc-100 disabled:opacity-40";
  return (
    <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-950 focus-within:border-indigo-500">
      <button type="button" aria-label="Decrease WIP limit" disabled={disabled || current === 0} onClick={() => onChange(current <= 1 ? "" : String(current - 1))} className={step}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input id={id} type="number" min={1} max={99} inputMode="numeric" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="None"
        className="h-9 w-12 bg-transparent text-center text-sm text-zinc-100 outline-none placeholder:text-zinc-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      <button type="button" aria-label="Increase WIP limit" disabled={disabled || current >= 99} onClick={() => onChange(String(current + 1))} className={step}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * The ⋯ menu on a column header. Everyone gets the view actions (collapse, show/hide completed);
 * editors also get colour, rename, WIP limit and delete. Reordering is by dragging the grip.
 */
export function ColumnMenu({ column, edit, autoColor, onCollapse, completedHidden, onToggleCompleted }: {
  column: Column; edit?: ColumnEdit; autoColor: ColorKey; onCollapse: () => void; completedHidden?: boolean; onToggleCompleted?: () => void;
}) {
  const savedWip = column.wip_limit === null ? "" : String(column.wip_limit);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [name, setName] = useState(column.name);
  const [wip, setWip] = useState(savedWip);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [color, setColor] = useState<ColorKey | null>(isColorKey(column.color) ? column.color : null); // what the swatches show
  const [hint, setHint] = useState<string | null>(null); // colour name while hovering / focusing a swatch
  const [pending, start] = useTransition();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const isDone = isDoneName(column.name);
  const open = pos !== null;
  const dirty = name.trim() !== column.name || wip.trim() !== savedWip;
  const colorName = color === null ? `Auto · ${PALETTE[autoColor].label}` : PALETTE[color].label;

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true); // the anchor moves when the board scrolls
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) { setPos(null); return; }
    const r = button.current!.getBoundingClientRect();
    // Keep the panel fully on screen: right-aligned to the button, then clamped to the viewport.
    const left = Math.min(Math.max(8, r.right - POPOVER_W), window.innerWidth - POPOVER_W - 8);
    setPos({ top: r.bottom + 6, left });
    setName(column.name); setWip(savedWip); setError(""); setConfirmDelete(false); setHint(null);
    setColor(isColorKey(column.color) ? column.color : null);
  };
  const run = (job: () => Promise<{ error: string } | { ok: true }>) => {
    setError("");
    start(async () => {
      const result = await job();
      if ("error" in result) { setError(result.error); return; }
      edit?.onChanged();
      setPos(null);
    });
  };
  // A colour applies immediately (no Save step) and the menu stays open so several can be tried in a row.
  const pickColor = (next: ColorKey | null) => {
    const previous = color;
    setColor(next); setError("");
    start(async () => {
      const result = await updateColumn(column.id, { color: next });
      if ("error" in result) { setColor(previous); setError(result.error); return; }
      edit?.onChanged();
    });
  };
  const onSwatchKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    items[(at + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length].focus();
  };
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800";
  const swatch = "aspect-square w-full rounded-full text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400";
  const hintOn = (text: string) => ({ onMouseEnter: () => setHint(text), onFocus: () => setHint(text), onMouseLeave: () => setHint(null), onBlur: () => setHint(null) });

  return (
    <>
      <button ref={button} onClick={toggle} title="Column options" aria-label={`Options for ${column.name}`} aria-expanded={open} aria-haspopup="dialog"
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"><MoreHorizontal className="h-4 w-4" /></button>
      {pos && createPortal(
        <div ref={panel} role="dialog" aria-label={`Options for column ${column.name}`} style={{ top: pos.top, left: pos.left, width: POPOVER_W }}
          className="fixed z-[95] max-w-[calc(100vw-1rem)] rounded-xl border border-zinc-700 bg-zinc-900 text-left shadow-2xl">
          {edit && (
            <div className="space-y-4 p-4">
              <div className="flex h-6 items-center justify-between gap-2">
                {confirmDelete ? (
                  <>
                    <span className="text-sm font-medium text-zinc-200">Delete this column?</span>
                    <span className="flex items-center gap-1 text-xs">
                      <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800">Keep</button>
                      <button type="button" disabled={pending} onClick={() => run(() => deleteColumn(column.id))}
                        className="rounded-md bg-rose-600 px-2 py-1 font-medium text-white hover:bg-rose-500 disabled:opacity-60">Delete</button>
                    </span>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-zinc-100">Column settings</h3>
                    {!isDone && (
                      <button type="button" onClick={() => setConfirmDelete(true)} title="Delete column" aria-label={`Delete ${column.name}`}
                        className="-mr-1 flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </>
                )}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); if (dirty) run(() => updateColumn(column.id, { name, wip_limit: wip.trim() === "" ? null : wip.trim() })); }} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor={`col-name-${column.id}`} className={label}>Name</label>
                  <input id={`col-name-${column.id}`} value={name} maxLength={MAX_COLUMN_NAME} disabled={isDone || pending} onChange={(e) => setName(e.target.value)}
                    title={isDone ? "Done can't be renamed: it records when cards are completed." : undefined} className={field} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span id={`col-colour-${column.id}`} className={label}>Colour</span>
                    <span aria-hidden className="truncate text-xs text-zinc-500">{hint ?? colorName}</span>
                  </div>
                  <div role="radiogroup" aria-labelledby={`col-colour-${column.id}`} onKeyDown={onSwatchKeys} className="grid grid-cols-11 gap-1.5">
                    <button type="button" role="radio" aria-checked={color === null} aria-label={`Automatic colour (${PALETTE[autoColor].label})`} onClick={() => pickColor(null)}
                      {...hintOn(`Auto · ${PALETTE[autoColor].label}`)}
                      className={`${swatch} flex items-center justify-center border border-dashed ${color === null ? "border-white" : "border-zinc-500 hover:scale-110"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${PALETTE[autoColor].dot}`} />
                    </button>
                    {COLOR_KEYS.map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={color === k} aria-label={PALETTE[k].label} onClick={() => pickColor(k)} {...hintOn(PALETTE[k].label)}
                        className={`${swatch} flex items-center justify-center ${PALETTE[k].dot} ${color === k ? "ring-1 ring-white ring-offset-1 ring-offset-zinc-900" : "hover:scale-110"}`}>
                        {color === k && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={`col-wip-${column.id}`} className={label} title="Most cards allowed here at once">WIP limit</label>
                  <WipStepper id={`col-wip-${column.id}`} value={wip} onChange={setWip} disabled={pending} />
                </div>

                {error && <p role="alert" className="break-words text-xs text-rose-400">{error}</p>}
                {dirty && (
                  <button disabled={pending} className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
                    {pending ? "Saving…" : "Save changes"}
                  </button>
                )}
              </form>
            </div>
          )}

          <div className={`space-y-0.5 p-2 ${edit ? "border-t border-zinc-800" : ""}`}>
            <button type="button" onClick={() => { setPos(null); onCollapse(); }} className={`${item} hidden md:flex`}>
              <ChevronsLeft className="h-4 w-4 text-zinc-500" />Collapse column
            </button>
            {onToggleCompleted && (
              <button type="button" onClick={() => { setPos(null); onToggleCompleted(); }} className={item}>
                {completedHidden ? <Eye className="h-4 w-4 text-zinc-500" /> : <EyeOff className="h-4 w-4 text-zinc-500" />}
                {completedHidden ? "Show completed cards" : "Hide completed cards"}
              </button>
            )}
          </div>
        </div>
      , document.body)}
    </>
  );
}

/** Dashed tile at the end of the board for adding a column. */
export function AddColumn({ boardId, count, onChanged }: { boardId: string; count: number; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [wip, setWip] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (count >= MAX_COLUMNS) return null;

  const reset = () => { setAdding(false); setName(""); setWip(""); setError(""); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const result = await addColumn(boardId, name, wip.trim() === "" ? null : wip.trim());
      if ("error" in result) { setError(result.error); return; }
      reset(); onChanged();
    });
  };

  return (
    <div className="w-[82vw] max-w-xs shrink-0 snap-start md:w-60">
      {adding ? (
        <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && reset()} className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
          <div className="space-y-1.5">
            <label htmlFor="new-col-name" className={label}>Name</label>
            <input id="new-col-name" autoFocus value={name} maxLength={MAX_COLUMN_NAME} disabled={pending} onChange={(e) => setName(e.target.value)} placeholder="e.g. Testing" className={field} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="new-col-wip" className={label}>WIP limit</label>
            <WipStepper id="new-col-wip" value={wip} onChange={setWip} disabled={pending} />
          </div>
          {error && <p role="alert" className="break-words text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>
            <button disabled={pending || !name.trim()} className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">{pending ? "Adding…" : "Add column"}</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700/70 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-100">
          <Plus className="h-4 w-4" /> Add column
        </button>
      )}
    </div>
  );
}
