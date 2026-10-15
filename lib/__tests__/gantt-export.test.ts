import { describe, expect, it } from "vitest";
import { buildGanttPlan } from "../gantt-export";
import type { Card, Column } from "../types";

const columns: Column[] = [
  { id: "c1", board_id: "b", name: "In Progress", order_index: 0, wip_limit: null },
  { id: "c2", board_id: "b", name: "Done", order_index: 1, wip_limit: null },
];
const colColors = { c1: "amber", c2: "emerald" } as const;
const card = (over: Partial<Card>): Card => ({
  id: "x", column_id: "c1", board_id: "b", title: "T", description: null, priority: "medium", energy_level: "low",
  due_date: null, subtasks: [], order_index: 0, ...over,
});
const plan = (cards: Card[]) => buildGanttPlan({ cards, columns, members: [], colColors: { ...colColors }, today: "2026-10-15" });

describe("buildGanttPlan", () => {
  it("sorts by start date and spans the whole board", () => {
    const p = plan([
      card({ id: "b", title: "B", start_date: "2026-10-10", due_date: "2026-10-20" }),
      card({ id: "a", title: "A", start_date: "2026-10-01", due_date: "2026-10-05" }),
    ]);
    expect(p.rows.map((r) => r.title)).toEqual(["A", "B"]);
    expect([p.start, p.end]).toEqual(["2026-10-01", "2026-10-20"]);
  });
  it("skips archived cards and starts undated cards at creation, like the Timeline view", () => {
    const p = plan([card({ id: "a", archived_at: "2026-10-01" }), card({ id: "b", due_date: "2026-10-12", created_at: "2026-10-12T08:00:00Z" })]);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ barStart: "2026-10-12", barEnd: "2026-10-12" });
  });
  it("uses the card colour over the column colour and lightens done cards", () => {
    const p = plan([
      card({ id: "a", color: "violet", due_date: "2026-10-12" }),
      card({ id: "b", column_id: "c2", due_date: "2026-10-12" }),
    ]);
    expect(p.rows.find((r) => r.status === "In Progress")?.color).toBe("8B5CF6");
    expect(p.rows.find((r) => r.status === "Done")?.color).not.toBe("10B981");
  });
  it("clamps very long ranges", () => {
    const p = plan([card({ start_date: "2020-01-01", due_date: "2026-01-01" })]);
    expect(p.end < "2026-01-01").toBe(true);
  });
});

describe("buildGanttWorkbook", () => {
  it("writes a valid xlsx whose bars are driven by the Start/Due cells", async () => {
    const { buildGanttWorkbook } = await import("../gantt-export");
    const book = await buildGanttWorkbook({
      cards: [card({ id: "a", title: "Task A", start_date: "2026-10-01", due_date: "2026-10-05" })],
      columns, members: [], colColors: { ...colColors }, today: "2026-10-15", boardName: "Demo",
    });
    const buffer = await book.xlsx.writeBuffer();
    expect(Buffer.from(buffer).subarray(0, 2).toString()).toBe("PK");
    const ExcelJS = (await import("exceljs")).default;
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.load(buffer);
    const sheet = reread.getWorksheet("Gantt")!;
    expect(sheet.getCell("A4").value).toBe("Task A");
    expect(sheet.getCell("G4").result ?? (sheet.getCell("G4").value as { result?: number }).result).toBe(5);
    const rules = JSON.stringify((sheet as unknown as { conditionalFormattings: unknown }).conditionalFormattings);
    expect(rules).toContain("$E4");
    expect(rules).toContain("TODAY()");
  }, 30_000);
});
