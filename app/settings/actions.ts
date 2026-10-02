"use server";
import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  AVATAR_BUCKET, AVATAR_MAX_BYTES, AVATAR_TYPES, emailSchema, fieldErrors, passwordSchema, preferencesSchema, profileSchema,
  type ActionResult,
} from "@/lib/settings-schemas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

const SESSION_EXPIRED: ActionResult = { ok: false, error: "Your session expired. Sign in again." };

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const { supabase, user } = await currentUser();
  if (!user) return SESSION_EXPIRED;

  const p = parsed.data;
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const { error } = await supabase.from("profiles").update({ ...p, full_name: fullName }).eq("id", user.id);
  if (error) return { ok: false, error: `Could not save profile: ${error.message}` };

  // The dashboard greeting reads auth metadata first, so keep it in sync.
  await supabase.auth.updateUser({ data: { first_name: p.first_name, last_name: p.last_name ?? "", full_name: fullName } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}

export async function uploadAvatar(formData: FormData): Promise<ActionResult & { url?: string }> {
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image to upload." };
  const ext = AVATAR_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a PNG, JPG, WebP or GIF image." };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: "Image must be 2 MB or smaller." };

  const { supabase, user } = await currentUser();
  if (!user) return SESSION_EXPIRED;

  // A fresh filename per upload sidesteps CDN/browser caching of the old image.
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) return { ok: false, error: `Upload failed: ${uploadError.message}` };

  const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const { error } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
  if (error) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    return { ok: false, error: `Could not save avatar: ${error.message}` };
  }
  await purgeOldAvatars(supabase, user.id, path);
  revalidatePath("/", "layout");
  return { ok: true, message: "Avatar updated.", url: publicUrl };
}

export async function removeAvatar(): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!user) return SESSION_EXPIRED;
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) return { ok: false, error: `Could not remove avatar: ${error.message}` };
  await purgeOldAvatars(supabase, user.id, null);
  revalidatePath("/", "layout");
  return { ok: true, message: "Avatar removed." };
}

async function purgeOldAvatars(supabase: Supabase, userId: string, keep: string | null) {
  const { data } = await supabase.storage.from(AVATAR_BUCKET).list(userId);
  const stale = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (stale.length) await supabase.storage.from(AVATAR_BUCKET).remove(stale);
}

export async function updatePreferences(input: unknown): Promise<ActionResult> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid preferences.", fieldErrors: fieldErrors(parsed.error) };
  const { supabase, user } = await currentUser();
  if (!user) return SESSION_EXPIRED;

  const prefs = parsed.data;
  if (prefs.default_board_id) {
    // RLS limits this to boards the user can actually see.
    const { data: board } = await supabase.from("boards").select("id").eq("id", prefs.default_board_id).eq("is_archived", false).maybeSingle();
    if (!board) return { ok: false, error: "That board is not available.", fieldErrors: { default_board_id: "Choose a board you have access to." } };
  }
  const { error } = await supabase.from("profiles").update(prefs).eq("id", user.id);
  if (error) return { ok: false, error: `Could not save preferences: ${error.message}` };
  revalidatePath("/", "layout");
  return { ok: true, message: "Preferences saved." };
}

export async function changePassword(input: unknown): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const { supabase, user } = await currentUser();
  if (!user?.email) return SESSION_EXPIRED;

  // Verify the current password with a throwaway client so the live session cookies are untouched.
  const verifier = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({ email: user.email, password: parsed.data.current });
  if (verifyError) return { ok: false, error: "Current password is incorrect.", fieldErrors: { current: "Current password is incorrect." } };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
  if (error) return { ok: false, error: error.message, fieldErrors: { next: error.message } };
  return { ok: true, message: "Password updated." };
}

export async function requestEmailChange(input: unknown): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address.", fieldErrors: fieldErrors(parsed.error) };
  const { supabase, user } = await currentUser();
  if (!user) return SESSION_EXPIRED;
  if (parsed.data.email === user.email?.toLowerCase()) return { ok: false, error: "That is already your email.", fieldErrors: { email: "That is already your email." } };

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_URL;
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    site ? { emailRedirectTo: `${site.replace(/\/$/, "")}/auth/callback?next=/settings` } : undefined,
  );
  if (error) return { ok: false, error: error.message, fieldErrors: { email: error.message } };
  return { ok: true, message: `Confirmation sent to ${parsed.data.email}. Your email changes once you confirm it.` };
}

/** scope "global" revokes every refresh token for the user, signing out all devices. */
export async function signOutEverywhere(): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!user) return SESSION_EXPIRED;
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
