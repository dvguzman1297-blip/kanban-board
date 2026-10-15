import { describe, expect, it } from "vitest";
import { BOARD_TEMPLATES, templateById } from "../board-templates";
import { isDoneName } from "../board-utils";

describe("board templates", () => {
  it("has unique ids and falls back to the standard board", () => {
    expect(new Set(BOARD_TEMPLATES.map((t) => t.id)).size).toBe(BOARD_TEMPLATES.length);
    expect(templateById("nope").id).toBe("standard");
    expect(templateById(undefined).id).toBe("standard");
  });
  it("every template ends in Done and has unique column names", () => {
    for (const t of BOARD_TEMPLATES) {
      const names = t.columns.map((c) => c.name);
      expect(isDoneName(names[names.length - 1]), t.id).toBe(true);
      expect(new Set(names.map((n) => n.toLowerCase())).size, t.id).toBe(names.length);
    }
  });
  it("example cards point at real, non-Done columns", () => {
    for (const t of BOARD_TEMPLATES) {
      for (const card of t.examples) {
        expect(t.columns[card.column], `${t.id}: ${card.title}`).toBeDefined();
        expect(isDoneName(t.columns[card.column].name), `${t.id}: ${card.title}`).toBe(false);
      }
    }
  });
});

describe("template column colours", () => {
  it("keeps red for Blocked and green for Done, and never repeats a colour side by side", async () => {
    const { columnColor } = await import("../colors");
    for (const t of BOARD_TEMPLATES) {
      const colours = t.columns.map((c, i) => columnColor(c.name, i));
      t.columns.forEach((c, i) => {
        if (c.name !== "Blocked") expect(colours[i], `${t.id}: ${c.name}`).not.toBe("rose");
        if (c.name !== "Done") expect(colours[i], `${t.id}: ${c.name}`).not.toBe("emerald");
        if (i > 0) expect(colours[i], `${t.id}: ${t.columns[i - 1].name} / ${c.name}`).not.toBe(colours[i - 1]);
      });
    }
  });
});
