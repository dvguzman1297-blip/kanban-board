"use server";
import nodemailer from "nodemailer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/attachments";
import { resolveInviteNotifications } from "@/lib/notifications-server";

// Storage files are not removed by DB cascades, so delete them explicitly first.
async function removeFiles(supabase: Awaited<ReturnType<typeof createClient>>, column: "card_id" | "board_id", id: string) {
  const { data } = await supabase.from("attachments").select("path").eq(column, id);
  const paths = (data ?? []).map((a) => a.path as string);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

const DEFAULT_COLS = [
  { name: "Backlog", wip_limit: null }, { name: "Up Next", wip_limit: null },
  { name: "In Progress", wip_limit: 3 }, { name: "Blocked", wip_limit: null }, { name: "Done", wip_limit: null },
];

export async function createBoard(name: string): Promise<{ error: string } | void> {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) return { error: "Enter a board name." };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Your session expired. Sign in again before creating a board." };

  const boardId = crypto.randomUUID();
  const { error } = await supabase.from("boards").insert({ id: boardId, name: cleanName, user_id: user.id });
  if (error) {
    console.error("createBoard: board insert failed", error);
    return { error: `Could not create board: ${error.message}` };
  }
  const { error: columnsError } = await supabase.from("columns").insert(
    DEFAULT_COLS.map((c, i) => ({ ...c, board_id: boardId, order_index: (i + 1) * 1000 }))
  );
  if (columnsError) {
    console.error("createBoard: default columns insert failed", columnsError);
    const { error: cleanupError } = await supabase.from("boards").delete().eq("id", boardId);
    if (cleanupError) console.error("createBoard: failed to clean up incomplete board", cleanupError);
    return { error: `Could not create the board's default columns: ${columnsError.message}` };
  }
  revalidatePath("/", "layout");
  redirect(`/board/${boardId}`);
}

export async function renameBoard(id: string, name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("Name required");
  const supabase = await createClient();
  const { error } = await supabase.from("boards").update({ name: clean }).eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}
export async function togglePin(id: string, is_pinned: boolean) {
  const supabase = await createClient();
  await supabase.from("boards").update({ is_pinned }).eq("id", id);
  revalidatePath("/", "layout");
}
export async function archiveBoard(id: string, is_archived: boolean) {
  const supabase = await createClient();
  await supabase.from("boards").update({ is_archived }).eq("id", id);
  revalidatePath("/", "layout");
  if (is_archived) redirect("/");
}
export async function deleteBoard(id: string) {
  const supabase = await createClient();
  await removeFiles(supabase, "board_id", id);
  await supabase.from("boards").delete().eq("id", id); // cascades to columns + cards + attachment rows
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createCard(input: { column_id: string; board_id: string; title: string; order_index: number; due_date?: string | null; description?: string | null; subtasks?: { id: string; title: string; done: boolean }[] } & CardAttrs) {
  const supabase = await createClient();
  const { column_id, board_id, title, order_index } = input;
  const due_date = input.due_date && /^\d{4}-\d{2}-\d{2}$/.test(input.due_date) ? input.due_date : null;
  const { data, error } = await supabase.from("cards")
    .insert({ column_id, board_id, title, order_index, due_date, ...pickAttrs(input), ...pickContent(input) }).select().single();
  if (error) throw error;
  return data;
}
// Template content accepted at creation time (validated and size-capped).
function pickContent(x: { description?: string | null; subtasks?: { id: string; title: string; done: boolean }[] }) {
  const out: Record<string, unknown> = {};
  if (typeof x.description === "string") out.description = x.description.slice(0, 20000) || null;
  if (Array.isArray(x.subtasks)) {
    out.subtasks = x.subtasks.slice(0, 50).map((s) => ({ id: String(s.id).slice(0, 64), title: String(s.title).trim().slice(0, 200), done: !!s.done })).filter((s) => s.title);
  }
  return out;
}
type CardAttrs = { priority?: string; energy_level?: string; color?: string | null };

// Only these attributes may be changed through create/move (used by swimlane drops)
function pickAttrs(x: CardAttrs) {
  const out: Record<string, unknown> = {};
  if (x.priority && ["low", "medium", "high", "urgent"].includes(x.priority)) out.priority = x.priority;
  if (x.energy_level && ["low", "medium", "high"].includes(x.energy_level)) out.energy_level = x.energy_level;
  if (x.color !== undefined) out.color = x.color ? String(x.color).slice(0, 20) : null;
  return out;
}

export async function moveCard(id: string, column_id: string, order_index: number, extra: CardAttrs = {}) {
  const supabase = await createClient();
  const [{ data: col }, { data: cur }] = await Promise.all([
    supabase.from("columns").select("name").eq("id", column_id).single(),
    supabase.from("cards").select("completed_at").eq("id", id).single(),
  ]);
  const done = (col?.name ?? "").trim().toLowerCase() === "done";
  const patch: Record<string, unknown> = { column_id, order_index, ...pickAttrs(extra) };
  patch.completed_at = done ? (cur?.completed_at ?? new Date().toISOString()) : null;
  const { error } = await supabase.from("cards").update(patch).eq("id", id);
  if (error) throw error;
}
export async function updateCard(id: string, patch: Record<string, unknown>) {
  const supabase = await createClient();
  const allowed = new Set(["title", "description", "priority", "energy_level", "due_date", "start_date", "start_time", "due_time", "subtasks", "color", "assignee_id"]); // assignee membership is enforced by a DB trigger
  const safePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.has(key)));
  for (const key of ["due_date", "start_date"]) {
    const v = safePatch[key];
    if (v != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error("Invalid date.");
  }
  for (const key of ["start_time", "due_time"]) {
    const v = safePatch[key];
    if (v != null && !/^([01]\d|2[0-3]):[0-5]\d(:00)?$|^24:00(:00)?$/.test(String(v))) throw new Error("Invalid time.");
  }
  if (!Object.keys(safePatch).length) return;
  // Database rules (e.g. all subtasks done -> Done) may change more than we sent, so hand the row back.
  const { data, error } = await supabase.from("cards").update(safePatch).eq("id", id)
    .select("column_id, order_index, completed_at, subtasks").single();
  if (error) throw error;
  return data;
}
export async function deleteCard(id: string) {
  const supabase = await createClient();
  await removeFiles(supabase, "card_id", id);
  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) throw error;
}

// Global "Quick Task": validates the target column and appends the card at the bottom of it.
export async function quickCreateCard(input: {
  board_id: string; column_id: string; title: string; priority?: string; energy_level?: string; due_date?: string | null;
}) {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("A title is required.");
  const supabase = await createClient();

  const { data: col } = await supabase.from("columns").select("id").eq("id", input.column_id).eq("board_id", input.board_id).maybeSingle();
  if (!col) throw new Error("That column does not belong to the chosen board.");

  const { data: last } = await supabase.from("cards").select("order_index").eq("column_id", input.column_id)
    .order("order_index", { ascending: false }).limit(1);
  const order_index = (last?.[0]?.order_index ?? 0) + 1000;
  const due_date = input.due_date && /^\d{4}-\d{2}-\d{2}$/.test(input.due_date) ? input.due_date : null;

  const { data, error } = await supabase.from("cards")
    .insert({ board_id: input.board_id, column_id: input.column_id, title, order_index, due_date, ...pickAttrs(input) })
    .select("id").single();
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath(`/board/${input.board_id}`);
  return data;
}

export async function updateProfileName(fullName: string) {
  const clean = fullName.trim().slice(0, 80);
  if (!clean) throw new Error("A name is required.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  const firstName = clean.split(/\s+/)[0];
  const { error: authError } = await supabase.auth.updateUser({ data: { full_name: clean, first_name: firstName } });
  if (authError) throw authError;
  const { error } = await supabase.from("profiles").update({ full_name: clean, first_name: firstName }).eq("id", user.id);
  if (error) throw error;
  revalidatePath("/", "layout");
}

export async function sendBoardInvite(boardId: string, emailInput: string, roleInput: string) {
  const email = emailInput.trim().toLowerCase();
  const role = roleInput === "viewer" ? "viewer" : roleInput === "editor" ? "editor" : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!role) return { ok: false, error: "Choose Editor or Viewer access." };

  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_URL;
  if (!gmailUser || !gmailAppPassword || !appUrl) {
    return { ok: false, error: "Email is not configured. Set GMAIL_USER, GMAIL_APP_PASSWORD, and NEXT_PUBLIC_SITE_URL in Vercel, then redeploy." };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "You must be signed in." };
    const { data: board, error: boardError } = await supabase.from("boards")
      .select("id, name, user_id").eq("id", boardId).single();
    if (boardError) throw boardError;
    if (!board || board.user_id !== user.id) return { ok: false, error: "Only the board owner can invite members." };

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 864e5).toISOString();
    const { error: inviteError } = await supabase.from("board_invites")
      .insert({ board_id: boardId, email, role, token, expires_at: expiresAt });
    if (inviteError) throw inviteError;

    const inviteUrl = `${appUrl.replace(/\/$/, "")}/invite/accept?token=${encodeURIComponent(token)}`;
    const safeBoardName = board.name.replace(/[&<>"']/g, (character: string) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character] ?? character);
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailAppPassword },
    });
    try {
      await transporter.sendMail({
        from: `FlowDeck <${gmailUser}>`,
        to: email,
        subject: `You're invited to ${board.name} on FlowDeck`,
        html: `<div style="font-family:Arial,sans-serif;color:#18181b"><h1>FlowDeck</h1><p>You have been invited to join <strong>${safeBoardName}</strong> as ${role === "editor" ? "an editor" : "a viewer"}.</p><p><a href="${inviteUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Accept invitation</a></p><p>This invitation expires in 7 days.</p></div>`,
        text: `You have been invited to join ${board.name} on FlowDeck as ${role === "editor" ? "an editor" : "a viewer"}. Accept: ${inviteUrl}\nThis invitation expires in 7 days.`,
      });
    } catch (cause) {
      await supabase.from("board_invites").delete().eq("token", token);
      throw cause;
    }
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (cause) {
    console.error("Failed to send FlowDeck board invitation", cause);
    return { ok: false, error: "Could not send the invitation. Check the Vercel function logs for details." };
  }
}

export async function acceptBoardInvite(tokenInput: string) {
  const token = tokenInput.trim();
  if (!token || token.length > 100) throw new Error("This invitation link is invalid.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Sign in with the email address this invitation was sent to.");
  const { data: invite, error } = await supabase.from("board_invites")
    .select("id, board_id, email, role, expires_at").eq("token", token).maybeSingle();
  if (error || !invite || invite.email.toLowerCase() !== user.email.toLowerCase() || new Date(invite.expires_at) <= new Date()) {
    throw new Error("This invitation is invalid, expired, or belongs to another email address.");
  }
  const { data: board } = await supabase.from("boards").select("name").eq("id", invite.board_id).maybeSingle();
  const { error: memberError } = await supabase.from("board_members").insert({
    board_id: invite.board_id, user_id: user.id, role: invite.role, status: "accepted",
  });
  if (memberError) throw new Error(memberError.code === "23505" ? "You already belong to this board." : "Could not accept this invitation.");
  // Keep the in-app notification in step when the invite is accepted through the email link.
  await resolveInviteNotifications(supabase, user.id, "accepted", { inviteId: invite.id });
  await supabase.from("board_invites").delete().eq("id", invite.id);
  revalidatePath("/dashboard");
  revalidatePath(`/board/${invite.board_id}`);
  return { boardId: invite.board_id, boardName: board?.name ?? "your shared board" };
}

export async function createCardComment(cardId: string, contentInput: string) {
  const content = contentInput.trim();
  if (!content || content.length > 5000) throw new Error("Comments must be between 1 and 5,000 characters.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  const { data, error } = await supabase.from("card_comments")
    .insert({ card_id: cardId, user_id: user.id, content }).select().single();
  if (error) throw error;
  return { ...data, author: { id: user.id, first_name: user.user_metadata?.first_name ?? null, full_name: user.user_metadata?.full_name ?? null } };
}

export async function updateCardComment(commentId: string, contentInput: string) {
  const content = contentInput.trim();
  if (!content || content.length > 5000) throw new Error("Comments must be between 1 and 5,000 characters.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  const { data, error } = await supabase.from("card_comments").update({ content, updated_at: new Date().toISOString() })
    .eq("id", commentId).eq("user_id", user.id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCardComment(commentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  const { error } = await supabase.from("card_comments").delete().eq("id", commentId).eq("user_id", user.id);
  if (error) throw error;
}
