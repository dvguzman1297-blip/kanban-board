import { describe, expect, it } from "vitest";
import { describeEvent } from "../card-events";
import { stripMarkdown, toggleCheckbox } from "../markdown";

describe("markdown helpers", () => {
  it("toggles only the requested checkbox", () => {
    const src = "- [ ] a\n- [x] b\n  - [ ] c";
    expect(toggleCheckbox(src, 0)).toBe("- [x] a\n- [x] b\n  - [ ] c");
    expect(toggleCheckbox(src, 1)).toBe("- [ ] a\n- [ ] b\n  - [ ] c");
    expect(toggleCheckbox(src, 2)).toBe("- [ ] a\n- [x] b\n  - [x] c");
  });
  it("strips formatting for card previews", () => {
    expect(stripMarkdown("## Title\n**bold** and `code` [link](http://x)\n- [ ] todo")).toBe("Title bold and code link ☐ todo");
  });
});

describe("describeEvent", () => {
  it("formats audit rows", () => {
    expect(describeEvent("moved", { from: "Backlog", to: "Done" })).toBe("moved this card from Backlog to Done");
    expect(describeEvent("due_date", { from: null, to: "2026-10-09" })).toBe("set the due date to 2026-10-09");
    expect(describeEvent("due_date", { from: "2026-10-09", to: null })).toBe("removed the due date");
    expect(describeEvent("assignee", { from: "Ann", to: null })).toBe("unassigned Ann");
    expect(describeEvent("tag_added", { tag: "Bug" })).toBe("added the tag “Bug”");
  });
});

import { moveCursor } from "../board-nav";

describe("moveCursor", () => {
  const cols = [["a1", "a2", "a3"], [], ["c1", "c2"]];
  it("steps within a column and clamps at the ends", () => {
    expect(moveCursor(cols, "a1", "down")).toBe("a2");
    expect(moveCursor(cols, "a3", "down")).toBe("a3");
    expect(moveCursor(cols, "a1", "up")).toBe("a1");
  });
  it("jumps across columns, skipping empty ones and keeping the row", () => {
    expect(moveCursor(cols, "a2", "right")).toBe("c2");
    expect(moveCursor(cols, "a3", "right")).toBe("c2");
    expect(moveCursor(cols, "c1", "left")).toBe("a1");
    expect(moveCursor(cols, "c1", "right")).toBe("c1");
  });
  it("starts on the first card when nothing is focused", () => {
    expect(moveCursor(cols, null, "down")).toBe("a1");
    expect(moveCursor([[], []], null, "down")).toBeNull();
    expect(moveCursor(cols, "gone", "left")).toBe("a1");
  });
});

import { applyChange, inviteParts, notificationHref, unreadCount, type AppNotification } from "../notifications";

describe("notifications helpers", () => {
  const n = (id: string, at: string, over: Partial<AppNotification> = {}): AppNotification => ({
    id, user_id: "u", type: "system", title: "t", message: "", metadata: {}, is_read: false, created_at: at, ...over,
  });
  it("describes invites and counts unread", () => {
    expect(inviteParts({ inviter_name: "Dave", board_name: "Main Operations", role: "editor" })).toEqual({ inviter: "Dave", board: "Main Operations", role: "Editor" });
    expect(inviteParts({}).role).toBe("Editor");
    expect(unreadCount([n("a", "1"), n("b", "2", { is_read: true })])).toBe(1);
  });
  it("applies realtime changes newest-first without duplicating", () => {
    let list = [n("a", "2026-01-01")];
    list = applyChange(list, "INSERT", n("b", "2026-02-01"));
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
    list = applyChange(list, "INSERT", n("b", "2026-02-01")); // echo of our own insert
    expect(list).toHaveLength(2);
    list = applyChange(list, "UPDATE", { id: "a", is_read: true });
    expect(list.find((x) => x.id === "a")?.is_read).toBe(true);
    list = applyChange(list, "DELETE", { id: "b" });
    expect(list.map((x) => x.id)).toEqual(["a"]);
  });
  it("links assignments to the card", () => {
    expect(notificationHref(n("x", "1", { type: "card_assigned", metadata: { board_id: "b1", card_id: "c1" } }))).toBe("/board/b1?card=c1");
    expect(notificationHref(n("y", "1", { type: "board_invite" }))).toBeNull();
  });
});
