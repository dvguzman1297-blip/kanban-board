import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

export function AuthCard({ title, subtitle, children, footer }:
  { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 shadow-2xl">
      <Link href="/" className="mb-6 flex items-center gap-2 text-sm font-semibold text-indigo-300">
        <LayoutDashboard className="h-5 w-5" /> Kanban Workspace
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-zinc-500">{footer}</div>}
    </div>
  );
}

export const inputCls =
  "h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm outline-none focus:border-indigo-500";
export const btnCls =
  "h-10 w-full rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60";
