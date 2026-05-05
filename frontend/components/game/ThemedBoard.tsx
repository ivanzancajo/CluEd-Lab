import type { ReactNode } from 'react';
import { Crosshair } from 'lucide-react';
import { motion } from 'motion/react';
import {
  BOARD_BASE_IMAGE_PATH,
  BOARD_CENTER_IMAGE_BOUNDS,
  BOARD_SPACE_SLOTS,
  toBoardPercent,
  type BoardLabelSlot,
  type BoardSpaceLabel,
} from '../../src/lib/boardTheme';
import { getTeamMeta } from '../../src/lib/teamMeta';
import type { TeamColor } from '../../src/lib/sessionApi';

type ThemedBoardTeam = {
  id: string;
  color: TeamColor;
  positionX: number;
  positionY: number;
  opacity?: number;
  isCurrent?: boolean;
};

type ThemedBoardProps = {
  boardAlt?: string;
  boardImageAlt?: string;
  centerImage?: string;
  spaces: BoardSpaceLabel[];
  teams?: ThemedBoardTeam[];
  pawns?: ThemedBoardTeam[];
  children?: ReactNode;
  className?: string;
  dataCy?: string;
};

const PAWN_SIZE_PERCENT = 4.1;

export function ThemedBoard({
  boardAlt,
  boardImageAlt,
  centerImage,
  spaces,
  teams,
  pawns,
  children,
  className,
  dataCy,
}: ThemedBoardProps) {
  const resolvedBoardAlt = boardImageAlt ?? boardAlt ?? 'Tablero temático';
  const boardPawns = pawns ?? teams ?? [];

  return (
    <div
      data-cy={dataCy}
      className={joinClasses('relative w-full h-full overflow-hidden rounded-lg border border-[#5c1a1a]', className)}
    >
      <img src={BOARD_BASE_IMAGE_PATH} alt={resolvedBoardAlt} className="w-full h-full object-contain" />

      {spaces.map((space, index) => {
        const slot = BOARD_SPACE_SLOTS[index];
        if (!slot) {
          return null;
        }

        const isCenteredSlot = (slot.horizontalAnchor ?? 'center') === 'center';

        return (
          <div
            key={space.id}
            data-cy={`board-space-${index + 1}`}
            className={joinClasses(
              'pointer-events-none absolute z-10 -translate-y-1/2',
              isCenteredSlot ? '-translate-x-1/2' : undefined
            )}
            style={getBoardLabelStyle(slot)}
          >
            <div className="w-full text-center">
              <p
                className="font-black leading-[0.98] tracking-[0.01em] text-[#1b5a6d]"
                style={{
                  fontSize: slot.nameSize,
                  textAlign: slot.textAlign ?? 'center',
                }}
              >
                {space.name}
              </p>
              {space.motif ? (
                <p
                  className="mt-1 leading-[1] text-[#6b5231]"
                  style={{
                    fontSize: slot.motifSize,
                    textAlign: slot.textAlign ?? 'center',
                  }}
                >
                  {space.motif}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}

      {centerImage ? (
        <div
          data-cy="board-center-image"
          className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden"
          style={{
            left: toBoardPercent(BOARD_CENTER_IMAGE_BOUNDS.positionX),
            top: toBoardPercent(BOARD_CENTER_IMAGE_BOUNDS.positionY),
            width: `${BOARD_CENTER_IMAGE_BOUNDS.widthPercent}%`,
            height: `${BOARD_CENTER_IMAGE_BOUNDS.heightPercent}%`,
          }}
        >
          <img
            src={centerImage}
            alt="Imagen central de la skin"
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}

      {boardPawns.map((team) => {
        const teamMeta = getTeamMeta(team.color);

        return (
          <motion.div
            key={team.id}
            initial={{ scale: 0 }}
            animate={{ scale: 1, opacity: team.opacity ?? 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
            data-cy={`board-pawn-${team.color.toLowerCase()}`}
            className={joinClasses(
              'absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-slate-900 shadow-[0_0_15px_rgba(0,0,0,0.8)]',
              team.isCurrent ? 'animate-bounce' : ''
            )}
            style={{
              top: toBoardPercent(team.positionY),
              left: toBoardPercent(team.positionX),
              width: `${PAWN_SIZE_PERCENT}%`,
              height: `${PAWN_SIZE_PERCENT}%`,
              backgroundColor: teamMeta.hexColor,
              borderColor: teamMeta.hexColor,
            }}
          >
            {team.isCurrent ? (
              <Crosshair className="h-[56%] w-[56%] text-white" />
            ) : (
              <div className="h-[30%] w-[30%] rounded-full bg-white/45 backdrop-blur-sm" />
            )}
          </motion.div>
        );
      })}

      {children}
    </div>
  );
}

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function getBoardLabelStyle(slot: BoardLabelSlot) {
  const horizontalAnchor = slot.horizontalAnchor ?? 'center';

  if (horizontalAnchor === 'left') {
    return {
      top: toBoardPercent(slot.positionY),
      left: toBoardPercent(slot.positionX),
      width: `${slot.widthPercent}%`,
    };
  }

  if (horizontalAnchor === 'right') {
    return {
      top: toBoardPercent(slot.positionY),
      right: toBoardPercent(100 - slot.positionX),
      width: `${slot.widthPercent}%`,
    };
  }

  return {
    top: toBoardPercent(slot.positionY),
    left: toBoardPercent(slot.positionX),
    width: `${slot.widthPercent}%`,
  };
}