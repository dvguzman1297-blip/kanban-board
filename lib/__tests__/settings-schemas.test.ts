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
