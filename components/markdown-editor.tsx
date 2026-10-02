"use client";
import { useRef, useState } from "react";
import { Bold, Code, Heading2, Italic, List, ListChecks, SquareCode } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { toggleCheckbox } from "@/lib/markdown";

const field = "w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500";

type Action = { label: string; icon: React.ReactNode; apply: (sel: string) => { text: string; select?: [number, number] } };

// Wraps the selection (or inserts a placeholder); `select` is the range to re-select inside the new text.
const wrap = (before: string, after: string, placeholder: string): Action["apply"] => (sel) => {
  const body = sel || placeholder;
  return { text: `${before}${body}${after}`, select: [before.length, before.length + body.length] };
};
const prefixLines = (prefix: string, placeholder: string): Action["apply"] => (sel) => {
  const body = sel || placeholder;
  const text = body.split("\n").map((l) => `${prefix}${l}`).join("\n");
  return { text, select: [prefix.length, text.length] };
};

const ACTIONS: Action[] = [
  { label: "Heading", icon: <Heading2 className="h-4 w-4" />, apply: prefixLines("## ", "Heading") },
  { label: "Bold", icon: <Bold className="h-4 w-4" />, apply: wrap("**", "**", "bold text") },
  { label: "Italic", icon: <Italic className="h-4 w-4" />, apply: wrap("*", "*", "italic text") },
  { label: "Bullet list", icon: <List className="h-4 w-4" />, apply: prefixLines("- ", "item") },
  { label: "Checklist", icon: <ListChecks className="h-4 w-4" />, apply: prefixLines("- [ ] ", "task") },
  { label: "Inline code", icon: <Code className="h-4 w-4" />, apply: wrap("`", "`", "code") },
  { label: "Code block", icon: <SquareCode className="h-4 w-4" />, apply: wrap("```ts\n", "\n```", "const x = 1;") },
];

export function MarkdownEditor({ value, onChange, readOnly = false }: { value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  const [mode, setMode] = useState<"write" | "preview">(readOnly ? "preview" : "write");
  const ref = useRef<HTMLTextAreaElement>(null);

  const run = (a: Action) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const { text, select } = a.apply(value.slice(s, e));
    onChange(value.slice(0, s) + text + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      if (select) el.setSelectionRange(s + select[0], s + select[1]);
    });
  };

  const tab = (m: "write" | "preview", label: string) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
      className={`rounded-md px-2.5 py-1 text-xs ${mode === m ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>{label}</button>
  );

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Description mode" className="flex gap-1">{!readOnly && tab("write", "Write")}{tab("preview", "Preview")}</div>
        {mode === "write" && !readOnly && (
          <div className="flex items-center gap-0.5" role="toolbar" aria-label="Formatting">
            {ACTIONS.map((a) => (
              <button key={a.label} type="button" title={a.label} aria-label={a.label} onClick={() => run(a)}
                className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">{a.icon}</button>
            ))}
          </div>
        )}
      </div>
      {mode === "write" && !readOnly ? (
        <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={6} maxLength={20000}
          placeholder="Describe the task… Markdown is supported." className={`${field} font-mono`} />
      ) : (
        <div className={`${field} min-h-[4.5rem]`}>
          {value.trim()
            ? <Markdown source={value} onToggle={readOnly ? undefined : (i) => onChange(toggleCheckbox(value, i))} />
            : <p className="text-zinc-600">Nothing to preview.</p>}
        </div>
      )}
    </div>
  );
}
