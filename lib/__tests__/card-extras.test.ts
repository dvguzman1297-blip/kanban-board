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
