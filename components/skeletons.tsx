// Loading placeholders. No "use client": these render on the server for loading.tsx.
// Colours come from the zinc scale, which theme.css inverts in light mode, so one set of classes covers both themes.

/** A single pulsing block; size and shape come from the className. */
export function Bone({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-zinc-800/80 ${className}`} />;
}

/** Wrap a skeleton so screen readers hear "Loading" once instead of nothing. */
function Region({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div role="status" aria-busy="true" aria-label={label} className={className}>{children}</div>;
}

export function KanbanCardSkeleton({ cover = false }: { cover?: boolean }) {
  return (
    <div aria-hidden className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      {cover && <Bone className="mb-3 h-24 w-full rounded-md" />}
      <Bone className="h-4 w-4/5" />
      <div className="mt-3 flex gap-1.5">
        <Bone className="h-4 w-12 rounded-full" />
        <Bone className="h-4 w-16 rounded-full" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Bone className="h-3 w-20" />
        <Bone className="h-5 w-5 rounded-full" />
      </div>
    </div>
  );
}

export function KanbanColumnSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <section aria-hidden className="flex w-[82vw] max-w-xs shrink-0 flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 md:w-auto md:max-w-none md:min-w-[11rem] md:flex-1">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="flex items-center gap-2">
          <Bone className="h-2.5 w-2.5 rounded-full" />
          <Bone className="h-4 w-24" />
        </div>
        <Bone className="h-5 w-8 rounded-full" />
      </div>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {Array.from({ length: cards }, (_, i) => <KanbanCardSkeleton key={i} cover={i === 0} />)}
      </div>
    </section>
  );
}

export function BoardViewSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <Region label="Loading board" className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-4 py-3 md:px-6 md:py-4">
        <div className="flex flex-wrap items-center gap-4">
          <Bone className="h-6 w-48" />
          <Bone className="hidden h-6 w-28 rounded-full sm:block" />
          <div className="ml-auto flex gap-2"><Bone className="h-9 w-24" /><Bone className="h-9 w-32" /></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Bone className="h-9 w-full sm:w-56" /><Bone className="h-9 w-28" /><Bone className="h-9 w-28" />
        </div>
      </div>
      <div className="flex flex-1 gap-3 overflow-hidden p-4 md:gap-4 md:p-6">
        {Array.from({ length: columns }, (_, i) => <KanbanColumnSkeleton key={i} cards={i % 3 === 1 ? 2 : 3} />)}
      </div>
    </Region>
  );
}

export function DashboardSkeleton() {
  return (
    <Region label="Loading dashboard" className="h-full overflow-hidden p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section>
          <Bone className="mb-4 h-8 w-64" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} aria-hidden className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="mb-3 flex items-center justify-between"><Bone className="h-3 w-24" /><Bone className="h-7 w-7 rounded-lg" /></div>
                <Bone className="h-7 w-16" /><Bone className="mt-2 h-3 w-32" />
              </div>
            ))}
          </div>
        </section>
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between"><Bone className="h-4 w-28" /><Bone className="h-8 w-28" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} aria-hidden className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <Bone className="mb-3 h-5 w-40" />
                  <Bone className="mb-2 h-2 w-full rounded-full" />
                  <div className="mb-3 flex gap-3"><Bone className="h-3 w-14" /><Bone className="h-3 w-14" /><Bone className="h-3 w-14" /></div>
                  <div className="flex justify-between"><Bone className="h-3 w-16" /><Bone className="h-5 w-20 rounded-full" /><Bone className="h-3 w-24" /></div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <Bone className="mb-3 h-4 w-40" />
            <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <KanbanCardSkeleton key={i} />)}</div>
          </section>
        </div>
      </div>
    </Region>
  );
}

/** Generic page body: a heading and a few stacked cards (settings, notifications). */
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Region label={label} className="h-full overflow-hidden p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Bone className="h-7 w-48" />
        <Bone className="h-4 w-72" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} aria-hidden className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <Bone className="h-4 w-40" /><Bone className="h-9 w-full" /><Bone className="h-9 w-2/3" />
          </div>
        ))}
      </div>
    </Region>
  );
}

/** Rows for lists that load after a modal opens (activity feed, members). */
export function ListRowsSkeleton({ rows = 3, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center gap-2.5">
          {avatar && <Bone className="h-6 w-6 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-1.5"><Bone className="h-3 w-3/4" /><Bone className="h-2.5 w-1/3" /></div>
        </div>
      ))}
    </div>
  );
}
