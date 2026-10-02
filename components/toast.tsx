"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type Tone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: Tone };

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(ToastContext);

const ICON = { success: CheckCircle2, error: XCircle, info: Info };
const COLOR = { success: "text-emerald-300", error: "text-rose-300", info: "text-indigo-300" };

/** Lives in the root layout so toasts survive client-side navigation (e.g. "You have joined …" then redirect). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((message: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm shadow-xl">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${COLOR[t.tone]}`} />
              <p className="min-w-0 flex-1 break-words">{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-zinc-500 hover:text-zinc-200"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
