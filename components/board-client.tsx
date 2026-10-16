"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor, closestCorners, closestCenter, useSensor, useSensors, useDroppable,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, AlertTriangle, Pencil,  ChevronsRight, ChevronDown, TrendingUp, Ban, Clock,
  Columns3, List, CalendarDays, CalendarRange, LayoutDashboard, Check, X,  EyeOff, Tags as TagsIcon, CheckSquare, Archive, LayoutTemplate, Image as ImageIcon, ImageOff,   GripVertical,
} from "lucide-react";
import { setCardTags } from "@/app/card-extras-actions";
import { useRouter } from "next/navigation";
import { createCard, moveCard, updateCard, deleteCard, renameBoard } from "@/app/actions";
import { CardModal } from "@/components/card-modal";
import { InviteMembersButton } from "@/components/invite-members-button";
import { AddColumn, ColumnMenu, type ColumnEdit } from "@/components/column-menu";
import { FiltersMenu } from "@/components/filters-menu";
import { reorderColumns } from "@/app/column-actions";
import { applyColumnOrder } from "@/lib/column-rules";
import { useToast } from "@/components/toast";
import { CardView } from "@/components/card-view";
import { ListView, CalendarView } from "@/components/board-views";
import { TimelineView } from "@/components/timeline-view";
import { BoardDashboard } from "@/components/board-dashboard";
import { MembersProvider } from "@/components/members-context";
import { TagsProvider } from "@/components/tags-context";
import { TagManager } from "@/components/tag-manager";
import { BoardUiProvider, useBoardUi } from "@/components/board-ui-context";
import { BulkBar } from "@/components/bulk-bar";
import { BoardSettings } from "@/components/board-settings";
import { deleteCardTemplate, saveCardAsTemplate } from "@/app/bulk-actions";
import { builtinTemplates, freshSubtasks } from "@/lib/card-templates";
import { isTypingTarget, moveCursor, type NavKey } from "@/lib/board-nav";
import { createClient } from "@/lib/supabase/client";
import { BUCKET, MAX_BYTES, SIGNED_URL_TTL, safeName } from "@/lib/attachments";
import { COLOR_KEYS, PALETTE, columnColor, effectiveColor, type ColorKey } from "@/lib/colors";
import { defaultDueDate, isBlockedName, isDoneName, toISO } from "@/lib/board-utils";
import type { Attachment, Card, CardComment, CardTemplate, Column, Member, Tag } from "@/lib/types";

type View = "kanban" | "list" | "calendar" | "timeline" | "dashboard";
type GroupBy = "none" | "priority" | "energy" | "color";
type CardAttrs = Partial<Pick<Card, "priority" | "energy_level" | "color">>;

/* ---------- swimlane helpers ---------- */
const PRIORITY_LANES: [string, string, string][] = [
  ["urgent", "Urgent", "bg-rose-500"], ["high", "High", "bg-orange-500"], ["medium", "Medium", "bg-indigo-500"], ["low", "Low", "bg-slate-500"],
];
const ENERGY_LANES: [string, string, string][] = [
  ["high", "High energy", "bg-violet-500"], ["medium", "Medium energy", "bg-yellow-500"], ["low", "Low energy", "bg-emerald-500"],
];
const laneKeyOf = (c: Card, g: GroupBy) =>
  g === "priority" ? c.priority : g === "energy" ? c.energy_level : g === "color" ? (c.color && c.color in PALETTE ? c.color : "none") : "";
const lanePatchOf = (g: GroupBy, key: string): CardAttrs =>
  g === "priority" ? { priority: key as Card["priority"] }
  : g === "energy" ? { energy_level: key as Card["energy_level"] }
  : g === "color" ? { color: key === "none" ? null : key } : {};

const allDone = (subs: Card["subtasks"] | null | undefined) => (subs ?? []).map((t) => ({ ...t, done: true }));

/* ---------- WIP state ---------- */
type Wip = "ok" | "at" | "over";
const wipState = (c: Column, n: number): Wip =>
  c.wip_limit === null ? "ok" : n > c.wip_limit ? "over" : n === c.wip_limit ? "at" : "ok";
const wipTitle = (c: Column, n: number) =>
  c.wip_limit === null ? `${n} cards`
  : n > c.wip_limit ? `WIP limit exceeded: ${n} cards, limit is ${c.wip_limit}`
  : n === c.wip_limit ? `At WIP limit (${c.wip_limit}) — finish something before pulling more` : `${n} of ${c.wip_limit} slots used`;

export function BoardClient({ board, initialColumns: serverColumns, initialCards, initialAttachments, initialComments, members, initialTags, initialCardTags, initialTemplates, currentUser, canInvite, canEdit = true, canAdmin = true, initialOpenCardId }: {
  board: { id: string; name: string; description: string | null; auto_archive_days?: number | null };
  initialColumns: Column[]; initialCards: Card[]; initialAttachments: Attachment[]; initialComments: CardComment[]; members: Member[]; initialTags: Tag[]; initialCardTags: Record<string, string[]>; initialTemplates: CardTemplate[];
  currentUser: { id: string; name: string }; canInvite: boolean; canEdit?: boolean; canAdmin?: boolean; initialOpenCardId?: string | null;
}) {
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [cardTags, setCardTagsState] = useState<Record<string, string[]>>(initialCardTags);
  const [tagsOpen, setTagsOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  // Column order: the server's order, unless a drag just reordered them (the override is dropped once fresh server data arrives).
  const [colOrder, setColOrder] = useState<{ base: Column[]; ids: string[] } | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const initialColumns = useMemo(
    () => applyColumnOrder(serverColumns, colOrder && colOrder.base === serverColumns ? colOrder.ids : null),
    [serverColumns, colOrder],
  );
  const [templates, setTemplates] = useState<CardTemplate[]>(initialTemplates);
  const [focusedId, setFocusedId] = useState<string | null>(null);   // keyboard cursor
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set()); // Done columns collapsed to a count
  const bulkSnapshot = useRef<{ cards: Card[]; cardTags: Record<string, string[]> } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(initialOpenCardId ?? null);
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState("all");
  const [energy, setEnergy] = useState("all");
  const [, startTransition] = useTransition();

  // View preferences (remembered per board)
  const [view, setView] = useState<View>("kanban");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [previews, setPreviews] = useState(true);
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const prefKey = `board:${board.id}:prefs`;

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(prefKey) ?? "{}");
      if (p.view) setView(p.view);
      if (p.groupBy) setGroupBy(p.groupBy);
      if (typeof p.previews === "boolean") setPreviews(p.previews);
      if (Array.isArray(p.collapsedCols)) setCollapsedCols(new Set(p.collapsedCols));
      if (Array.isArray(p.collapsedLanes)) setCollapsedLanes(new Set(p.collapsedLanes));
      if (Array.isArray(p.hiddenCols)) setHiddenCols(new Set(p.hiddenCols));
    } catch {}
    setHydrated(true);
  }, [prefKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(prefKey, JSON.stringify({
        view, groupBy, previews, collapsedCols: [...collapsedCols], collapsedLanes: [...collapsedLanes], hiddenCols: [...hiddenCols],
      }));
    } catch {}
  }, [hydrated, prefKey, view, groupBy, previews, collapsedCols, collapsedLanes, hiddenCols]);

  const toggleIn = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  const colColors = useMemo(() => {
    const m: Record<string, ColorKey> = {};
    initialColumns.forEach((c, i) => (m[c.id] = columnColor(c.name, i, c.color)));
    return m;
  }, [initialColumns]);
  const autoColors = useMemo(() => {
    const m: Record<string, ColorKey> = {};
    initialColumns.forEach((c, i) => (m[c.id] = columnColor(c.name, i)));
    return m;
  }, [initialColumns]);
  const colById = useMemo(() => Object.fromEntries(initialColumns.map((c) => [c.id, c])) as Record<string, Column>, [initialColumns]);

  /* ---------- board rename ---------- */
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
    startTransition(async () => { try { await renameBoard(board.id, n); } catch { setName(prev); } });
  };

  /* ---------- filtering + derived data ---------- */
  const live = useMemo(() => cards.filter((c) => !c.archived_at), [cards]); // archived cards don't count toward stats or WIP
  const archivedCount = cards.length - live.length;

  // The overdue notifications and the bell badge are computed by the server layout, so re-run it shortly after a change
  // that can resolve (or create) an overdue card: due date, list (Done), archive, delete. Debounced so the write has landed.
  const overdueSignature = useMemo(() => cards.map((c) => `${c.id}|${c.due_date ?? ""}|${c.column_id}|${c.archived_at ?? ""}`).join(","), [cards]);
  const lastSignature = useRef(overdueSignature);
  useEffect(() => {
    if (lastSignature.current === overdueSignature) return;
    lastSignature.current = overdueSignature;
    const t = setTimeout(() => router.refresh(), 1200);
    return () => clearTimeout(t);
  }, [overdueSignature, router]);
  const visible = useMemo(() => {
    const ql = q.toLowerCase();
    return cards
      .filter((c) =>
        (showArchived || !c.archived_at) &&
        (priority === "all" || c.priority === priority) &&
        (energy === "all" || c.energy_level === energy) &&
        (!ql || `${c.title} ${c.description ?? ""}`.toLowerCase().includes(ql)))
      .sort((a, b) => a.order_index - b.order_index);
  }, [cards, q, priority, energy, showArchived]);

  // Cards in a hidden Done column are not rendered at all (keeps big boards fast); the header shows how many are tucked away.
  const shown = useMemo(() => visible.filter((c) => !hiddenCols.has(c.column_id)), [visible, hiddenCols]);
  const hiddenCount = (colId: string) => (hiddenCols.has(colId) ? visible.filter((c) => c.column_id === colId).length : 0);
  const byColumn = useMemo(() => {
    const m: Record<string, Card[]> = {};
    initialColumns.forEach((c) => (m[c.id] = []));
    shown.forEach((c) => m[c.column_id]?.push(c));
    return m;
  }, [shown, initialColumns]);

  const attByCard = useMemo(() => {
    const m: Record<string, Attachment[]> = {};
    attachments.forEach((a) => (m[a.card_id] ??= []).push(a));
    return m;
  }, [attachments]);

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 864e5;
    const doneIds = new Set(initialColumns.filter((c) => isDoneName(c.name)).map((c) => c.id));
    const blockedIds = new Set(initialColumns.filter((c) => isBlockedName(c.name)).map((c) => c.id));
    const today = toISO(new Date());
    return {
      velocity: live.filter((c) => c.completed_at && new Date(c.completed_at).getTime() >= weekAgo).length,
      blocked: live.filter((c) => blockedIds.has(c.column_id)).length,
      overdue: live.filter((c) => c.due_date && c.due_date < today && !doneIds.has(c.column_id)).length,
    };
  }, [live, initialColumns]);

  const lanesOn = view === "kanban" && groupBy !== "none";
  const lanes = useMemo(() => {
    if (groupBy === "priority") return PRIORITY_LANES.map(([key, label, dot]) => ({ key, label, dot }));
    if (groupBy === "energy") return ENERGY_LANES.map(([key, label, dot]) => ({ key, label, dot }));
    if (groupBy === "color") {
      const present = new Set(cards.map((c) => laneKeyOf(c, "color")));
      return [{ key: "none", label: "No colour", dot: "bg-zinc-500" },
        ...COLOR_KEYS.filter((k) => present.has(k)).map((k) => ({ key: k, label: PALETTE[k].label, dot: PALETTE[k].dot }))];
    }
    return [];
  }, [groupBy, cards]);

  /* ---------- drag & drop ---------- */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  // Column drags only see other columns; card drags never see columns' sortable handles.
  const collision: CollisionDetection = (args) => {
    const draggingColumn = String(args.active.id).startsWith(COL_PREFIX);
    const droppableContainers = args.droppableContainers.filter((c) => String(c.id).startsWith(COL_PREFIX) === draggingColumn);
    return (draggingColumn ? closestCenter : closestCorners)({ ...args, droppableContainers });
  };
  const dragStartCards = useRef<Card[]>([]);
  const activeCard = cards.find((c) => c.id === activeId) ?? null;
  const editingCard = cards.find((c) => c.id === editingId) ?? null;

  // An id can be a column, a swimlane cell ("cell|lane|column") or a card
  const parseId = (id: string): { col: string; lane?: string } | null => {
    if (id.startsWith("cell|")) { const [, lane, col] = id.split("|"); return { col, lane }; }
    if (colById[id]) return { col: id };
    const card = cards.find((k) => k.id === id);
    return card ? { col: card.column_id, lane: lanesOn ? laneKeyOf(card, groupBy) : undefined } : null;
  };

  const onDragStart = (e: DragStartEvent) => {
    if (String(e.active.id).startsWith(COL_PREFIX)) { setActiveColumnId(String(e.active.id).slice(COL_PREFIX.length)); return; }
    dragStartCards.current = cards; setActiveId(String(e.active.id));
  };

  const onColumnDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveColumnId(null);
    if (!over || active.id === over.id) return;
    const ids = initialColumns.map((c) => c.id);
    const from = ids.indexOf(String(active.id).slice(COL_PREFIX.length));
    const to = ids.indexOf(String(over.id).slice(COL_PREFIX.length));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setColOrder({ base: serverColumns, ids: next }); // show the new order immediately
    startTransition(async () => {
      const result = await reorderColumns(board.id, next);
      if ("error" in result) { setColOrder(null); toast(result.error, "error"); } else router.refresh();
    });
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over || String(active.id).startsWith(COL_PREFIX)) return;
    const t = parseId(String(over.id));
    const cur = cards.find((c) => c.id === active.id);
    if (!t || !cur) return;
    const laneChanged = lanesOn && t.lane !== undefined && t.lane !== laneKeyOf(cur, groupBy);
    if (t.col === cur.column_id && !laneChanged) return;
    setCards((prev) => prev.map((c) => (c.id === cur.id ? { ...c, column_id: t.col, ...(laneChanged ? lanePatchOf(groupBy, t.lane!) : {}) } : c)));
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (String(e.active.id).startsWith(COL_PREFIX)) { onColumnDragEnd(e); return; }
    setActiveId(null);
    const { active, over } = e;
    const original = dragStartCards.current.find((c) => c.id === active.id);
    const t = over ? parseId(String(over.id)) : null;
    const cur = cards.find((c) => c.id === active.id);
    if (!over || !t || !original || !cur) { setCards(dragStartCards.current); return; } // dropped outside: undo

    const laneChanged = lanesOn && t.lane !== undefined && t.lane !== laneKeyOf(cur, groupBy);
    const siblings = cards.filter((c) => c.column_id === t.col && c.id !== active.id).sort((a, b) => a.order_index - b.order_index);
    const overIdx = siblings.findIndex((c) => c.id === over.id);
    const idx = overIdx === -1 ? siblings.length : overIdx;
    const before = siblings[idx - 1]?.order_index;
    const after = siblings[idx]?.order_index;
    const order_index =
      before === undefined && after === undefined ? 1000
      : before === undefined ? after! - 1000
      : after === undefined ? before + 1000
      : (before + after) / 2;

    const doneNow = isDoneName(colById[t.col]?.name ?? "");
    const final: Card = {
      ...cur, ...(laneChanged ? lanePatchOf(groupBy, t.lane!) : {}), column_id: t.col, order_index,
      completed_at: doneNow ? original.completed_at ?? new Date().toISOString() : null,
      subtasks: doneNow ? allDone(cur.subtasks) : cur.subtasks, // rule: entering Done completes subtasks
    };
    const extra: CardAttrs = {};
    if (final.priority !== original.priority) extra.priority = final.priority;
    if (final.energy_level !== original.energy_level) extra.energy_level = final.energy_level;
    if ((final.color ?? null) !== (original.color ?? null)) extra.color = final.color ?? null;

    setCards((p) => p.map((c) => (c.id === final.id ? final : c)));
    startTransition(async () => {
      try { await moveCard(final.id, t.col, order_index, extra); } catch { setCards(dragStartCards.current); }
    });
  };

  /* ---------- card CRUD ---------- */
  const addCard = async (column_id: string, title: string, extra: CardAttrs = {}) => {
    const list = cards.filter((c) => c.column_id === column_id);
    const order_index = Math.max(0, ...list.map((c) => c.order_index)) + 1000;
    const created = await createCard({ column_id, board_id: board.id, title, order_index, due_date: defaultDueDate(), ...extra });
    setCards((p) => [...p, created as Card]);
  };

  const saveTags = (cardId: string, ids: string[]) => {
    const snapshot = cardTags;
    setCardTagsState((p) => ({ ...p, [cardId]: ids }));
    startTransition(async () => {
      const res = await setCardTags(cardId, ids).catch(() => null);
      if (!res?.ok) setCardTagsState(snapshot);
    });
  };

  const saveCard = (id: string, patch: Partial<Card>) => {
    const snapshot = cards;
    setCards((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    startTransition(async () => {
      try {
        const row = await updateCard(id, patch as Record<string, unknown>);
        // Automation rules can move the card or tick subtasks server-side; mirror whatever they did.
        if (row) setCards((p) => p.map((c) => (c.id === id ? { ...c, column_id: row.column_id, order_index: row.order_index, completed_at: row.completed_at, subtasks: row.subtasks } : c)));
      } catch { setCards(snapshot); }
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

  /* ---------- attachments (browser -> Supabase Storage) ---------- */
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

  /* ---------- render ---------- */
  /* ---------- keyboard navigation, multi-select, templates ---------- */
  const me = currentUser.id;
  const toggleSelect = (id: string) => setSelectedIds((s) => toggleIn(s, id));
  const clearSelection = () => { setSelectedIds(new Set()); setSelectMode(false); };
  const selectedList = useMemo(() => [...selectedIds].filter((id) => cards.some((c) => c.id === id)), [selectedIds, cards]);

  useEffect(() => {
    if (view !== "kanban") return;
    const grid = initialColumns.map((c) => (collapsedCols.has(c.id) ? [] : (byColumn[c.id] ?? []).map((k) => k.id)));
    const KEYS: Record<string, NavKey> = { j: "down", k: "up", h: "left", l: "right", ArrowDown: "down", ArrowUp: "up", ArrowLeft: "left", ArrowRight: "right" };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || editingId || tagsOpen) return;
      const handled = () => { e.preventDefault(); e.stopPropagation(); }; // capture phase: keeps dnd-kit from seeing Space

      if (e.key === "Escape") {
        if (focusedId || selectedIds.size || selectMode) { handled(); setFocusedId(null); clearSelection(); }
        return;
      }
      const nav = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (nav) {
        if (e.key.startsWith("Arrow") && !focusedId) return; // arrows only steer once the cursor is active
        handled();
        const next = moveCursor(grid, focusedId, nav);
        setFocusedId(next);
        if (next) document.getElementById(`card-${next}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
      if (!focusedId) return;
      const key = e.key.toLowerCase();
      if (key === "x") { handled(); toggleSelect(focusedId); }
      else if (key === "enter") { handled(); setEditingId(focusedId); }
      else if (canEdit && (e.key === " " || key === "m")) {
        const card = cards.find((c) => c.id === focusedId);
        if (card) { handled(); saveCard(card.id, { assignee_id: card.assignee_id === me ? null : me }); }
      } else if (canEdit && key === "e") { handled(); setRenameId(focusedId); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, initialColumns, collapsedCols, byColumn, focusedId, selectedIds, selectMode, editingId, tagsOpen, cards, canEdit, me]);

  // Bulk actions update the board optimistically; on failure the snapshot is restored.
  const takeSnapshot = () => { bulkSnapshot.current = { cards, cardTags }; };
  const restoreSnapshot = () => {
    if (bulkSnapshot.current) { setCards(bulkSnapshot.current.cards); setCardTagsState(bulkSnapshot.current.cardTags); }
    router.refresh();
  };
  const bulkChange = (ids: string[], patch: Partial<Card>) => {
    takeSnapshot();
    const targetCol = patch.column_id ? colById[patch.column_id] : null;
    let nextOrder = targetCol ? Math.max(0, ...cards.filter((c) => c.column_id === targetCol.id).map((c) => c.order_index)) : 0;
    setCards((p) => p.map((c) => {
      if (!ids.includes(c.id)) return c;
      if (!targetCol) return { ...c, ...patch };
      nextOrder += 1000;
      const toDone = isDoneName(targetCol.name);
      return { ...c, ...patch, order_index: nextOrder, completed_at: toDone ? c.completed_at ?? new Date().toISOString() : null, subtasks: toDone ? allDone(c.subtasks) : c.subtasks };
    }));
  };
  const bulkRemoved = (ids: string[]) => {
    takeSnapshot();
    setCards((p) => p.filter((c) => !ids.includes(c.id)));
    setAttachments((p) => p.filter((a) => !ids.includes(a.card_id)));
  };
  const bulkTags = (ids: string[], tagId: string, add: boolean) => {
    takeSnapshot();
    setCardTagsState((p) => {
      const next = { ...p };
      for (const id of ids) {
        const cur = next[id] ?? [];
        next[id] = add ? (cur.includes(tagId) ? cur : [...cur, tagId]) : cur.filter((t) => t !== tagId);
      }
      return next;
    });
  };

  const addFromTemplate = async (columnId: string, t: CardTemplate) => {
    const list = cards.filter((c) => c.column_id === columnId);
    const order_index = Math.max(0, ...list.map((c) => c.order_index)) + 1000;
    const created = await createCard({
      column_id: columnId, board_id: board.id, title: t.title.trim() || t.name, order_index, due_date: defaultDueDate(),
      description: t.description, subtasks: freshSubtasks(t), priority: t.priority, energy_level: t.energy_level,
    });
    setCards((p) => [...p, created as Card]);
    setEditingId((created as Card).id); // open it so the title/details can be filled in straight away
  };
  const removeTemplate = (id: string) => {
    const snapshot = templates;
    setTemplates((p) => p.filter((t) => t.id !== id));
    deleteCardTemplate(id).then((r) => { if (!r.ok) setTemplates(snapshot); }).catch(() => setTemplates(snapshot));
  };
  const allTemplates = useMemo(() => [...builtinTemplates(), ...templates], [templates]);
  const saveAsTemplate = async (cardId: string, name: string) => {
    const res = await saveCardAsTemplate(cardId, name);
    if (res.ok) setTemplates((p) => [...p, res.template]);
    return res.ok ? null : res.error;
  };

  const cardProps = { attByCard, previews, canEdit, onEdit: setEditingId, onDelete: removeCard, onRename: (id: string, title: string) => saveCard(id, { title }), onDueDate: (id: string, due: string | null) => saveCard(id, { due_date: due }) };
  const editFor = (): ColumnEdit | undefined => (canEdit ? { boardId: board.id, onChanged: () => router.refresh() } : undefined);
  const tplVars = {
    "--tpl-sm": initialColumns.map((c) => (collapsedCols.has(c.id) ? "2.75rem" : "minmax(78vw,1fr)")).join(" "),
    "--tpl-md": initialColumns.map((c) => (collapsedCols.has(c.id) ? "2.75rem" : "minmax(14rem,1fr)")).join(" "),
  } as React.CSSProperties;
  const gridCls = "grid gap-3 md:gap-4 [grid-template-columns:var(--tpl-sm)] md:[grid-template-columns:var(--tpl-md)]";
  const ctl = "fd-select h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-sm capitalize outline-none focus:border-indigo-500";
  const views: [View, string, React.ReactNode][] = [
    ["kanban", "Board View", <Columns3 key="k" className="h-4 w-4" />],
    ["list", "List", <List key="l" className="h-4 w-4" />],
    ["calendar", "Calendar", <CalendarDays key="c" className="h-4 w-4" />],
    ["timeline", "Timeline / Gantt", <CalendarRange key="t" className="h-4 w-4" />],
    ["dashboard", "Dashboard", <LayoutDashboard key="d" className="h-4 w-4" />],
  ];

  return (
    <MembersProvider value={members}>
    <TagsProvider value={{ tags, byCard: cardTags }}>
    <BoardUiProvider value={{ focusedId, selectedIds, selectMode, renameId, toggleSelect, clearRename: () => setRenameId(null), templates: allTemplates, addFromTemplate, removeTemplate, canEdit }}>
    <div className="fd-fade-in flex h-full flex-col">
      <header className="border-b border-zinc-800 px-4 py-3 md:px-6 md:py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0">
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
                {canAdmin && <button onClick={() => { setDraft(name); setRenaming(true); }} title="Rename board" aria-label="Rename board"
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 md:opacity-0 md:group-hover:opacity-100">
                  <Pencil className="h-3.5 w-3.5" />
                </button>}
              </div>
            )}
            {board.description && <p className="text-xs text-zinc-500">{board.description}</p>}
          </div>

          {/* Quick stats */}
          <div className="hidden flex-wrap items-center gap-2 text-xs sm:flex">
            <span title="Cards moved to Done in the last 7 days" className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${stats.velocity > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>
              <TrendingUp className="h-3.5 w-3.5" /> Velocity {stats.velocity}/wk
            </span>
            {stats.blocked > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-300"><Ban className="h-3.5 w-3.5" /> {stats.blocked} blocked</span>
            )}
            {stats.overdue > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300"><Clock className="h-3.5 w-3.5" /> {stats.overdue} overdue</span>
            )}
          </div>

          {/* Invite + view picker */}
          <div className="ml-auto flex items-center gap-2">
            {canInvite && <InviteMembersButton boardId={board.id} boardName={name} />}
            {canAdmin && <BoardSettings boardId={board.id} days={board.auto_archive_days ?? null} />}
            <button onClick={() => setTagsOpen(true)} title="Manage tags" aria-label="Manage tags"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-sm text-zinc-300 hover:border-zinc-700">
              <TagsIcon className="h-4 w-4" /><span className="hidden sm:inline">Tags</span>
            </button>
            <ViewMenu views={views} value={view} onChange={setView} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this board's cards…"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-8 pr-3 text-sm outline-none focus:border-indigo-500" />
          </div>
          <FiltersMenu priority={priority} energy={energy} onPriority={setPriority} onEnergy={setEnergy} />
          {canEdit && view !== "dashboard" && (
            <button onClick={() => { setSelectMode((m) => !m); if (selectMode) setSelectedIds(new Set()); }} aria-pressed={selectMode} title="Select multiple cards (or Shift+click)"
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm ${selectMode ? "border-indigo-500 bg-indigo-500/15 text-indigo-200" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"}`}>
              <CheckSquare className="h-4 w-4" /><span className="hidden sm:inline">Select</span>
            </button>
          )}
          {archivedCount > 0 && (
            <button onClick={() => setShowArchived((s) => !s)} aria-pressed={showArchived} title={showArchived ? "Hide archived cards" : "Show archived cards"}
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm ${showArchived ? "border-indigo-500 bg-indigo-500/15 text-indigo-200" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"}`}>
              <Archive className="h-4 w-4" /><span className="hidden sm:inline">Archived ({archivedCount})</span>
            </button>
          )}
          {view === "kanban" && (
            <>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={ctl} title="Swimlanes">
                <option value="none">Group: none</option>
                <option value="priority">Group: priority</option>
                <option value="energy">Group: energy</option>
                <option value="color">Group: colour</option>
              </select>
              <button onClick={() => setPreviews((p) => !p)} aria-pressed={previews} title={previews ? "Image previews on (click to hide)" : "Image previews off (click to show)"}
                aria-label="Toggle image previews"
                className={`flex h-9 w-9 items-center justify-center rounded-lg border ${previews ? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white" : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-200"}`}>
                {previews ? <ImageIcon className="h-4 w-4" /> : <ImageOff className="h-4 w-4" />}
              </button>
            </>
          )}
        </div>
      </header>

      {view === "dashboard" && (
        <BoardDashboard cards={visible} columns={initialColumns} members={members} today={toISO(new Date())}
          commentAuthors={initialComments.filter((c) => cards.some((k) => k.id === c.card_id)).map((c) => c.user_id)} />
      )}
      {view === "list" && <ListView columns={initialColumns} cards={visible} colColors={colColors} onEdit={setEditingId} />}
      {view === "calendar" && <CalendarView columns={initialColumns} cards={visible} colColors={colColors} onEdit={setEditingId} />}
      {view === "timeline" && <TimelineView columns={initialColumns} cards={visible} colColors={colColors} onEdit={setEditingId}
        onChange={(id, patch) => saveCard(id, patch)} exportData={{ cards, members, boardName: name }} />}

      {view === "kanban" && (
        <DndContext id={`board-${board.id}`} sensors={sensors} collisionDetection={collision}
          onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}
          onDragCancel={() => { if (activeColumnId) { setActiveColumnId(null); return; } setActiveId(null); setCards(dragStartCards.current); }}>
          {cards.length === 0 && canEdit && (
            <p className="mx-4 mt-4 rounded-xl border border-dashed border-zinc-700 px-4 py-3 text-sm text-zinc-400 md:mx-6">
              This board is empty. Choose <strong className="font-medium text-zinc-200">Add card</strong> under any column to start, or use <strong className="font-medium text-zinc-200">⋯</strong> on a column to rename it or set a WIP limit.
            </p>
          )}
          {!lanesOn ? (
            <div className="flex flex-1 snap-x snap-proximity gap-3 overflow-x-auto p-4 md:gap-4 md:p-6">
              <SortableContext items={initialColumns.map((c) => COL_PREFIX + c.id)} strategy={horizontalListSortingStrategy}>
              {initialColumns.map((col) => (
                <KanbanColumn key={col.id} edit={editFor()} column={col} colorKey={colColors[col.id]} autoColor={autoColors[col.id]} cards={byColumn[col.id] ?? []}
                  totalCount={live.filter((c) => c.column_id === col.id).length}
                  collapsed={collapsedCols.has(col.id)} onToggleCollapse={() => setCollapsedCols((s) => toggleIn(s, col.id))}
                  hiddenCount={hiddenCount(col.id)} onToggleHidden={() => setHiddenCols((s) => toggleIn(s, col.id))}
                  onAdd={(title) => addCard(col.id, title)} {...cardProps} />
              ))}
              </SortableContext>
              {canEdit && <AddColumn boardId={board.id} count={initialColumns.length} onChanged={() => router.refresh()} />}
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-4 pb-24 md:p-6 md:pb-24">
              <div className={`${gridCls} sticky top-0 z-10 mb-3 bg-zinc-950 pb-2`} style={tplVars}>
                {initialColumns.map((col) => {
                  const n = live.filter((c) => c.column_id === col.id).length;
                  const st = wipState(col, n);
                  return collapsedCols.has(col.id) ? (
                    <button key={col.id} onClick={() => setCollapsedCols((s) => toggleIn(s, col.id))} title={`Expand ${col.name}`}
                      className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 py-3 text-zinc-500 hover:text-zinc-200">
                      <ChevronsRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <div key={col.id} className={`rounded-xl border ${st === "over" ? "border-rose-500/60 bg-rose-500/10" : st === "at" ? "border-amber-500/60 bg-amber-500/5" : "border-zinc-800 bg-zinc-900/60"}`}>
                      <ColumnHeader column={col} colorKey={colColors[col.id]} autoColor={autoColors[col.id]} totalCount={n} onToggle={() => setCollapsedCols((s) => toggleIn(s, col.id))}
                        hidden={hiddenCols.has(col.id)} onToggleHidden={() => setHiddenCols((s) => toggleIn(s, col.id))} edit={editFor()} />
                    </div>
                  );
                })}
              </div>
              {lanes.map((lane) => {
                const laneCards = shown.filter((c) => laneKeyOf(c, groupBy) === lane.key);
                const open = !collapsedLanes.has(lane.key);
                return (
                  <section key={lane.key} className="mb-4">
                    <button onClick={() => setCollapsedLanes((s) => toggleIn(s, lane.key))} className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${open ? "" : "-rotate-90"}`} />
                      <span className={`h-2.5 w-2.5 rounded-full ${lane.dot}`} />
                      {lane.label}
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{laneCards.length}</span>
                    </button>
                    {open && (
                      <div className={gridCls} style={tplVars}>
                        {initialColumns.map((col) => (
                          <LaneCell key={col.id} laneKey={lane.key} column={col} colorKey={colColors[col.id]}
                            cards={laneCards.filter((c) => c.column_id === col.id)} collapsed={collapsedCols.has(col.id)}
                            onAdd={(title) => addCard(col.id, title, lanePatchOf(groupBy, lane.key))} {...cardProps} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
          <DragOverlay>
            {activeCard && (
              <CardView card={activeCard} overlay attachments={attByCard[activeCard.id] ?? []} showPreviews={previews}
                colorKey={effectiveColor(activeCard.color, colColors[activeCard.column_id])} />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {selectedList.length > 0 && (
        <BulkBar ids={selectedList} cards={cards} columns={initialColumns} members={members} tags={tags} onClear={clearSelection}
          onCardsChange={bulkChange} onCardsRemoved={bulkRemoved} onTagsChange={bulkTags} onRefresh={restoreSnapshot} />
      )}

      {tagsOpen && (
        <TagManager boardId={board.id} tags={tags} canEdit={canEdit} onClose={() => setTagsOpen(false)}
          onCreated={(t) => setTags((p) => [...p, t].sort((a, b) => a.name.localeCompare(b.name)))}
          onUpdated={(t) => setTags((p) => p.map((x) => (x.id === t.id ? t : x)).sort((a, b) => a.name.localeCompare(b.name)))}
          onDeleted={(id) => {
            setTags((p) => p.filter((x) => x.id !== id));
            setCardTagsState((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.filter((t) => t !== id)])));
          }} />
      )}

      <AnimatePresence>
        {editingCard && (
          <CardModal key={editingCard.id} card={editingCard} columnColor={colColors[editingCard.column_id]}
            attachments={attByCard[editingCard.id] ?? []} comments={initialComments.filter((comment) => comment.card_id === editingCard.id)}
            currentUser={currentUser} readOnly={!canEdit} onUpload={uploadFiles} onRemoveAttachment={removeAttachment}
            onSave={(patch) => saveCard(editingCard.id, patch)} onSaveTags={(ids) => saveTags(editingCard.id, ids)}
            onManageTags={() => setTagsOpen(true)} onSaveTemplate={canEdit ? (name) => saveAsTemplate(editingCard.id, name) : undefined}
            onDelete={() => removeCard(editingCard.id)}
            onClose={() => setEditingId(null)} />
        )}
      </AnimatePresence>
    </div>
    </BoardUiProvider>
    </TagsProvider>
    </MembersProvider>
  );
}

/* ====================== columns ====================== */
const COL_PREFIX = "col|"; // sortable id of a column, to tell it apart from card and column-drop ids
type CardActions = {
  attByCard: Record<string, Attachment[]>; previews: boolean; canEdit: boolean;
  onEdit: (id: string) => void; onDelete: (id: string) => void; onRename: (id: string, title: string) => void; onDueDate: (id: string, due: string | null) => void;
};

type ColumnHandle = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners"> & { setActivator: (el: HTMLElement | null) => void };

function ColumnGrip({ name, handle }: { name: string; handle: ColumnHandle }) {
  const { attributes, listeners, setActivator } = handle;
  return (
    <button ref={setActivator} {...attributes} {...listeners} title="Drag to reorder column" aria-label={`Reorder ${name}`}
      className="-ml-1 shrink-0 cursor-grab touch-none rounded p-0.5 text-zinc-500 hover:text-zinc-200 active:cursor-grabbing md:opacity-0 md:focus-visible:opacity-100 md:group-hover/col:opacity-100"><GripVertical className="h-4 w-4" /></button>
  );
}

function ColumnHeader({ column, colorKey, autoColor, totalCount, onToggle, hidden, onToggleHidden, edit, handle }:
  { column: Column; colorKey: ColorKey; autoColor: ColorKey; totalCount: number; onToggle: () => void; hidden?: boolean; onToggleHidden?: () => void; edit?: ColumnEdit; handle?: ColumnHandle }) {
  const st = wipState(column, totalCount);
  const done = isDoneName(column.name);
  return (
    <div className="group/col flex items-center gap-2 px-3 py-3">
      {handle && <ColumnGrip name={column.name} handle={handle} />}
      <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PALETTE[colorKey].dot}`} />
        <span className="min-w-0 truncate" title={column.name}>{column.name}</span>
      </h2>
      {done && hidden && <EyeOff className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-label="Completed cards are hidden" />}
      <span title={wipTitle(column, totalCount)} className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        st === "over" ? "bg-rose-500/20 text-rose-300" : st === "at" ? "bg-amber-500/20 text-amber-300" : "bg-zinc-800 text-zinc-300"}`}>
        {st !== "ok" && <AlertTriangle className="h-3 w-3" />}
        {totalCount}{column.wip_limit !== null && ` / ${column.wip_limit}`}
      </span>
      <ColumnMenu column={column} edit={edit} autoColor={autoColor} onCollapse={onToggle} completedHidden={hidden} onToggleCompleted={done ? onToggleHidden : undefined} />
    </div>
  );
}

function AddCard({ onAdd, columnId }: { onAdd: (title: string) => Promise<void>; columnId: string }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  return adding ? (
    <form onSubmit={async (e) => { e.preventDefault(); if (!title.trim()) return; await onAdd(title.trim()); setTitle(""); setAdding(false); }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => !title && setAdding(false)}
        placeholder="Card title, then Enter"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
    </form>
  ) : (
    <div className="flex items-center gap-1">
      <button onClick={() => setAdding(true)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
        <Plus className="h-4 w-4" /> Add card
      </button>
      <TemplateMenu columnId={columnId} />
    </div>
  );
}

function EmptyDrop({ filtered, isOver }: { filtered: boolean; isOver: boolean }) {
  return (
    <div className={`rounded-lg border border-dashed px-3 py-4 text-center text-xs transition-colors ${
      isOver ? "border-indigo-500/60 bg-indigo-500/5 text-indigo-300" : "border-transparent text-zinc-400"}`}>
      {filtered ? "No cards match your filters" : "Drop here"}
    </div>
  );
}

function KanbanColumn({ column, colorKey, autoColor, cards, totalCount, collapsed, onToggleCollapse, hiddenCount = 0, onToggleHidden, onAdd, edit, attByCard, previews, canEdit, onEdit, onDelete, onRename, onDueDate }: {
  column: Column; colorKey: ColorKey; autoColor: ColorKey; cards: Card[]; totalCount: number; collapsed: boolean; edit?: ColumnEdit;
  onToggleCollapse: () => void; hiddenCount?: number; onToggleHidden?: () => void; onAdd: (title: string) => Promise<void>;
} & CardActions) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id });
  const sortable = useSortable({ id: COL_PREFIX + column.id, disabled: !edit });
  const setNodeRef = (el: HTMLElement | null) => { setDropRef(el); sortable.setNodeRef(el); };
  const dragStyle = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.6 : undefined };
  const st = wipState(column, totalCount);

  // Collapsed: thin vertical ribbon (still a drop target)
  if (collapsed) {
    return (
      <section ref={setNodeRef} style={dragStyle} onClick={onToggleCollapse} title={`Expand ${column.name}`}
        className={`flex w-11 shrink-0 cursor-pointer flex-col items-center gap-3 rounded-xl border bg-zinc-900/60 py-3 transition-colors hover:bg-zinc-800/60 ${
          isOver ? "border-indigo-500/60" : "border-zinc-800"}`}>
        <ChevronsRight className="h-4 w-4 text-zinc-500" />
        <span className={`h-2.5 w-2.5 rounded-full ${PALETTE[colorKey].dot}`} />
        <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">{totalCount}</span>
        <span className="text-sm font-medium text-zinc-400" style={{ writingMode: "vertical-rl" }}>{column.name}</span>
      </section>
    );
  }

  const wrap = st === "over" ? "border-rose-500/60 bg-rose-500/10"
    : st === "at" ? "border-amber-500/60 bg-amber-500/5"
    : isOver ? "border-indigo-500/60 bg-zinc-900/60" : "border-zinc-800 bg-zinc-900/60";

  return (
    <section ref={setNodeRef} style={dragStyle}
      className={`relative flex w-[82vw] max-w-xs shrink-0 snap-start flex-col rounded-xl border transition-colors md:w-auto md:max-w-none md:min-w-[14rem] md:flex-1 ${wrap}`}>
      <span aria-hidden className={`pointer-events-none absolute inset-x-4 top-0 h-0.5 rounded-b-full ${PALETTE[colorKey].dot}`} />
      <ColumnHeader column={column} colorKey={colorKey} autoColor={autoColor} totalCount={totalCount} onToggle={onToggleCollapse}
        hidden={hiddenCount > 0 || undefined} onToggleHidden={onToggleHidden} edit={edit} handle={edit ? { attributes: sortable.attributes, listeners: sortable.listeners, setActivator: sortable.setActivatorNodeRef } : undefined} />

      {st === "over" && (
        <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-2 py-1.5 text-xs text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          WIP limit exceeded by {totalCount - (column.wip_limit ?? 0)} — finish something before pulling more.
        </div>
      )}

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[60px] flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
          {hiddenCount > 0 && (
            <button onClick={onToggleHidden} className="rounded-lg border border-dashed border-zinc-700 px-3 py-6 text-center text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300">
              {hiddenCount} card{hiddenCount === 1 ? "" : "s"} hidden — click to show
            </button>
          )}
          {cards.length === 0 && hiddenCount === 0 && (totalCount > 0 || isOver) && <EmptyDrop filtered={totalCount > 0} isOver={isOver} />}
          <AnimatePresence initial={false}>
            {cards.map((c) => (
              <SortableCard key={c.id} card={c} colorKey={effectiveColor(c.color, colorKey)}
                attachments={attByCard[c.id] ?? []} previews={previews} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} onRename={onRename} onDueDate={onDueDate} />
            ))}
          </AnimatePresence>
          {canEdit && <AddCard onAdd={onAdd} columnId={column.id} />}
        </div>
      </SortableContext>
    </section>
  );
}

function LaneCell({ laneKey, column, colorKey, cards, collapsed, onAdd, attByCard, previews, canEdit, onEdit, onDelete, onRename, onDueDate }: {
  laneKey: string; column: Column; colorKey: ColorKey; cards: Card[]; collapsed: boolean; onAdd: (title: string) => Promise<void>;
} & CardActions) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell|${laneKey}|${column.id}` });
  if (collapsed) return <div ref={setNodeRef} className="rounded-lg border border-zinc-800/60 bg-zinc-900/30" />;
  return (
    <div ref={setNodeRef}
      className={`flex min-h-[88px] flex-col gap-2 rounded-lg border p-2 transition-colors ${
        isOver ? "border-indigo-500/60 bg-indigo-500/5" : "border-zinc-800/70 bg-zinc-900/40"}`}>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <AnimatePresence initial={false}>
          {cards.map((c) => (
            <SortableCard key={c.id} card={c} colorKey={effectiveColor(c.color, colorKey)}
              attachments={attByCard[c.id] ?? []} previews={previews} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} onRename={onRename} onDueDate={onDueDate} />
          ))}
        </AnimatePresence>
      </SortableContext>
      {canEdit && <AddCard onAdd={onAdd} columnId={column.id} />}
    </div>
  );
}

function SortableCard({ card, colorKey, attachments, previews, canEdit, onEdit, onDelete, onRename, onDueDate }: {
  card: Card; colorKey: ColorKey; attachments: Attachment[]; previews: boolean; canEdit: boolean;
  onEdit: (id: string) => void; onDelete: (id: string) => void; onRename: (id: string, title: string) => void; onDueDate: (id: string, due: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled: !canEdit });
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
        {...attributes} {...listeners}>
        <CardView card={card} colorKey={colorKey} attachments={attachments} showPreviews={previews}
          canEdit={canEdit}
          onEdit={() => onEdit(card.id)} onRename={(t) => onRename(card.id, t)} onDueDate={(d) => onDueDate(card.id, d)}
          onDelete={() => confirm("Delete this card?") && onDelete(card.id)} />
      </div>
    </motion.div>
  );
}

/* ---------- view picker (dropdown) ---------- */
function ViewMenu({ views, value, onChange }: { views: [View, string, React.ReactNode][]; value: View; onChange: (v: View) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const current = views.find(([v]) => v === value)!;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm hover:border-zinc-700">
        {current[2]}<span>{current[1]}</span><ChevronDown className={`h-4 w-4 text-zinc-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-zinc-800 bg-zinc-900 p-1 shadow-xl">
          {views.map(([v, label, icon]) => (
            <button key={v} role="menuitemradio" aria-checked={v === value} onClick={() => { onChange(v); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800 ${v === value ? "text-indigo-300" : "text-zinc-300"}`}>
              {icon}<span className="flex-1">{label}</span>{v === value && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- "New from template" menu next to Add card ---------- */
function TemplateMenu({ columnId }: { columnId: string }) {
  const ui = useBoardUi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="New from template" aria-label="New card from template"
        className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><LayoutTemplate className="h-4 w-4" /></button>
      {open && (
        <div role="menu" className="absolute bottom-9 right-0 z-30 max-h-72 w-60 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          <p className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-zinc-500">New from template</p>
          {ui.templates.map((t) => (
            <div key={t.id} className="flex items-center rounded-lg hover:bg-zinc-800">
              <button role="menuitem" disabled={busy !== null} className="min-w-0 flex-1 px-3 py-2 text-left text-sm disabled:opacity-60"
                onClick={async () => { setBusy(t.id); try { await ui.addFromTemplate(columnId, t); setOpen(false); } finally { setBusy(null); } }}>
                <span className="block truncate">{t.name}</span>
                <span className="block truncate text-[11px] text-zinc-500">{t.builtin ? "Built-in" : "Board template"} · {t.subtasks.length} subtasks</span>
              </button>
              {!t.builtin && <button aria-label={`Delete template ${t.name}`} title="Delete template" onClick={() => confirm(`Delete the template “${t.name}”?`) && ui.removeTemplate(t.id)}
                className="mr-1 rounded p-1.5 text-zinc-500 hover:text-rose-400"><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
