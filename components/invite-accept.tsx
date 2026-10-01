"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";
import { acceptBoardInvite } from "@/app/actions";

export function InviteAccept({ token, email }: { token: string; email: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const next = `/invite/accept?token=${encodeURIComponent(token)}`;
  const loginHref = `/auth/login?next=${encodeURIComponent(next)}`;
  const registerHref = `/auth/register?next=${encodeURIComponent(next)}`;

  const accept = async () => {
    setPending(true); setError("");
    try {
      const result = await acceptBoardInvite(token);
      router.replace(`/board/${result.boardId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not accept this invitation.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 p-4 text-zinc-100">
      <section className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-300">FlowDeck invitation</p>
        <h1 className="text-xl font-semibold">Join a shared board</h1>
        {email ? (
          <>
            <p className="mt-2 break-words text-sm text-zinc-400">Signed in as {email}. Accept the invitation to open the board.</p>
            {error && <p role="alert" className="mt-3 break-words text-sm text-rose-400">{error}</p>}
            <button onClick={accept} disabled={pending} className="mt-5 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
              {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {pending ? "Accepting…" : "Accept invitation"}
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-zinc-400">Sign in or create an account with the email address that received this invitation.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={loginHref} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Sign in</Link>
              <Link href={registerHref} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Create account</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}