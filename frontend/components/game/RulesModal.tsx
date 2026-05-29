export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <button
      type="button"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-xl border border-amber-800/60 bg-slate-950/95 p-5 shadow-[0_0_40px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-500 hover:text-amber-400 text-lg leading-none"
          aria-label="Cerrar"
        >
          ×
        </button>
        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-amber-300 mb-4">Reglas del juego</h3>
        <ol className="flex flex-col gap-3 text-[11px] leading-relaxed text-slate-300">
          <li>
            <strong className="text-amber-100">Movimiento relajado</strong> — No hace falta sacar el número exacto. Puedes moverte a cualquier casilla alcanzable con los dados disponibles, incluyendo entrar en una sala si tienes dados suficientes.
          </li>
          <li>
            <strong className="text-amber-100">Pasadizos</strong> — Desde ciertas salas hay pasadizos directos a otras. Usarlos es gratuito: no consume dados y te transporta directamente.
          </li>
          <li>
            <strong className="text-amber-100">Sugerencias</strong> — Al entrar en una sala puedes sugerir un sospechoso y un objeto. Los equipos refutan en orden mostrando una carta si la tienen; solo tú ves qué carta se muestra.
          </li>
          <li>
            <strong className="text-amber-100">Acusación final</strong> — Cuando estés seguro, acusa. Si aciertas, ganas. Si fallas, eres eliminado pero sigues mostrando cartas para refutar.
          </li>
        </ol>
      </div>
    </button>
  );
}
