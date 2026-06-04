const playerRules = [
  {
    title: "Movimiento",
    body: "Para moverte por los pasillos necesitas usar exactamente la tirada total de dados. Para entrar en una sala basta con que la puerta esté a una distancia menor o igual a tu tirada total: no hace falta agotar los pasos exactos.",
  },
  {
    title: "Pasadizos",
    body: "Si ya estás dentro de una sala puedes usar el pasadizo en tu turno para moverte directamente a la sala conectada, sin necesidad de haber entrado ese mismo turno. Usar el pasadizo no consume dados. Las 4 habitaciones de las esquinas del tablero disponen de pasadizo secreto que conecta diagonalmente con su sala opuesta.",
  },
  {
    title: "Sugerencias",
    body: "Al entrar en una sala puedes lanzar una sugerencia/hipótesis sobre el caso o simplemente terminar tu turno sin sugerir. Si sugieres, indica un sospechoso y un objeto. Los equipos refutan en orden mostrando una carta si la tienen; solo tú ves qué carta se muestra.",
  },
  {
    title: "Acusación final",
    body: "Cuando estés seguro, acusa. Si aciertas ganas la partida. Si fallas eres eliminado, pero sigues mostrando cartas para refutar mientras el juego continúe.",
  },
];

const gmRules = [
  {
    title: "Pausar y reanudar",
    body: "Puedes pausar y reanudar la partida en cualquier momento desde el panel lateral. La pausa detiene los turnos pero los jugadores permanecen conectados.",
  },
  {
    title: "Resolución",
    body: "Cuando un equipo acusa correctamente o todos los activos son eliminados, podrás elegir entre revelar la solución directamente o abrir una última ronda de acusaciones simultáneas para todos los equipos.",
  },
  {
    title: "Vista general",
    body: "La pantalla central muestra el estado de todos los equipos, el historial de eventos y las cartas públicas disponibles para todos los jugadores.",
  },
  {
    title: "Cartas públicas",
    body: "Las cartas sobrantes del reparto son visibles para todos como evidencia compartida. Los jugadores pueden consultarlas en la sección de evidencias de su terminal.",
  },
];

export function RulesModal({ open, onClose, role = "player" }: { open: boolean; onClose: () => void; role?: "player" | "gm" }) {
  if (!open) return null;
  const rules = role === "gm" ? gmRules : playerRules;
  const title = role === "gm" ? "Instrucciones del GM" : "Reglas del juego";
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
        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-amber-300 mb-4">{title}</h3>
        <ol className="flex flex-col gap-3 text-[11px] leading-relaxed text-slate-300">
          {rules.map((rule) => (
            <li key={rule.title}>
              <strong className="text-amber-100">{rule.title}</strong> — {rule.body}
            </li>
          ))}
        </ol>
      </div>
    </button>
  );
}
