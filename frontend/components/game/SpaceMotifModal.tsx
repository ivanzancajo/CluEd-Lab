import { MapPin } from 'lucide-react';
import type { BoardSpaceLabel } from '../../src/lib/boardTheme';
import { ImageWithFallback } from '../figma/ImageWithFallback';

type SpaceMotifModalProps = {
  space: BoardSpaceLabel | null;
  onClose: () => void;
};

export function SpaceMotifModal({ space, onClose }: SpaceMotifModalProps) {
  if (!space) {
    return null;
  }

  return (
    <div
      data-cy="space-motif-modal-overlay"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        data-cy="space-motif-modal"
        className="relative mx-4 max-w-xs w-full rounded-xl border border-amber-800/60 bg-slate-950/95 p-5 shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          data-cy="space-motif-modal-close"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border border-amber-800/50 bg-amber-900/40 text-amber-200 text-xs hover:bg-amber-800/60 transition-colors"
          aria-label="Cerrar"
        >
          ×
        </button>

        {space.imageUrl && (
          <div className="mb-3 flex justify-center">
            <ImageWithFallback
              src={space.imageUrl}
              alt={space.name}
              className="h-16 w-16 rounded-lg object-cover border border-amber-800/40 shadow-md"
              fallback={
                <div className="h-16 w-16 rounded-lg border border-amber-800/40 flex items-center justify-center bg-slate-900">
                  <MapPin className="w-8 h-8 text-amber-700/60" />
                </div>
              }
            />
          </div>
        )}

        <h3 className="mb-1 text-center font-black text-amber-100 text-sm tracking-wide">
          {space.name}
        </h3>

        {space.motif && (
          <p className="mb-3 text-center text-xs font-semibold text-amber-400 italic border-b border-amber-800/40 pb-2">
            {space.motif}
          </p>
        )}

        {space.desc && (
          <p className="text-center text-[11px] leading-relaxed text-slate-300">
            {space.desc}
          </p>
        )}
      </div>
    </div>
  );
}
