"use client";
import { ListRowsSkeleton } from "@/components/skeletons";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import {
  cancelBoardInvite, listBoardMembers, removeBoardMember, updateMemberRole, type InviteRow, type MemberRow, type MembersResult,
} from "@/app/members-actions";

const select = "h-8 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-indigo-500";

export function BoardMembersPanel({ boardId, refreshKey }: { boardId: string; refreshKey: number }) {
  const router = useRouter();
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const apply = (res: MembersResult) => {
    if (!res.ok) return setError(res.error);
    setMembers(res.members);
    setInvites(res.invites);
  };
  // Load when the dialog opens and again after a new invite is sent.
  useEffect(() => {
    let live = true;
    listBoardMembers(boardId).then((res) => { if (live) apply(res); });
    return () => { live = false; };
  }, [boardId, refreshKey]);

  const run = (task: () => Promise<{ ok: boolean; error?: string; unassigned?: number }>) => start(async () => {
    setError(null);
    const res = await task();
    if (!res.ok) return setError(res.error ?? "Something went wrong.");
    setConfirming(null);
    apply(await listBoardMembers(boardId));
    // Removed members' cards live in client state, so reload if any were unassigned.
    if (res.unassigned) location.reload(); else router.refresh();
  });

  return (
    <div className="mt-5 border-t border-zinc-800 pt-4">
      <h3 className="mb-2 text-sm font-semibold">Members</h3>
      {error && <p role="alert" className="mb-2 text-sm text-rose-400">{error}</p>}
      {members === null ? (
        <ListRowsSkeleton rows={2} />
      ) : members.length === 0 ? (
        <p className="text-sm text-zinc-500">No one has joined this board yet.</p>
      ) : (
        <ul className="fd-fade-in divide-y divide-zinc-800">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 py-2">
              {m.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                : <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{m.name[0]?.toUpperCase()}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{m.name}</p>
                {m.email && <p className="truncate text-xs text-zinc-500">{m.email}</p>}
              </div>
              {confirming === m.userId ? (
                <div className="flex items-center gap-1.5">
                  <button disabled={pending} onClick={() => run(() => removeBoardMember(boardId, m.userId))}
                    className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-60">Remove</button>
                  <button onClick={() => setConfirming(null)} className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800">Cancel</button>
                </div>
              ) : (
                <>
                  <select aria-label={`Role for ${m.name}`} disabled={pending} value={m.role === "admin" ? "editor" : m.role} className={select}
                    onChange={(e) => run(() => updateMemberRole(boardId, m.userId, e.target.value))}>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button onClick={() => setConfirming(m.userId)} aria-label={`Remove ${m.name}`} title="Remove from board"
                    className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirming && <p className="mt-1 text-xs text-zinc-500">They lose access immediately and their assigned cards become unassigned.</p>}

      {invites.length > 0 && (
        <>
          <h3 className="mb-2 mt-4 text-sm font-semibold">Pending invitations</h3>
          <ul className="divide-y divide-zinc-800">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{i.email}</p>
                  <p className="text-xs capitalize text-zinc-500">{i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}</p>
                </div>
                <button disabled={pending} onClick={() => run(() => cancelBoardInvite(boardId, i.id))} aria-label={`Cancel invitation for ${i.email}`}
                  title="Cancel invitation" className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
