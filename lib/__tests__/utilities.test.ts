import { afterEach, describe, expect, it, vi } from "vitest";
import { isBlockedLike, isBlockedName, isDoneName, toISO } from "../board-utils";
import { columnColor, effectiveColor } from "../colors";
import { formatSize, isImage, safeName } from "../attachments";
import { timeAgo } from "../time";

describe("board utilities", () => {
  it("normalizes status names before matching", () => {
    expect(isDoneName(" Done ")).toBe(true);
    expect(isDoneName("completed")).toBe(false);
    expect(isBlockedName(" BLOCKED ")).toBe(true);
    expect(isBlockedLike(" Waiting ")).toBe(true);
    expect(isBlockedLike("In Progress")).toBe(false);
  });

  it("formats local dates with zero-padded month and day", () => {
    expect(toISO(new Date(2025, 0, 9))).toBe("2025-01-09");
  });
});

describe("column colors", () => {
  it("uses named defaults and cycles colors for custom columns", () => {
    expect(columnColor(" In Progress ", 2)).toBe("amber");
    expect(columnColor("Custom", 5)).toBe("violet");
  });

  it("falls back when a card color is not in the palette", () => {
    expect(effectiveColor("teal", "slate")).toBe("teal");
    expect(effectiveColor("not-a-color", "sky")).toBe("sky");
    expect(effectiveColor(null, "rose")).toBe("rose");
  });
});

describe("attachment helpers", () => {
  it("recognizes images and sanitizes file names", () => {
    expect(isImage("image/png")).toBe(true);
    expect(isImage("application/pdf")).toBe(false);
    expect(isImage(null)).toBe(false);
    expect(safeName("folder/a weird:file?.pdf")).toBe("folder_a_weird_file_.pdf");
    expect(safeName("")).toBe("file");
  });

  it("formats bytes, kilobytes, and megabytes", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1024)).toBe("1 KB");
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("relative activity time", () => {
  afterEach(() => vi.useRealTimers());

  it("handles missing activity and recent time boundaries", () => {
    expect(timeAgo(null)).toBe("No activity yet");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-01T12:00:00.000Z"));

    expect(timeAgo("2025-03-01T11:59:01.000Z")).toBe("just now");
    expect(timeAgo("2025-03-01T11:59:00.000Z")).toBe("1 min ago");
    expect(timeAgo("2025-03-01T11:58:00.000Z")).toBe("2 mins ago");
    expect(timeAgo("2025-03-01T11:00:00.000Z")).toBe("1 hr ago");
    expect(timeAgo("2025-02-28T12:00:00.000Z")).toBe("1 day ago");
  });
});