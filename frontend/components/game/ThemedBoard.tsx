import type { ReactNode } from 'react';
import { Crosshair } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import {
  BOARD_GRID_COLUMNS_PERCENT,
  BOARD_GRID_ROWS_PERCENT,
  BOARD_MOVEMENT_NODE_LIST,
} from '../../src/lib/boardMovement';
import type { BoardDebugProbe } from '../../src/lib/boardDebug';
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
  isEliminated?: boolean;
};

type ThemedBoardProps = {
  boardAlt?: string;
  boardImageAlt?: string;
  centerImage?: string;
  centerImageAlt?: string;
  spaces: BoardSpaceLabel[];
  showSpaceLabels?: boolean;
  teams?: ThemedBoardTeam[];
  pawns?: ThemedBoardTeam[];
  showDebugOverlay?: boolean;
  debugProbe?: BoardDebugProbe | null;
  debugHighlightedNodeIds?: string[];
  moveDestinationNodeIds?: string[];
  selectedMoveNodeId?: string;
  spaceNameScale?: number;
  spaceMotifScale?: number;
  onSpaceMotifClick?: (space: BoardSpaceLabel) => void;
  children?: ReactNode;
  className?: string;
  dataCy?: string;
};

const PAWN_SIZE_PERCENT = 4.1;

export function ThemedBoard({
  boardAlt,
  boardImageAlt,
  centerImage,
  centerImageAlt,
  spaces,
  showSpaceLabels = true,
  teams,
  pawns,
  showDebugOverlay = false,
  debugProbe,
  debugHighlightedNodeIds,
  moveDestinationNodeIds,
  selectedMoveNodeId,
  spaceNameScale = 1,
  spaceMotifScale: _spaceMotifScale = 1,
  onSpaceMotifClick,
  children,
  className,
  dataCy,
}: ThemedBoardProps) {
  const resolvedBoardAlt = boardImageAlt ?? boardAlt ?? 'Tablero temático';
  const resolvedCenterImageAlt = centerImageAlt ?? 'Imagen central de la skin';
  const boardPawns = pawns ?? teams ?? [];
  const highlightedNodeIds = new Set(debugHighlightedNodeIds ?? []);

  return (
    <div
      data-cy={dataCy}
      className={joinClasses('relative w-full h-full overflow-hidden rounded-lg border border-[#5c1a1a]', className)}
    >
      <img src={BOARD_BASE_IMAGE_PATH} alt={resolvedBoardAlt} className="w-full h-full object-contain" />

      {showSpaceLabels ? spaces.map((space, index) => {
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
              'absolute -translate-y-1/2',
              isCenteredSlot ? '-translate-x-1/2' : undefined,
              space.motif ? 'z-30 pointer-events-auto' : 'z-10 pointer-events-none'
            )}
            style={getBoardLabelStyle(slot)}
          >
            <div className="relative w-full overflow-hidden text-center">
              <p
                className="font-black leading-[1.05] tracking-[0.01em] text-[#1b5a6d] [text-shadow:0_1px_2px_rgba(255,255,255,0.55)]"
                style={{
                  fontSize: scaleBoardFontSize(slot.nameSize, spaceNameScale),
                  textAlign: slot.textAlign ?? 'center',
                  overflowWrap: 'break-word',
                }}
              >
                {space.name}
              </p>
              {space.motif ? (
                <button
                  type="button"
                  data-cy={`board-space-motif-${index + 1}`}
                  onClick={(e) => { e.stopPropagation(); onSpaceMotifClick?.(space); }}
                  className="absolute top-0 right-0 z-30 flex size-5 items-center justify-center rounded-full bg-amber-900/70 text-[9px] font-black text-amber-100 shadow-sm backdrop-blur-sm border border-amber-700/60 hover:bg-amber-800/90 hover:scale-110 transition-all duration-150"
                  title={space.motif}
                >
                  M
                </button>
              ) : null}
            </div>
          </div>
        );
      }) : null}

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
            alt={resolvedCenterImageAlt}
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}

      {boardPawns.map((team) => {
        const teamMeta = getTeamMeta(team.color);

        return (
          <m.div
            key={team.id}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: team.isEliminated ? 0.55 : (team.opacity ?? 1) }}
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
              filter: team.isEliminated ? 'grayscale(0.6)' : undefined,
            }}
          >
            {team.isEliminated ? (
              <svg
                viewBox="0 0 10 10"
                className="absolute size-[60%] stroke-red-500"
                style={{ strokeWidth: 2, strokeLinecap: 'round' }}
              >
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            ) : team.isCurrent ? (
              <Crosshair className="size-[56%] text-white" />
            ) : (
              <div className="size-[30%] rounded-full bg-white/45 backdrop-blur-sm" />
            )}
          </m.div>
        );
      })}

      {(moveDestinationNodeIds && moveDestinationNodeIds.length > 0) || selectedMoveNodeId ? (
        <BoardMoveHighlightLayer
          destinationNodeIds={moveDestinationNodeIds ?? []}
          selectedNodeId={selectedMoveNodeId}
        />
      ) : null}

      {showDebugOverlay ? (
        <BoardDebugOverlay debugProbe={debugProbe} highlightedNodeIds={highlightedNodeIds} />
      ) : null}

      {children}
    </div>
  );
}

function BoardMoveHighlightLayer({
  destinationNodeIds,
  selectedNodeId,
}: {
  destinationNodeIds: string[];
  selectedNodeId?: string;
}) {
  const destinationSet = new Set(destinationNodeIds);

  return (
    <div
      data-cy="board-move-highlight-layer"
      className="pointer-events-none absolute inset-0 z-[19] overflow-hidden"
    >
      <AnimatePresence>
        {BOARD_MOVEMENT_NODE_LIST.map((node) => {
          const isSelected = node.id === selectedNodeId;
          const isDestination = destinationSet.has(node.id);
          if (!isSelected && !isDestination) return null;

          return (
            <m.div
              key={node.id}
              data-cy={`board-move-node-${sanitizeDebugNodeId(node.id)}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: toBoardPercent(node.positionX), top: toBoardPercent(node.positionY) }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={
                isSelected
                  ? { scale: [1, 1.3, 1], opacity: 1 }
                  : { scale: [0.85, 1.05, 0.85], opacity: [0.55, 0.85, 0.55] }
              }
              exit={{ scale: 0.4, opacity: 0 }}
              transition={
                isSelected
                  ? { duration: 0.85, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              {isSelected ? (
                <div
                  className={joinClasses(
                    'rounded-full border-2 border-emerald-300 bg-emerald-400/30 shadow-[0_0_12px_rgba(52,211,153,0.85)]',
                    node.kind === 'room' ? 'size-7' : 'size-4'
                  )}
                />
              ) : (
                <div
                  className={joinClasses(
                    'rounded-full border border-cyan-300/80 bg-cyan-400/20 shadow-[0_0_6px_rgba(34,211,238,0.5)]',
                    node.kind === 'room' ? 'size-6' : 'size-3'
                  )}
                />
              )}
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function BoardDebugOverlay({
  debugProbe,
  highlightedNodeIds,
}: {
  debugProbe?: BoardDebugProbe | null;
  highlightedNodeIds: Set<string>;
}) {
  const probedGridPosition = debugProbe
    ? findClosestGridPosition(debugProbe.positionX, debugProbe.positionY)
    : null;
  const probedGridBounds = probedGridPosition
    ? getDebugGridCellBounds(probedGridPosition.col, probedGridPosition.row, 0.1)
    : null;

  return (
    <div data-cy="board-debug-overlay" className="pointer-events-none absolute inset-0 z-[24] overflow-hidden">
      {BOARD_GRID_COLUMNS_PERCENT.map((positionX, columnIndex) => (
        <div key={`debug-col-${positionX}`}>
          <div
            data-cy={`board-debug-grid-col-${columnIndex}`}
            className="absolute inset-y-0 w-px bg-cyan-300/30"
            style={{ left: toBoardPercent(positionX) }}
          />
          <div
            className="absolute top-1 -translate-x-1/2 rounded bg-slate-950/85 px-1 py-0.5 font-mono text-[8px] text-cyan-100"
            style={{ left: toBoardPercent(positionX) }}
          >
            C{columnIndex}
          </div>
        </div>
      ))}

      {BOARD_GRID_ROWS_PERCENT.map((positionY, rowIndex) => (
        <div key={`debug-row-${positionY}`}>
          <div
            data-cy={`board-debug-grid-row-${rowIndex}`}
            className="absolute inset-x-0 h-px bg-cyan-300/30"
            style={{ top: toBoardPercent(positionY) }}
          />
          <div
            className="absolute left-1 -translate-y-1/2 rounded bg-slate-950/85 px-1 py-0.5 font-mono text-[8px] text-cyan-100"
            style={{ top: toBoardPercent(positionY) }}
          >
            R{rowIndex}
          </div>
        </div>
      ))}

      {BOARD_MOVEMENT_NODE_LIST.map((node) => {
        const isGeneratedSquare = node.id.startsWith('square:');
        const isHighlighted = highlightedNodeIds.has(node.id);

        return (
          <div
            key={node.id}
            data-cy={`board-debug-node-${sanitizeDebugNodeId(node.id)}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: toBoardPercent(node.positionX),
              top: toBoardPercent(node.positionY),
            }}
          >
            <div
              className={joinClasses(
                'rounded-full border border-slate-950/90 shadow-[0_0_8px_rgba(0,0,0,0.45)]',
                getBoardDebugMarkerClass(node.kind, isGeneratedSquare, isHighlighted)
              )}
            />
          </div>
        );
      })}

      {debugProbe ? (
        <>
          {probedGridBounds ? (
            <div
              data-cy="board-debug-probe-cell"
              className="absolute rounded-[4px] border border-fuchsia-300/90 bg-fuchsia-300/10 shadow-[0_0_14px_rgba(232,121,249,0.22)]"
              style={{
                left: toBoardPercent(probedGridBounds.left),
                top: toBoardPercent(probedGridBounds.top),
                width: `${probedGridBounds.right - probedGridBounds.left}%`,
                height: `${probedGridBounds.bottom - probedGridBounds.top}%`,
              }}
            />
          ) : null}
          <div
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-100 bg-fuchsia-300/80 shadow-[0_0_10px_rgba(232,121,249,0.7)]"
            style={{
              left: toBoardPercent(debugProbe.positionX),
              top: toBoardPercent(debugProbe.positionY),
            }}
          />
        </>
      ) : null}

    </div>
  );
}

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function getBoardDebugMarkerClass(kind: string, isGeneratedSquare: boolean, isHighlighted: boolean) {
  if (isHighlighted) {
    return 'h-3.5 w-3.5 bg-fuchsia-200 ring-2 ring-fuchsia-500/70';
  }

  if (kind === 'room') {
    return 'h-3.5 w-3.5 bg-amber-300/90';
  }

  if (kind === 'spawn') {
    return 'h-3.5 w-3.5 bg-emerald-300/90';
  }

  return isGeneratedSquare ? 'size-2 bg-cyan-200/80' : 'size-3 bg-cyan-300/90';
}


function findClosestGridPosition(positionX: number, positionY: number) {
  return {
    col: findClosestIndex(BOARD_GRID_COLUMNS_PERCENT, positionX),
    row: findClosestIndex(BOARD_GRID_ROWS_PERCENT, positionY),
  };
}

function findClosestIndex(values: readonly number[], target: number) {
  return values.reduce((bestIndex, currentValue, currentIndex) => {
    const bestDistance = Math.abs(values[bestIndex] - target);
    const currentDistance = Math.abs(currentValue - target);
    return currentDistance < bestDistance ? currentIndex : bestIndex;
  }, 0);
}

function getDebugGridCellBounds(col: number, row: number, insetRatio = 0) {
  const centerX = BOARD_GRID_COLUMNS_PERCENT[col];
  const centerY = BOARD_GRID_ROWS_PERCENT[row];
  const previousX = col === 0 ? centerX - (BOARD_GRID_COLUMNS_PERCENT[col + 1] - centerX) : BOARD_GRID_COLUMNS_PERCENT[col - 1];
  const nextX = col === BOARD_GRID_COLUMNS_PERCENT.length - 1
    ? centerX + (centerX - BOARD_GRID_COLUMNS_PERCENT[col - 1])
    : BOARD_GRID_COLUMNS_PERCENT[col + 1];
  const previousY = row === 0 ? centerY - (BOARD_GRID_ROWS_PERCENT[row + 1] - centerY) : BOARD_GRID_ROWS_PERCENT[row - 1];
  const nextY = row === BOARD_GRID_ROWS_PERCENT.length - 1
    ? centerY + (centerY - BOARD_GRID_ROWS_PERCENT[row - 1])
    : BOARD_GRID_ROWS_PERCENT[row + 1];
  const left = (previousX + centerX) / 2;
  const right = (centerX + nextX) / 2;
  const top = (previousY + centerY) / 2;
  const bottom = (centerY + nextY) / 2;
  const insetX = ((right - left) / 2) * insetRatio;
  const insetY = ((bottom - top) / 2) * insetRatio;

  return {
    left: left + insetX,
    right: right - insetX,
    top: top + insetY,
    bottom: bottom - insetY,
  };
}

function sanitizeDebugNodeId(nodeId: string) {
  return nodeId.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function scaleBoardFontSize(fontSize: string, scale: number) {
  if (scale === 1) {
    return fontSize;
  }

  return `calc(${fontSize} * ${scale})`;
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