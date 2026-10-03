// Server-only: RESEND_API_KEY has no NEXT_PUBLIC_ prefix, so it is never bundled for the browser.
// Only import this file from server actions, route handlers, or other server code.
import { Resend } from "resend";

export const SENDERS = {
  notifications: "Deckspace <notifications@deckspace.site>",
  invites: "Deckspace <invites@deckspace.site>",
} as const;

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string };

let client: Resend | null = null;
function getClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return (client ??= new Resend(key));
}

export async function sendEmail(input: {
  from?: string; to: string | string[]; subject: string; html: string; text: string; replyTo?: string;
}): Promise<SendEmailResult> {
  const resend = getClient();
  if (!resend) return { ok: false, error: "Email is not configured. Set RESEND_API_KEY and redeploy." };
  try {
    const { data, error } = await resend.emails.send({
      from: input.from ?? SENDERS.notifications,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    if (error || !data) {
      console.error("Resend rejected email", error);
      return { ok: false, error: error?.message ?? "Resend returned no response." };
    }
    return { ok: true, id: data.id };
  } catch (cause) {
    console.error("Resend request failed", cause);
    return { ok: false, error: cause instanceof Error ? cause.message : "Could not reach Resend." };
  }
}
