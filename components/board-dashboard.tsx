"use client";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ListTodo, UserX } from "lucide-react";
import { computeBoardStats, type Slice } from "@/lib/board-stats";
import { PALETTE, columnColor } from "@/lib/colors";
import type { Card, Column, Member } from "@/lib/types";

const BAR = {
  default: "bg-indigo-500", overdue: "bg-rose-500", today: "bg-amber-500", week: "bg-sky-500", later: "bg-indigo-500", none: "bg-zinc-600", done: "bg-emerald-500",
  urgent: "bg-rose-500", high: "bg-orange-500", medium: "bg-indigo-500", low: "bg-slate-500",
} as Record<string, string>;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Bars({ data, empty, tone }: { data: Slice[]; empty: string; tone?: (s: Slice) => string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  if (!data.some((d) => d.count > 0)) return <p className="py-6 text-center text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.key} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-xs sm:grid-cols-[9rem_1fr_2rem]">
          <span className="truncate text-zinc-400" title={d.label}>{d.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
            <span className={`block h-full rounded-full ${tone?.(d) ?? BAR[d.key] ?? BAR.default}`} style={{ width: `${(d.count / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-zinc-300">{d.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Tile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500">
        {label}<span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
    : <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">{(name[0] ?? "?").toUpperCase()}</span>;
}

export function BoardDashboard({ cards, columns, members, commentAuthors, today }: {
  cards: Card[]; columns: Column[]; members: Member[]; commentAuthors: string[]; today: string;
}) {
  const s = useMemo(() => computeBoardStats(cards, columns, members, commentAuthors, today), [cards, columns, members, commentAuthors, today]);
  const memberBars: Slice[] = s.perMember.map((m) => ({ key: m.id ?? "none", label: m.name, count: m.assigned }));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile icon={<ListTodo className="h-4 w-4" />} label="Total cards" value={s.total} tone="bg-indigo-500/15 text-indigo-300" />
          <Tile icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={s.completed} tone="bg-emerald-500/15 text-emerald-300" />
          <Tile icon={<AlertTriangle className="h-4 w-4" />} label="Overdue" value={s.overdue} tone="bg-rose-500/15 text-rose-300" />
          <Tile icon={<UserX className="h-4 w-4" />} label="Unassigned open" value={s.unassigned} tone="bg-amber-500/15 text-amber-300" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Cards per list">
            <Bars data={s.perList} empty="No cards on this board yet." tone={(d) => { const i = columns.findIndex((c) => c.id === d.key); return PALETTE[columnColor(columns[i]?.name ?? "", i)].dot; }} />
          </Panel>
          <Panel title="Cards per due date"><Bars data={s.perDue} empty="No cards with due dates yet." /></Panel>
          <Panel title="Cards per member"><Bars data={memberBars} empty="No cards are assigned yet — assign a card from its edit dialog." tone={(d) => (d.key === "none" ? "bg-zinc-600" : "bg-indigo-500")} /></Panel>
          <Panel title="Cards per priority"><Bars data={s.perPriority} empty="No cards on this board yet." /></Panel>
        </div>

        <Panel title="Contribution per collaborator">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="pb-2 pr-3 font-medium">Member</th>
                  {["Assigned", "Open", "Completed", "Overdue", "Created", "Comments"].map((h) => <th key={h} scope="col" className="pb-2 px-2 text-right font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {s.perMember.map((m) => (
                  <tr key={m.id ?? "none"}>
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <span className="flex items-center gap-2"><Avatar name={m.name} url={m.avatar_url} /><span className="truncate">{m.name}</span></span>
                    </th>
                    <td className="px-2 text-right tabular-nums">{m.assigned}</td>
                    <td className="px-2 text-right tabular-nums">{m.open}</td>
                    <td className="px-2 text-right tabular-nums text-emerald-300">{m.completed}</td>
                    <td className={`px-2 text-right tabular-nums ${m.overdue ? "text-rose-300" : ""}`}>{m.overdue}</td>
                    <td className="px-2 text-right tabular-nums">{m.id ? m.created : "–"}</td>
                    <td className="px-2 text-right tabular-nums">{m.id ? m.comments : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500">Created = cards a member added. Completed counts cards currently in Done, credited to the assignee, whoever moved it. New cards default to their creator.</p>
        </Panel>
      </div>
    </div>
  );
}
