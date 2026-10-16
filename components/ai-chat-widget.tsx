"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Copy, Download, FileSpreadsheet, FileText, Maximize2, MessageCircle, Minimize2, Printer, Send, Sparkles, Trash2, X } from "lucide-react";
import { askAi } from "@/app/ai-actions";
import { ALL_SUGGESTIONS, BOARD_SUGGESTIONS, MAX_MESSAGE_CHARS, type ChatMessage } from "@/lib/ai";
import { toISO } from "@/lib/board-utils";
import { exportReply, type ExportFormat } from "@/lib/ai-export";
import { Markdown } from "@/components/markdown";

/** Floating chat. On /board/<id> it talks about that board; anywhere else, about all of the user's boards. */
export function AiChatWidget({ boards }: { boards: { id: string; name: string }[] }) {
  const pathname = usePathname();
  const routeId = pathname.match(/^\/board\/([^/?#]+)/)?.[1] ?? null;
  const board = boards.find((b) => b.id === routeId) ?? null;
  const boardId = board?.id ?? null;
  const key = boardId ?? "all";
  const suggestions = boardId ? BOARD_SUGGESTIONS : ALL_SUGGESTIONS;

  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({}); // one conversation per scope
  const [input, setInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null); // reply whose export options are showing
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [busyExport, setBusyExport] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const messages = chats[key] ?? [];
  const pending = pendingKey === key;
  const error = errors[key] ?? "";
  const setError = (message: string, scope = key) => setErrors((e) => ({ ...e, [scope]: message }));

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, pending, error, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Collapse when clicking anywhere outside the chat (its button included, since that one toggles).
    const onPointerDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointerDown); };
  }, [open]);

  if (!boards.length) return null;

  const copyReply = async (i: number, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1500); } catch {}
  };
  const exportAs = async (i: number, format: ExportFormat) => {
    const el = document.getElementById(`ai-reply-${i}`);
    if (!el || busyExport) return;
    setBusyExport(true);
    try {
      await exportReply(format, el, `${board ? board.name : "FlowDeck"} – AI report`);
      setMenuFor(null);
    } catch {
      setError("Could not export this reply.", key);
    } finally {
      setBusyExport(false);
    }
  };

  const send = async (content: string) => {
    const text = content.trim();
    if (!text || pendingKey) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setChats((c) => ({ ...c, [key]: next })); setInput(""); setError(""); setPendingKey(key);
    try {
      const result = await askAi({ boardId }, next, toISO(new Date()));
      if ("error" in result) setError(result.error, key);
      else setChats((c) => ({ ...c, [key]: [...next, { role: "assistant", content: result.text }] }));
    } catch {
      setError("Could not reach the AI service.", key);
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div ref={rootRef} className="pointer-events-none fixed bottom-4 right-8 z-[80] flex flex-col items-end gap-3 print:hidden">
      {open && (
        <section role="dialog" aria-label="AI assistant"
          className={`pointer-events-auto flex max-h-[calc(100dvh-6.5rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl transition-[width,height] ${expanded ? "h-[calc(100dvh-6.5rem)] w-[56rem]" : "h-[34rem] w-[24rem]"}`}>
          <div className="flex items-center justify-between gap-3 bg-indigo-600 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">FlowDeck AI</p>
                <p className="truncate text-[11px] leading-tight text-indigo-100">{board ? board.name : "All your boards"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={() => { setChats((c) => ({ ...c, [key]: [] })); setError(""); }} disabled={!!pendingKey} title="Clear conversation" aria-label="Clear conversation"
                  className="rounded p-1.5 text-indigo-100 hover:bg-white/15 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
              )}
              <button onClick={() => setExpanded((e) => !e)} title={expanded ? "Restore size" : "Enlarge"} aria-label={expanded ? "Restore chat size" : "Enlarge chat"}
                className="rounded p-1.5 text-indigo-100 hover:bg-white/15">{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
              <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded p-1.5 text-indigo-100 hover:bg-white/15"><X className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
                  Hi! Ask me anything about {board ? "this board" : "your boards"}.
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button key={s.label} onClick={() => send(s.prompt)}
                      className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500">{s.label}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => m.role === "user" ? (
              <div key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-indigo-600 px-3 py-2 text-sm text-white">{m.content}</div>
            ) : (
              <div key={i} className="max-w-[95%]">
                <div id={`ai-reply-${i}`} className="rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-950 px-3 py-2"><Markdown source={m.content} /></div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-zinc-500">
                  <button onClick={() => copyReply(i, m.content)} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-zinc-800 hover:text-zinc-200">
                    {copiedIdx === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiedIdx === i ? "Copied" : "Copy"}
                  </button>
                  <button onClick={() => setMenuFor(menuFor === i ? null : i)} aria-expanded={menuFor === i}
                    className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-zinc-800 hover:text-zinc-200"><Download className="h-3.5 w-3.5" />Export</button>
                  {menuFor === i && ([
                    ["excel", "Excel", FileSpreadsheet], ["word", "Word", FileText], ["pdf", "PDF", Printer],
                  ] as const).map(([format, label, Icon]) => (
                    <button key={format} onClick={() => exportAs(i, format)} disabled={busyExport} title={format === "pdf" ? "Opens the print dialog; choose Save as PDF" : `Download as ${label}`}
                      className="flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-indigo-500 disabled:opacity-50"><Icon className="h-3.5 w-3.5" />{label}</button>
                  ))}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-950 px-3 py-3" role="status" aria-label="Thinking">
                {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            )}
            {error && <p role="alert" className="break-words text-sm text-rose-400">{error}</p>}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-zinc-800 p-3">
            <div className="flex items-center gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={MAX_MESSAGE_CHARS} aria-label="Your question"
                placeholder={board ? "Ask about this board…" : "Ask about your boards…"}
                className="h-10 min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-950 px-4 text-sm text-zinc-100 outline-none focus:border-indigo-500" />
              <button disabled={!!pendingKey || !input.trim()} aria-label="Send"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-zinc-500">AI can make mistakes. Read-only: it can&apos;t change your boards.</p>
          </form>
        </section>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Close AI chat" : "Open AI chat"} aria-expanded={open} title={open ? "Close AI chat" : "Ask AI about your boards"}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600  text-white shadow-lg shadow-black/40 transition hover:scale-105 hover:bg-indigo-500">
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
