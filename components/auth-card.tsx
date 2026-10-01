import Link from "next/link";
import { AppLogo } from "@/components/app-logo";

export function AuthCard({ title, subtitle, children, footer }:
  { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 shadow-2xl">
      <Link href="/" className="mb-6 flex items-center gap-3 text-sm font-semibold text-zinc-100">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 p-1">
          <AppLogo className="h-8 w-8" />
        </span>
        <span>FlowDeck</span>
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-[#9CA3AF]">{subtitle}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-8 text-center text-sm text-[#9CA3AF]">{footer}</div>}
    </div>
  );
}

export const inputCls =
  "h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-400 outline-none transition-colors focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-400/40";
export const btnCls =
  "h-10 w-full rounded-lg bg-indigo-600 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:opacity-60";
