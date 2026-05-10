export type StoredBoardItem = {
  id: string;
  name: string;
  desc?: string;
  motif?: string;
  imageUrl?: string;
};

export type StoredBoardConfig = {
  id?: string;
  centerImage?: string;
  cat1Name?: string;
  cat2Name?: string;
  cat3Name?: string;
  hasMotifs?: boolean;
  subjects?: StoredBoardItem[];
  objects?: StoredBoardItem[];
  spaces?: StoredBoardItem[];
};

export type StoredBoardTheme = StoredBoardConfig;

export type BoardLabelSlot = {
  id: string;
  positionX: number;
  positionY: number;
  widthPercent: number;
  nameSize: string;
  motifSize: string;
  horizontalAnchor?: 'left' | 'center' | 'right';
  textAlign?: 'left' | 'center' | 'right';
};

export type BoardCenterImageBounds = {
  positionX: number;
  positionY: number;
  widthPercent: number;
  heightPercent: number;
};

export type BoardSpaceLabel = {
  id: string;
  name: string;
  motif?: string;
};

export const BOARD_BASE_IMAGE_PATH = '/board-base.jpg';

export const BOARD_SPACE_SLOTS: BoardLabelSlot[] = [
  { id: 'slot-1', positionX: 21.66, positionY: 15.17, widthPercent: 14.2, nameSize: 'clamp(9px, 1.05vw, 14px)',  motifSize: 'clamp(7px, 0.76vw, 10px)',  horizontalAnchor: 'center', textAlign: 'center' },
  { id: 'slot-2', positionX: 50.2, positionY: 18.72, widthPercent: 12.4,  nameSize: 'clamp(9px, 1.0vw, 13px)',   motifSize: 'clamp(7px, 0.72vw, 9.5px)', horizontalAnchor: 'center', textAlign: 'center' },
  { id: 'slot-3', positionX: 78.6, positionY: 17.72, widthPercent: 14.6,  nameSize: 'clamp(9px, 1.0vw, 13px)',   motifSize: 'clamp(7px, 0.72vw, 9.5px)', horizontalAnchor: 'center', textAlign: 'center' },
  { id: 'slot-4', positionX: 21.6, positionY: 37.0, widthPercent: 13.9,   nameSize: 'clamp(9px, 1.0vw, 13px)',   motifSize: 'clamp(7px, 0.72vw, 9.5px)', horizontalAnchor: 'center', textAlign: 'center' },
  { id: 'slot-5', positionX: 20.26, positionY: 56.6, widthPercent: 14.2,  nameSize: 'clamp(9px, 1.0vw, 13px)',   motifSize: 'clamp(7px, 0.72vw, 9.5px)', horizontalAnchor: 'center', textAlign: 'center' },
  { id: 'slot-6', positionX: 76.6, positionY: 48.68, widthPercent: 15.2,  nameSize: 'clamp(9px, 1.05vw, 13.5px)', motifSize: 'clamp(7px, 0.76vw, 10px)',  horizontalAnchor: 'center', textAlign: 'center' },
  { id: 'slot-7', positionX: 19.83, positionY: 81.0, widthPercent: 12.9,  nameSize: 'clamp(8.5px, 0.96vw, 12.5px)', motifSize: 'clamp(6.5px, 0.7vw, 9px)', horizontalAnchor: 'center', textAlign: 'center' },
  { id: 'slot-8', positionX: 50.2, positionY: 77.1, widthPercent: 19.2,   nameSize: 'clamp(9px, 1.05vw, 14px)',  motifSize: 'clamp(7px, 0.76vw, 10px)',  horizontalAnchor: 'center', textAlign: 'center' },
  { id: 'slot-9', positionX: 79.8, positionY: 78.6, widthPercent: 13.4,   nameSize: 'clamp(8.5px, 0.96vw, 12.5px)', motifSize: 'clamp(6.5px, 0.7vw, 9px)', horizontalAnchor: 'center', textAlign: 'center' },
] as const;

export const BOARD_CENTER_IMAGE_BOUNDS: BoardCenterImageBounds = {
  positionX: 48.3,
  positionY: 46.4,
  widthPercent: 14.6,
  heightPercent: 20.9,
};

export function readStoredActiveBoardConfig() {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedConfig = localStorage.getItem('activeConfig');
  if (!storedConfig) {
    return null;
  }

  try {
    return JSON.parse(storedConfig) as StoredBoardConfig;
  } catch {
    return null;
  }
}

export const readStoredBoardTheme = readStoredActiveBoardConfig;

export function mapBoardSpaces(config: StoredBoardConfig | null): BoardSpaceLabel[] {
  const spaces = config?.spaces ?? [];
  const showMotifs = config?.hasMotifs === true;

  return spaces.slice(0, BOARD_SPACE_SLOTS.length).map((space, index) => ({
    id: space.id || BOARD_SPACE_SLOTS[index]?.id || `space-${index + 1}`,
    name: space.name,
    motif: showMotifs ? normalizeOptionalText(space.motif) : undefined,
  }));
}

export function toBoardPercent(value: number) {
  const normalized = Number.isFinite(value) ? value : 0;
  const clamped = Math.min(100, Math.max(0, normalized));
  return `${clamped}%`;
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}