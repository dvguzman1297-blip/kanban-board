"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pause, Play, RotateCcw, X } from "lucide-react";

type FocusCard = { id: string; title: string; boardId?: string };
type Ctx = {
  startFocus: (c: FocusCard) => void;
  card: FocusCard | null; left: number; running: boolean;
  open: () => void; toggle: () => void; stop: () => void;
};
const FocusCtx = createContext<Ctx>({
  startFocus: () => {}, card: null, left: 25 * 60, running: false, open: () => {}, toggle: () => {}, stop: () => {},
});
export const useFocus = () => useContext(FocusCtx);

const DURATION = 25 * 60;

// Mounted in the root layout, so the timer survives board switches.
export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [card, setCard] = useState<FocusCard | null>(null);
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(DURATION);
  const [running, setRunning] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { setRunning(false); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [running]);

  const startFocus = (c: FocusCard) => { setCard(c); setLeft(DURATION); setRunning(true); setOpen(true); };
  const endSession = () => { setRunning(false); setCard(null); setOpen(false); setLeft(DURATION); };

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const pct = ((DURATION - left) / DURATION) * 100;

  return (
    <FocusCtx.Provider value={{ startFocus, card, left, running, open: () => setOpen(true), toggle: () => setRunning((r) => !r), stop: endSession }}>
      {children}

      {/* Minimised "toast": click to reopen, X to end the session */}
      {card && !open && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center overflow-hidden rounded-full bg-indigo-600 text-white shadow-lg">
          <button onClick={() => setOpen(true)} className="px-4 py-2 text-sm font-medium">
            {mm}:{ss} · {card.title.slice(0, 20)}
          </button>
          <button onClick={endSession} aria-label="End focus session" title="End focus session"
            className="border-l border-white/20 px-2.5 py-2 hover:bg-indigo-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <AnimatePresence>
        {open && card && (
          <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-sm flex-col border-l border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <button onClick={() => setOpen(false)} title="Minimise" aria-label="Minimise"
              className="self-end text-zinc-500 hover:text-zinc-200"><X className="h-5 w-5" /></button>
            <p className="mt-2 text-xs uppercase tracking-wide text-zinc-500">Focusing on</p>
            <h3 className="mt-1 text-lg font-semibold leading-snug">{card.title}</h3>
            <div className="my-10 text-center font-mono text-6xl tabular-nums">{mm}:{ss}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="mt-8 flex justify-center gap-3">
              <button onClick={() => setRunning((r) => !r)} className="rounded-full bg-indigo-600 p-3 text-white hover:bg-indigo-500">
                {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <button onClick={() => { setRunning(false); setLeft(DURATION); }} className="rounded-full bg-zinc-800 p-3 hover:bg-zinc-700"><RotateCcw className="h-5 w-5" /></button>
            </div>
            {left === 0 && <p className="mt-6 text-center text-sm text-emerald-400">Session complete — take a 5 min break.</p>}
            <button onClick={endSession} className="mt-auto rounded-lg border border-zinc-800 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
              End session
            </button>
          </motion.aside>
        )}
      </AnimatePresence>
    </FocusCtx.Provider>
  );
}
