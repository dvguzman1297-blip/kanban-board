"use client";
import { createContext, useContext } from "react";
import type { CardTemplate } from "@/lib/types";

/** Keyboard cursor, multi-selection and template hooks shared by every card on the board. */
export type BoardUi = {
  focusedId: string | null;
  selectedIds: Set<string>;
  selectMode: boolean;
  renameId: string | null;
  toggleSelect: (id: string) => void;
  clearRename: () => void;
  templates: CardTemplate[];
  addFromTemplate: (columnId: string, t: CardTemplate) => Promise<void>;
  removeTemplate: (id: string) => void;
  canEdit: boolean;
};

const empty: BoardUi = {
  focusedId: null, selectedIds: new Set(), selectMode: false, renameId: null, toggleSelect: () => {}, clearRename: () => {},
  templates: [], addFromTemplate: async () => {}, removeTemplate: () => {}, canEdit: false,
};

const Ctx = createContext<BoardUi>(empty);
export const BoardUiProvider = Ctx.Provider;
export const useBoardUi = () => useContext(Ctx);
