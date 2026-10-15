import { describe, expect, it } from "vitest";
import { COLOR_KEYS, columnColor, isColorKey } from "../colors";
import { parseColumnColor } from "../column-rules";

describe("column colours", () => {
  it("uses a saved colour first, then the name, then the position", () => {
    expect(columnColor("Backlog", 0, "violet")).toBe("violet");
    expect(columnColor("Backlog", 0, null)).toBe("slate");
    expect(columnColor("Backlog", 0)).toBe("slate");
    expect(columnColor("Something custom", 2)).toBe("amber");
  });
  it("ignores a saved value that is not a palette colour", () => {
    expect(columnColor("Done", 4, "chartreuse")).toBe("emerald");
    expect(columnColor("Done", 4, "constructor")).toBe("emerald"); // inherited object keys are not colours
    expect(isColorKey("toString")).toBe(false);
  });
  it("accepts only palette colours, or empty for automatic", () => {
    for (const k of COLOR_KEYS) expect(parseColumnColor(k)).toEqual({ value: k });
    expect(parseColumnColor(null)).toEqual({ value: null });
    expect(parseColumnColor("")).toEqual({ value: null });
    expect(parseColumnColor("#ff0000")).toHaveProperty("error");
  });
});
