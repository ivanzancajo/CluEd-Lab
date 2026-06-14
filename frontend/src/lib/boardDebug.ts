const BOARD_DEBUG_MODE_STORAGE_KEY = 'boardDebugMode';

export type BoardDebugProbe = {
  positionX: number;
  positionY: number;
  nearestNodeId: string | null;
  nearestNodeLabel: string | null;
  nearestNodeKind: string | null;
};

type BoardDebugMatchedNode = {
  id: string;
  label: string;
  kind: string;
};

export function getStoredBoardDebugMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  const queryOverride = parseDebugQueryOverride(window.location.search);
  if (queryOverride !== null) {
    return queryOverride;
  }

  return window.localStorage.getItem(BOARD_DEBUG_MODE_STORAGE_KEY) === '1';
}

export function setStoredBoardDebugMode(enabled: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(BOARD_DEBUG_MODE_STORAGE_KEY, enabled ? '1' : '0');
}

export function buildBoardDebugProbe(
  positionX: number,
  positionY: number,
  nearestNode: BoardDebugMatchedNode | null
): BoardDebugProbe {
  return {
    positionX: roundToTwoDecimals(positionX),
    positionY: roundToTwoDecimals(positionY),
    nearestNodeId: nearestNode?.id ?? null,
    nearestNodeLabel: nearestNode?.label ?? null,
    nearestNodeKind: nearestNode?.kind ?? null,
  };
}

function parseDebugQueryOverride(search: string) {
  const rawValue = new URLSearchParams(search).get('boardDebug');
  if (rawValue === null) {
    return null;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'on') {
    return true;
  }

  if (normalizedValue === '0' || normalizedValue === 'false' || normalizedValue === 'off') {
    return false;
  }

  return null;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}