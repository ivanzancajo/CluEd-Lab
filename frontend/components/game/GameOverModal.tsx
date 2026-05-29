import { m } from "motion/react";
import type { TeamColor } from "../../src/lib/sessionApi";

interface GameOverModalProps {
  open: boolean;
  onClose: () => void;
  winner: { name: string; color: TeamColor } | null;
  solution: { subject: string; object: string; space: string } | null;
}

export function GameOverModal({ open, onClose, winner, solution }: GameOverModalProps) {
  if (!open) return null;
  const solutionItems = solution
    ? [
        { label: "Sospechoso", value: solution.subject },
        { label: "Objeto", value: solution.object },
        { label: "Lugar", value: solution.space },
      ]
    : null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-[6px]">
      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative mx-4 w-full max-w-md rounded-[24px] border border-red-800/60 bg-slate-950/98 p-6 shadow-[0_0_80px_rgba(239,68,68,0.12)]"
      >
        <div className="text-center">
          <span className="inline-block rounded-full border border-red-700/50 bg-red-950/40 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-red-300">
            Sesión cerrada
          </span>
          <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.14em] text-white">
            Partida finalizada
          </h2>
          {winner ? (
            <p className="mt-2 text-sm text-emerald-300">
              Ganador: <span className="font-bold">{winner.name}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Sin ganadores</p>
          )}
        </div>

        {solutionItems ? (
          <div className="mt-5">
            <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300">
              Solución del caso
            </p>
            <div className="grid grid-cols-3 gap-2">
              {solutionItems.map(({ label, value }, index) => (
                <m.div
                  key={label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1, duration: 0.3 }}
                  className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-center"
                >
                  <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500">{label}</p>
                  <p className="mt-1 text-xs font-bold leading-tight text-amber-100">{value}</p>
                </m.div>
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-200 hover:bg-slate-800 transition-colors"
        >
          Cerrar
        </button>
      </m.div>
    </div>
  );
}
