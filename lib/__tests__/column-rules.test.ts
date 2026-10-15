import { describe, expect, it } from "vitest";
import { applyColumnOrder, checkColumnName, cleanColumnName, parseWipLimit } from "../column-rules";

describe("column rules", () => {
  it("cleans names", () => {
    expect(cleanColumnName("  Code   Review  ")).toBe("Code Review");
    expect(cleanColumnName("x".repeat(100))).toHaveLength(40);
    expect(cleanColumnName(null)).toBe("");
  });
  it("accepts empty or 1-99 WIP limits only", () => {
    expect(parseWipLimit("")).toEqual({ value: null });
    expect(parseWipLimit(null)).toEqual({ value: null });
    expect(parseWipLimit("5")).toEqual({ value: 5 });
    for (const bad of [0, -1, 100, 2.5, "abc"]) expect(parseWipLimit(bad), String(bad)).toHaveProperty("error");
  });
  it("rejects empty and duplicate names but lets a column keep its own", () => {
    const cols = [{ id: "a", name: "Backlog" }, { id: "b", name: "Done" }];
    expect(checkColumnName("", cols)).toMatch(/Enter/);
    expect(checkColumnName("backlog", cols)).toMatch(/already exists/);
    expect(checkColumnName("Backlog", cols, "a")).toBeNull();
    expect(checkColumnName("Testing", cols)).toBeNull();
  });
});

describe("applyColumnOrder", () => {
  const cols = [{ id: "a", order_index: 1 }, { id: "b", order_index: 2 }, { id: "c", order_index: 3 }];
  it("returns the saved order without an override", () => {
    expect(applyColumnOrder(cols, null).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
  it("follows the override and keeps unknown columns last, in saved order", () => {
    expect(applyColumnOrder(cols, ["c", "a", "b"]).map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(applyColumnOrder(cols, ["b"]).map((c) => c.id)).toEqual(["b", "a", "c"]);
  });
});
