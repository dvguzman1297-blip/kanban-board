"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { UserPlus, X } from "lucide-react";
import { sendBoardInvite } from "@/app/actions";
import { BoardMembersPanel } from "@/components/board-members-panel";

export function InviteMembersButton({ boardId, boardName, compact = false }: {
  boardId: string; boardName: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [invitesSent, setInvitesSent] = useState(0); // bumps to refresh the member list

  const close = () => { setOpen(false); setError(""); setSent(false); setEmail(""); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true); setError("");
    try {
      const result = await sendBoardInvite(boardId, email, role);
      if ("error" in result) { setError(result.error ?? "Could not send invitation."); return; }
      setSent(true);
      setInvitesSent((n) => n + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send invitation.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} title="Invite members" aria-label="Invite members"
        className={`relative z-20 flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-300 hover:border-zinc-600 hover:text-white ${compact ? "text-xs" : ""}`}>
        <UserPlus className="h-4 w-4" />{compact ? "Invite" : "Invite Members"}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <section role="dialog" aria-modal="true" aria-labelledby="invite-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="invite-title" className="min-w-0 truncate text-base font-semibold">Members of {boardName}</h2>
              <button onClick={close} aria-label="Close invitation dialog" className="rounded p-1 text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            {sent ? (
              <div className="space-y-4">
                <p className="text-sm text-emerald-300">Invitation sent to {email}.</p>
                <button onClick={close} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Done</button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <label className="block text-xs font-medium text-zinc-400">
                  Email address
                  <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com"
                    className="mt-1.5 h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-indigo-500" />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Permission
                  <select value={role} onChange={(event) => setRole(event.target.value as "editor" | "viewer")}
                    className="mt-1.5 h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-indigo-500">
                    <option value="editor">Editor · can update cards and columns</option>
                    <option value="viewer">Viewer · can read and comment</option>
                  </select>
                </label>
                {error && <p role="alert" className="break-words text-sm text-rose-400">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>
                  <button disabled={pending} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
                    <UserPlus className="h-4 w-4" />{pending ? "Sending…" : "Send invitation"}
                  </button>
                </div>
              </form>
            )}
            <BoardMembersPanel boardId={boardId} refreshKey={invitesSent} />
          </section>
        </div>
      , document.body)}
    </>
  );
}