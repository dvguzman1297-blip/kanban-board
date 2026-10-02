import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema, preferencesSchema, profileSchema } from "../settings-schemas";

describe("passwordSchema", () => {
  const ok = { current: "OldPass1", next: "NewPass123", confirm: "NewPass123" };

  it("accepts a strong matching password", () => expect(passwordSchema.safeParse(ok).success).toBe(true));
  it("rejects short, weak, mismatched or unchanged passwords", () => {
    expect(passwordSchema.safeParse({ ...ok, next: "Ab1", confirm: "Ab1" }).success).toBe(false);
    expect(passwordSchema.safeParse({ ...ok, next: "alllowercase1", confirm: "alllowercase1" }).success).toBe(false);
    expect(passwordSchema.safeParse({ ...ok, confirm: "Different123" }).success).toBe(false);
    expect(passwordSchema.safeParse({ ...ok, next: "OldPass1", confirm: "OldPass1" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("requires a first name and turns blank optionals into null", () => {
    expect(profileSchema.safeParse({ first_name: " ", last_name: "", display_name: "", job_title: "", bio: "" }).success).toBe(false);
    const r = profileSchema.parse({ first_name: " Ada ", last_name: "", display_name: " ", job_title: "Dev", bio: "" });
    expect(r).toEqual({ first_name: "Ada", last_name: null, display_name: null, job_title: "Dev", bio: null });
  });
  it("caps bio length", () => {
    expect(profileSchema.safeParse({ first_name: "A", last_name: "", display_name: "", job_title: "", bio: "x".repeat(501) }).success).toBe(false);
  });
});

describe("emailSchema / preferencesSchema", () => {
  it("normalises and validates email", () => {
    expect(emailSchema.parse({ email: " A@B.com " }).email).toBe("a@b.com");
    expect(emailSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
  it("validates theme and board id", () => {
    const base = { default_board_id: null, theme: "system", notify_invites: true, notify_mentions: false, notify_assignments: true };
    expect(preferencesSchema.safeParse(base).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...base, theme: "neon" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...base, default_board_id: "not-a-uuid" }).success).toBe(false);
  });
});

import { addWorkingDays } from "../board-utils";

describe("addWorkingDays", () => {
  it("skips weekends", () => {
    expect(addWorkingDays(new Date(2026, 9, 5), 3)).toBe("2026-10-08"); // Mon -> Thu
    expect(addWorkingDays(new Date(2026, 9, 7), 3)).toBe("2026-10-12"); // Wed -> Mon
    expect(addWorkingDays(new Date(2026, 9, 9), 3)).toBe("2026-10-14"); // Fri -> Wed
    expect(addWorkingDays(new Date(2026, 9, 10), 3)).toBe("2026-10-14"); // Sat -> Wed
    expect(addWorkingDays(new Date(2026, 9, 11), 3)).toBe("2026-10-14"); // Sun -> Wed
  });
});

import { computeBoardStats } from "../board-stats";

describe("computeBoardStats", () => {
  const columns = [
    { id: "c1", board_id: "b", name: "Backlog", order_index: 1, wip_limit: null },
    { id: "c2", board_id: "b", name: "Done", order_index: 2, wip_limit: null },
  ];
  const base = { board_id: "b", title: "t", description: null, priority: "medium" as const, energy_level: "medium" as const, subtasks: [], order_index: 1 };
  const cards = [
    { ...base, id: "1", column_id: "c1", due_date: "2026-10-01", user_id: "u1", assignee_id: "u1" },
    { ...base, id: "2", column_id: "c2", due_date: "2026-10-01", user_id: "u1", assignee_id: "u2" },
    { ...base, id: "3", column_id: "c1", due_date: null, user_id: "u2", assignee_id: null },
  ];
  const members = [
    { id: "u1", first_name: "Ann", full_name: null, display_name: null, avatar_url: null },
    { id: "u2", first_name: "Bo", full_name: null, display_name: "Bobby", avatar_url: null },
  ];
  const s = computeBoardStats(cards, columns, members, ["u2", "u2", "u1"], "2026-10-02");

  it("counts lists, due buckets and headline numbers", () => {
    expect(s.perList.map((x) => x.count)).toEqual([2, 1]);
    expect(Object.fromEntries(s.perDue.map((x) => [x.key, x.count]))).toMatchObject({ overdue: 1, none: 1, done: 1 });
    expect(s).toMatchObject({ total: 3, completed: 1, overdue: 1, unassigned: 1 });
  });
  it("breaks contribution down per member", () => {
    const ann = s.perMember.find((m) => m.id === "u1")!;
    const bo = s.perMember.find((m) => m.id === "u2")!;
    expect(ann).toMatchObject({ assigned: 1, open: 1, overdue: 1, created: 2, comments: 1 });
    expect(bo).toMatchObject({ name: "Bobby", assigned: 1, completed: 1, created: 1, comments: 2 });
    expect(s.perMember.at(-1)!.name).toBe("Unassigned");
  });
});
