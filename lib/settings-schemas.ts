import { z } from "zod";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // keep in sync with the bucket limit in SQL
export const AVATAR_TYPES: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};

const optional = (max: number) =>
  z.string().trim().max(max, `Must be ${max} characters or fewer.`).transform((v) => v || null);

export const profileSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required.").max(40, "Must be 40 characters or fewer."),
  last_name: optional(40),
  display_name: optional(40),
  job_title: optional(80),
  bio: optional(500),
});

export const passwordSchema = z.object({
  current: z.string().min(1, "Enter your current password."),
  next: z.string()
    .min(8, "Use at least 8 characters.")
    .max(72, "Use 72 characters or fewer.")
    .regex(/[a-z]/, "Include a lowercase letter.")
    .regex(/[A-Z]/, "Include an uppercase letter.")
    .regex(/[0-9]/, "Include a number."),
  confirm: z.string(),
}).refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Passwords do not match." })
  .refine((v) => v.next !== v.current, { path: ["next"], message: "New password must differ from the current one." });

export const emailSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")) });

export const preferencesSchema = z.object({
  default_board_id: z.uuid().nullable(),
  theme: z.enum(["system", "dark", "light"]),
  notify_invites: z.boolean(),
  notify_mentions: z.boolean(),
  notify_assignments: z.boolean(),
});

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
