import { Database, User, Box, MapPin } from 'lucide-react';
import type { TeamHandCard, TeamElementKind } from '../../src/lib/sessionApi';

interface EvidenciasComunesProps {
  publicCards: TeamHandCard[];
}

const KIND_STYLES: Record<TeamElementKind, { border: string; bg: string; icon: typeof User }> = {
  SUJETO: { border: 'border-blue-500', bg: 'bg-blue-950', icon: User },
  OBJETO: { border: 'border-emerald-500', bg: 'bg-emerald-950', icon: Box },
  ESPACIO: { border: 'border-red-500', bg: 'bg-red-950', icon: MapPin },
};

export function EvidenciasComunes({ publicCards }: EvidenciasComunesProps) {
  return (
    <div data-cy="evidencias-comunes-panel" className="w-full">
      <div className="flex items-center gap-2 mb-2">
        <Database className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Evidencias Comunes
        </span>
      </div>

      {publicCards.length === 0 ? (
        <p data-cy="evidencias-comunes-empty" className="text-slate-500 text-xs italic px-1">
          No hay cartas sobrantes en esta partida.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {publicCards.map((card) => {
            const styles = KIND_STYLES[card.kind];
            const Icon = styles.icon;
            return (
              <div
                key={card.id}
                data-cy="evidencias-comunes-card"
                className={`w-28 flex-shrink-0 aspect-[2.5/3.5] rounded-lg border-2 ${styles.border} ${styles.bg} flex flex-col overflow-hidden relative`}
              >
                <div className="h-1/2 relative flex items-center justify-center border-b border-white/10">
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Icon className="w-8 h-8 text-white/40" />
                  )}
                  <div className={`absolute top-1 right-1 rounded-full p-0.5 ${styles.bg}`}>
                    <Icon className="w-3 h-3 text-white/70" />
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center px-1">
                  <span className="text-white text-[10px] font-medium text-center line-clamp-2 leading-tight">
                    {card.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
