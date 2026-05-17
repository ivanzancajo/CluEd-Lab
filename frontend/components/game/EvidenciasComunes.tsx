import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Database, User, Box, MapPin, EyeOff } from 'lucide-react';
import type { TeamHandCard, TeamElementKind } from '../../src/lib/sessionApi';

interface EvidenciasComunesProps {
  publicCards: TeamHandCard[];
  hiddenCards?: TeamHandCard[];
  onConsultHiddenCard?: (elementId: string) => Promise<void>;
  isConsultingHiddenCard?: boolean;
}

const KIND_STYLES: Record<TeamElementKind, { border: string; bg: string; icon: typeof User; label: string }> = {
  SUJETO: { border: 'border-blue-500', bg: 'bg-blue-950', icon: User, label: 'Sujeto' },
  OBJETO: { border: 'border-emerald-500', bg: 'bg-emerald-950', icon: Box, label: 'Objeto' },
  ESPACIO: { border: 'border-red-500', bg: 'bg-red-950', icon: MapPin, label: 'Espacio' },
};

export function EvidenciasComunes({
  publicCards,
  hiddenCards = [],
  onConsultHiddenCard,
  isConsultingHiddenCard = false,
}: EvidenciasComunesProps) {
  const [selectedCard, setSelectedCard] = useState<TeamHandCard | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);

  const handleCardClick = (card: TeamHandCard) => {
    setSelectedCard(card);
    setCardFlipped(false);
  };

  const handleCloseModal = () => {
    setSelectedCard(null);
    setCardFlipped(false);
  };

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
                onClick={() => handleCardClick(card)}
                className={`w-28 flex-shrink-0 aspect-[2.5/3.5] rounded-lg border-2 ${styles.border} ${styles.bg} flex flex-col overflow-hidden relative cursor-pointer hover:brightness-125 transition-all`}
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

      {hiddenCards.length > 0 && (
        <div className="mt-4" data-cy="cartas-ocultas-panel">
          <div className="flex items-center gap-2 mb-2">
            <EyeOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Cartas Ocultas
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {hiddenCards.map((card) => (
              <div
                key={card.id}
                data-cy="carta-oculta"
                className="w-28 flex-shrink-0 aspect-[2.5/3.5] rounded-lg border-2 border-amber-700/60 bg-amber-950/30 flex flex-col overflow-hidden"
              >
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full border-2 border-amber-700/40 flex items-center justify-center">
                    <EyeOff className="w-7 h-7 text-amber-700/60" />
                  </div>
                </div>
                <button
                  data-cy="carta-oculta-consultar"
                  onClick={() => onConsultHiddenCard?.(card.id)}
                  disabled={isConsultingHiddenCard}
                  className="w-full py-1.5 text-[9px] font-bold uppercase tracking-wider bg-amber-900/50 hover:bg-amber-800/60 text-amber-300 transition-colors border-t border-amber-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConsultingHiddenCard ? 'Consultando...' : 'Consultar en secreto'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedCard && (() => {
          const styles = KIND_STYLES[selectedCard.kind];
          const Icon = styles.icon;
          return (
            <motion.div
              key="evidencias-comunes-modal"
              data-cy="evidencias-comunes-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm"
              onClick={handleCloseModal}
            >
              <motion.div
                data-cy="evidencias-comunes-modal-card"
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0, rotateY: cardFlipped ? 180 : 0 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.4, type: 'spring' }}
                onClick={(e) => { e.stopPropagation(); setCardFlipped(!cardFlipped); }}
                className={`w-48 aspect-[2.5/3.5] rounded-xl border-4 ${styles.border} shadow-[0_0_30px_rgba(0,0,0,0.8)] relative cursor-pointer [transform-style:preserve-3d]`}
              >
                {/* Front */}
                <div className={`absolute inset-0 [backface-visibility:hidden] flex flex-col items-center justify-start text-center ${styles.bg} bg-opacity-90 overflow-hidden rounded-lg`}>
                  <div className="w-full h-[60%] bg-black/40 border-b border-slate-700/50 flex flex-col items-center justify-center relative overflow-hidden">
                    {selectedCard.imageUrl ? (
                      <img src={selectedCard.imageUrl} alt={selectedCard.name} className="w-full h-full object-cover opacity-90" />
                    ) : (
                      <div className="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center border border-slate-700">
                        <Icon className="w-6 h-6 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <div className="w-full flex-1 flex flex-col items-center justify-center p-2">
                    <h4 data-cy="evidencias-comunes-modal-name" className="font-bold text-sm tracking-widest uppercase text-white drop-shadow-md leading-tight line-clamp-2 px-1">{selectedCard.name}</h4>
                    <span data-cy="evidencias-comunes-modal-kind" className="text-[9px] uppercase tracking-widest text-slate-400 mt-2 bg-black/50 px-2 py-1 rounded border border-slate-800">{styles.label}</span>
                  </div>
                </div>

                {/* Back */}
                <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col items-center justify-center p-4 text-center bg-slate-950 border border-slate-700 rounded-lg">
                  <h4 className="font-bold text-xs tracking-widest uppercase text-slate-300 mb-4 border-b border-slate-800 pb-2 w-full">{selectedCard.name}</h4>
                  <p data-cy="evidencias-comunes-modal-desc" className="text-xs text-slate-400 leading-relaxed font-mono">{selectedCard.desc}</p>
                  <div className="mt-auto text-[8px] text-cyan-500 uppercase tracking-widest animate-pulse">
                    Toca para voltear
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
