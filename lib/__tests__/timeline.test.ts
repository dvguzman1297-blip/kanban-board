import { describe, expect, it } from "vitest";
import {
  addMonths, applyGesture, fromSpan, geometry, pxPerDay, stepAnchor, toSpan, weekStart, windowFor, winLength,
} from "../timeline";

describe("windows and navigation", () => {
  it("snaps weeks to Monday–Sunday", () => {
    expect(weekStart("2026-10-08")).toBe("2026-10-05"); // Thursday
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(windowFor("week", "2026-10-08")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
  });
  it("builds month, quarter and day windows", () => {
    expect(windowFor("month", "2026-02-14")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(windowFor("quarter", "2026-11-20")).toEqual({ start: "2026-10-01", end: "2027-09-30" });
    expect(winLength(windowFor("quarter", "2026-11-20"))).toBe(365);
    expect(windowFor("day", "2026-10-08")).toEqual({ start: "2026-10-08", end: "2026-10-08" });
  });
  it("steps by the active granularity", () => {
    expect(stepAnchor("week", "2026-10-08", 1)).toBe("2026-10-15");
    expect(stepAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(stepAnchor("month", "2026-03-15", -1)).toBe("2026-02-01");
    expect(stepAnchor("quarter", "2026-11-20", 1)).toBe("2027-01-01");
    expect(stepAnchor("day", "2026-10-08", -1)).toBe("2026-10-07");
    expect(stepAnchor("custom", "2026-10-01", 1, { start: "2026-10-01", end: "2026-10-14" })).toBe("2026-10-15");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("scales pixels per day with the mode", () => {
    expect(pxPerDay("day", windowFor("day", "2026-10-08"))).toBe(56 * 24);
    expect(pxPerDay("custom", { start: "2026-01-01", end: "2026-12-31" })).toBe(4);
  });
});

describe("spans and gestures", () => {
  const origin = "2026-10-05";
  const today = "2026-10-05";
  const card = { start_date: "2026-10-06", due_date: "2026-10-08", created_at: "2026-10-01T00:00:00Z" };

  it("covers whole days for untimed cards and round-trips", () => {
    const s = toSpan(card, origin, today);
    expect(s).toEqual({ s: 1440, e: 4 * 1440, timed: false });
    expect(fromSpan(s, origin)).toEqual({ start_date: "2026-10-06", due_date: "2026-10-08", start_time: null, due_time: null });
  });
  it("moves by whole days and keeps times null", () => {
    const moved = applyGesture(toSpan(card, origin, today), "move", 2 * 1440, 1440);
    expect(fromSpan(moved, origin)).toMatchObject({ start_date: "2026-10-08", due_date: "2026-10-10", start_time: null });
  });
  it("never shrinks below one day or one snap step", () => {
    const s = toSpan(card, origin, today);
    expect(fromSpan(applyGesture(s, "start", 10 * 1440, 1440), origin)).toMatchObject({ start_date: "2026-10-08", due_date: "2026-10-08" });
    expect(fromSpan(applyGesture(s, "end", -10 * 1440, 1440), origin)).toMatchObject({ start_date: "2026-10-06", due_date: "2026-10-06" });
  });
  it("stores times for hour-level edits, with 24:00 for end of day", () => {
    const day = { start_date: "2026-10-05", due_date: "2026-10-05" };
    const s = applyGesture(toSpan(day, origin, today), "start", 9 * 60, 30); // untimed -> becomes timed in day view
    const timed = { ...s, timed: true };
    expect(fromSpan(timed, origin)).toEqual({ start_date: "2026-10-05", due_date: "2026-10-05", start_time: "09:00:00", due_time: "24:00:00" });
    const shorter = applyGesture(timed, "end", -6 * 60, 30);
    expect(fromSpan(shorter, origin)).toMatchObject({ due_time: "18:00:00" });
  });
  it("clips bars to the window and hides ones outside it", () => {
    const win = { start: "2026-10-05", end: "2026-10-11" };
    const k = 120 / 1440;
    expect(geometry({ s: 1440, e: 3 * 1440, timed: false }, win, k)).toEqual({ left: 120, width: 240, clippedLeft: false, clippedRight: false });
    expect(geometry({ s: -1440, e: 1440, timed: false }, win, k)).toMatchObject({ left: 0, width: 120, clippedLeft: true });
    expect(geometry({ s: 8 * 1440, e: 9 * 1440, timed: false }, win, k)).toBeNull();
  });
});
