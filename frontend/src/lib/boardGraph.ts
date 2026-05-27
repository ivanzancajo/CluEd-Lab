export type BoardMovementNodeKind = 'spawn' | 'square' | 'room';

export type BoardGridCoordinate = {
  col: number;
  row: number;
};

type BaseMovementNode = {
  id: string;
  label: string;
  positionX: number;
  positionY: number;
  kind: BoardMovementNodeKind;
};

export type BoardMovementNode = BaseMovementNode & {
  stepsRequired?: number;
  gridPosition?: BoardGridCoordinate;
};

export const BOARD_MOVEMENT_NODE_PICK_RADIUS = {
  squarePercent: 2.3,
  spawnPercent: 2.8,
  roomWidthPercent: 10.8,
  roomHeightPercent: 9.4,
};

const BOARD_MOVEMENT_POSITION_TOLERANCE = 0.75;

const BOARD_ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER = [
  'sala-superior-izquierda',
  'sala-superior-centro',
  'sala-superior-derecha',
  'sala-media-izquierda',
  'sala-media-izquierda-inferior',
  'sala-media-derecha',
  'sala-inferior-izquierda',
  'sala-inferior-centro',
  'sala-inferior-derecha',
] as const;

const BOARD_ROOM_SPACE_SLOT_INDEX_BY_NODE_ID = Object.fromEntries(
  BOARD_ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER.map((roomNodeId, index) => [roomNodeId, index])
) as Record<(typeof BOARD_ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER)[number], number>;

type BoardGridPoint = {
  col: number;
  row: number;
  offsetX?: number;
  offsetY?: number;
};

type BaseMovementNodeDefinition = Omit<BaseMovementNode, 'positionX' | 'positionY'> & {
  gridPoint: BoardGridPoint;
};

type ExplicitIntermediateSquare = {
  positionX: number;
  positionY: number;
};

type BoardGridSegment = readonly [startCol: number, endCol: number];

type RoomGridFootprintDefinition = Record<string, readonly BoardGridPoint[]>;

export const BOARD_GRID_COLUMNS_PERCENT = [
  15.03, 18.38, 21.72, 25.01, 28.28, 31.6, 34.98, 38.36, 41.65, 44.93, 48.27, 51.58,
  55.16, 58.35, 61.67, 64.99, 68.37, 71.65, 74.93, 78.23, 81.56, 84.9, 88.28,
] as const;

export const BOARD_GRID_ROWS_PERCENT = [
  9.93, 13.2, 16.54, 19.91, 23.17, 26.47, 29.7, 33.14, 36.5, 39.82, 43.07, 46.34, 49.7,
  53.02, 56.37, 59.59, 62.93, 66.38, 69.62, 72.99, 76.31, 79.65, 82.98, 86.25, 89.58, 92.9,
] as const;

const BASE_MOVEMENT_NODE_DEFINITIONS: Record<string, BaseMovementNodeDefinition> = {
  'spawn-rojo': { id: 'spawn-rojo', label: 'Salida roja', kind: 'spawn', gridPoint: grid(15, 0, -0.02, 0.1) },
  'pasillo-superior-derecho': {
    id: 'pasillo-superior-derecho',
    label: 'Cruce superior derecho',
    kind: 'square',
    gridPoint: grid(15, 4),
  },
  'pasillo-superior-central': {
    id: 'pasillo-superior-central',
    label: 'Cruce superior central',
    kind: 'square',
    gridPoint: grid(10, 4),
  },
  'centro-norte': {
    id: 'centro-norte',
    label: 'Corredor norte del centro',
    kind: 'square',
    gridPoint: grid(10, 7),
  },
  'spawn-morado': { id: 'spawn-morado', label: 'Salida morada', kind: 'spawn', gridPoint: grid(0, 5, -5, -0.66) },
  'pasillo-izquierdo-superior': {
    id: 'pasillo-izquierdo-superior',
    label: 'Cruce izquierdo superior',
    kind: 'square',
    gridPoint: grid(0, 5),
  },
  'sala-superior-izquierda': {
    id: 'sala-superior-izquierda',
    label: 'Sala superior izquierda',
    kind: 'room',
    gridPoint: grid(2, 2, -0.06, -1.37),
  },
  'sala-superior-centro': {
    id: 'sala-superior-centro',
    label: 'Sala superior central',
    kind: 'room',
    gridPoint: grid(11, 3, -1.38, -1.19),
  },
  'sala-superior-derecha': {
    id: 'sala-superior-derecha',
    label: 'Sala superior derecha',
    kind: 'room',
    gridPoint: grid(19, 2, 0.37, 1.18),
  },
  'pasillo-izquierdo-central': {
    id: 'pasillo-izquierdo-central',
    label: 'Cruce izquierdo central',
    kind: 'square',
    gridPoint: grid(0, 12),
  },
  'centro-oeste': {
    id: 'centro-oeste',
    label: 'Corredor oeste del centro',
    kind: 'square',
    gridPoint: grid(7, 12),
  },
  'centro-este': {
    id: 'centro-este',
    label: 'Corredor este del centro',
    kind: 'square',
    gridPoint: grid(13, 12),
  },
  'sala-media-izquierda': {
    id: 'sala-media-izquierda',
    label: 'Sala media izquierda',
    kind: 'room',
    gridPoint: grid(2, 8, -0.12, 0.5),
  },
  'sala-media-izquierda-inferior': {
    id: 'sala-media-izquierda-inferior',
    label: 'Sala izquierda inferior',
    kind: 'room',
    gridPoint: grid(2, 14, -1.46, 0.23),
  },
  'sala-media-derecha': {
    id: 'sala-media-derecha',
    label: 'Sala media derecha',
    kind: 'room',
    gridPoint: grid(19, 12, -1.63, -1.02),
  },
  'spawn-azul': { id: 'spawn-azul', label: 'Salida azul', kind: 'spawn', gridPoint: grid(0, 18, -5, 0.43) },
  'pasillo-izquierdo-inferior': {
    id: 'pasillo-izquierdo-inferior',
    label: 'Cruce izquierdo inferior',
    kind: 'square',
    gridPoint: grid(0, 18),
  },
  'pasillo-inferior-izquierdo': {
    id: 'pasillo-inferior-izquierdo',
    label: 'Cruce inferior izquierdo',
    kind: 'square',
    gridPoint: grid(8, 23),
  },
  'centro-sur': {
    id: 'centro-sur',
    label: 'Corredor sur del centro',
    kind: 'square',
    gridPoint: grid(10, 17),
  },
  'sala-inferior-izquierda': {
    id: 'sala-inferior-izquierda',
    label: 'Sala inferior izquierda',
    kind: 'room',
    gridPoint: grid(1, 21, 1.45, 1.35),
  },
  'spawn-verde': { id: 'spawn-verde', label: 'Salida verde', kind: 'spawn', gridPoint: grid(8, 24, 0.41, -0.97) },
  'pasillo-inferior-central': {
    id: 'pasillo-inferior-central',
    label: 'Cruce inferior central',
    kind: 'square',
    gridPoint: grid(10, 23),
  },
  'sala-inferior-centro': {
    id: 'sala-inferior-centro',
    label: 'Sala inferior central',
    kind: 'room',
    gridPoint: grid(11, 20, -1.38, 0.79),
  },
  'pasillo-inferior-derecho': {
    id: 'pasillo-inferior-derecho',
    label: 'Cruce inferior derecho',
    kind: 'square',
    gridPoint: grid(13, 23),
  },
  'spawn-blanco': { id: 'spawn-blanco', label: 'Salida blanca', kind: 'spawn', gridPoint: grid(13, 24, -0.41, -0.97) },
  'sala-inferior-derecha': {
    id: 'sala-inferior-derecha',
    label: 'Sala inferior derecha',
    kind: 'room',
    gridPoint: grid(19, 21, 1.57, -1.05),
  },
  'pasillo-derecho-central': {
    id: 'pasillo-derecho-central',
    label: 'Cruce derecho central',
    kind: 'square',
    gridPoint: grid(20, 12),
  },
  'pasillo-derecho-superior': {
    id: 'pasillo-derecho-superior',
    label: 'Cruce derecho superior',
    kind: 'square',
    gridPoint: grid(20, 6),
  },
  'spawn-amarillo': { id: 'spawn-amarillo', label: 'Salida amarilla', kind: 'spawn', gridPoint: grid(22, 7, -0.26, -0.2) },
};

const BASE_MOVEMENT_NODES: Record<string, BaseMovementNode> = Object.fromEntries(
  Object.values(BASE_MOVEMENT_NODE_DEFINITIONS).map((nodeDefinition) => {
    const { gridPoint, ...node } = nodeDefinition;
    return [
      node.id,
      {
        ...node,
        ...materializeGridPoint(gridPoint),
        gridPosition: {
          col: gridPoint.col,
          row: gridPoint.row,
        },
      },
    ];
  })
);

const EXPLICIT_EDGE_GRID_POINTS: Record<string, readonly BoardGridPoint[]> = {
  'spawn-rojo->pasillo-superior-derecho': [grid(15, 1), grid(15, 2), grid(15, 3)],
  'pasillo-superior-derecho->pasillo-superior-central': [grid(14, 4), grid(13, 4), grid(12, 4)],
  'pasillo-superior-derecho->pasillo-derecho-superior': [
    grid(15, 5),
    grid(15, 6),
    grid(16, 6),
    grid(17, 6),
    grid(18, 6),
    grid(19, 6),
    grid(20, 6, -1.66, 0),
  ],
  'pasillo-superior-central->pasillo-izquierdo-superior': [
    grid(9, 4),
    grid(8, 4),
    grid(7, 4),
    grid(6, 4),
    grid(5, 4),
    grid(4, 4),
    grid(3, 4),
    grid(2, 4),
    grid(1, 4),
    grid(0, 4),
  ],
  'pasillo-superior-central->centro-norte': [grid(10, 5), grid(10, 6), grid(10, 7, 0, -1.64)],
  'pasillo-izquierdo-superior->pasillo-izquierdo-central': [grid(0, 7), grid(0, 8), grid(0, 9), grid(0, 10)],
  'pasillo-izquierdo-central->pasillo-izquierdo-inferior': [grid(0, 13), grid(0, 14), grid(0, 15), grid(0, 16), grid(0, 17)],
  'pasillo-izquierdo-central->centro-oeste': [grid(1, 12), grid(2, 12), grid(3, 12), grid(4, 12), grid(5, 12)],
  'centro-norte->centro-oeste': [
    grid(9, 8),
    grid(8, 9),
    grid(7, 10),
    grid(7, 11),
    grid(7, 12, 0, -1.7),
  ],
  'centro-norte->centro-este': [
    grid(11, 8),
    grid(12, 9),
    grid(13, 10),
    grid(13, 11),
  ],
  'spawn-azul->pasillo-izquierdo-inferior': [],
  'pasillo-izquierdo-inferior->pasillo-inferior-izquierdo': [
    grid(1, 18),
    grid(2, 18),
    grid(3, 18),
    grid(4, 18),
    grid(4, 19),
    grid(5, 19),
    grid(5, 20),
    grid(6, 20),
    grid(6, 21),
    grid(7, 21),
    grid(7, 22),
    grid(8, 22, -1.65, 0),
  ],
  'pasillo-inferior-izquierdo->pasillo-inferior-central': [grid(9, 23)],
  'pasillo-inferior-izquierdo->centro-sur': [grid(8, 22), grid(8, 21), grid(8, 20), grid(9, 19), grid(9, 18), grid(10, 18)],
  'centro-oeste->centro-sur': [grid(7, 13), grid(7, 14), grid(7, 15), grid(7, 16), grid(8, 16), grid(9, 16), grid(9, 17)],
  'centro-este->centro-sur': [grid(13, 13), grid(13, 14), grid(13, 15), grid(13, 16), grid(12, 16), grid(11, 16), grid(11, 17)],
  'pasillo-inferior-central->pasillo-inferior-derecho': [grid(11, 23)],
  'pasillo-inferior-central->centro-sur': [grid(10, 22), grid(10, 21), grid(10, 20), grid(10, 19)],
  'pasillo-inferior-derecho->pasillo-derecho-central': [
    grid(13, 22),
    grid(13, 21),
    grid(13, 20),
    grid(14, 20),
    grid(14, 19),
    grid(15, 19),
    grid(15, 18),
    grid(16, 18),
    grid(16, 17),
    grid(17, 17),
    grid(17, 16),
    grid(18, 16),
    grid(19, 16),
    grid(19, 15),
    grid(20, 15),
    grid(20, 14),
    grid(20, 13),
  ],
  'pasillo-derecho-central->pasillo-derecho-superior': [grid(20, 11), grid(20, 10), grid(20, 9)],
  'centro-este->pasillo-derecho-central': [grid(14, 12), grid(15, 12), grid(16, 12), grid(17, 12), grid(18, 12), grid(19, 12)],
  'spawn-amarillo->pasillo-derecho-superior': [grid(22, 6), grid(21, 6)],
};

const BASE_MOVEMENT_CONNECTIONS: Record<string, readonly string[]> = {
  'spawn-rojo': ['pasillo-superior-derecho'],
  'pasillo-superior-derecho': ['spawn-rojo', 'pasillo-superior-central', 'pasillo-derecho-superior'],
  'pasillo-superior-central': ['pasillo-superior-derecho', 'pasillo-izquierdo-superior', 'centro-norte'],
  'centro-norte': ['pasillo-superior-central', 'centro-oeste', 'centro-este'],
  'spawn-morado': ['pasillo-izquierdo-superior'],
  'pasillo-izquierdo-superior': ['spawn-morado', 'pasillo-superior-central', 'pasillo-izquierdo-central'],
  'pasillo-izquierdo-central': ['pasillo-izquierdo-superior', 'pasillo-izquierdo-inferior', 'centro-oeste'],
  'centro-oeste': ['centro-norte', 'centro-sur', 'pasillo-izquierdo-central'],
  'centro-este': ['centro-norte', 'centro-sur', 'pasillo-derecho-central'],
  'spawn-azul': ['pasillo-izquierdo-inferior'],
  'pasillo-izquierdo-inferior': ['spawn-azul', 'pasillo-izquierdo-central', 'pasillo-inferior-izquierdo'],
  'pasillo-inferior-izquierdo': ['pasillo-izquierdo-inferior', 'spawn-verde', 'pasillo-inferior-central', 'centro-sur'],
  'centro-sur': ['centro-oeste', 'centro-este', 'pasillo-inferior-izquierdo', 'pasillo-inferior-central', 'pasillo-inferior-derecho'],
  'spawn-verde': ['pasillo-inferior-izquierdo'],
  'pasillo-inferior-central': ['pasillo-inferior-izquierdo', 'pasillo-inferior-derecho', 'centro-sur'],
  'pasillo-inferior-derecho': ['pasillo-inferior-central', 'spawn-blanco', 'pasillo-derecho-central', 'centro-sur'],
  'spawn-blanco': ['pasillo-inferior-derecho'],
  'pasillo-derecho-central': ['pasillo-inferior-derecho', 'pasillo-derecho-superior', 'centro-este'],
  'pasillo-derecho-superior': ['spawn-amarillo', 'pasillo-derecho-central', 'pasillo-superior-derecho'],
  'spawn-amarillo': ['pasillo-derecho-superior'],
};

const ROOM_ENTRY_DOOR_GRID_COORDINATES: Record<string, readonly BoardGridCoordinate[]> = {
  'sala-superior-izquierda': [{ col: 5, row: 3 }],
  'sala-superior-centro': [{ col: 10, row: 6 }, { col: 11, row: 6 }],
  'sala-superior-derecha': [{ col: 16, row: 5 }],
  'sala-media-izquierda': [{ col: 5, row: 8 }, { col: 2, row: 10 }],
  'sala-media-izquierda-inferior': [{ col: 0, row: 12 }, { col: 4, row: 15 }],
  'sala-media-derecha': [{ col: 16, row: 9 }, { col: 15, row: 12 }],
  'sala-inferior-izquierda': [{ col: 3, row: 19 }],
  'sala-inferior-centro': [{ col: 8, row: 17 }, { col: 13, row: 17 }, { col: 14, row: 19 }, { col: 7, row: 19 }],
  'sala-inferior-derecha': [{ col: 18, row: 18 }],
} as const;

const ROOM_SECRET_PASSAGE_DESTINATIONS: Record<string, string> = {
  'sala-superior-izquierda': 'sala-inferior-derecha',
  'sala-inferior-derecha': 'sala-superior-izquierda',
  'sala-superior-derecha': 'sala-inferior-izquierda',
  'sala-inferior-izquierda': 'sala-superior-derecha',
} as const;

const ROOM_NODE_ID_BY_DOOR_GRID_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(ROOM_ENTRY_DOOR_GRID_COORDINATES).flatMap(([roomNodeId, coordinates]) =>
    coordinates.map((coordinate) => [buildGridCellKey(coordinate), roomNodeId])
  )
) as Record<string, string>;

const ROOM_GRID_FOOTPRINTS: RoomGridFootprintDefinition = {
  'sala-superior-izquierda': [
    ...rowRangePoints(0, [[0, 4]]),
    ...rowRangePoints(1, [[0, 4]]),
    ...rowRangePoints(2, [[0, 4]]),
    ...rowRangePoints(3, [[0, 4]]),
  ],
  'sala-superior-centro': [
    ...rowRangePoints(0, [[9, 13]]),
    ...rowRangePoints(1, [[9, 13]]),
    ...rowRangePoints(2, [[9, 13]]),
    ...rowRangePoints(3, [[9, 13]]),
  ],
  'sala-superior-derecha': [
    ...rowRangePoints(0, [[17, 21]]),
    ...rowRangePoints(1, [[17, 21]]),
    ...rowRangePoints(2, [[17, 21]]),
    ...rowRangePoints(3, [[17, 21]]),
    ...rowRangePoints(4, [[17, 21]]),
  ],
  'sala-media-izquierda': [
    ...excludeGridPoints(
      [
        ...rowRangePoints(7, [[1, 4]]),
        ...rowRangePoints(8, [[1, 4]]),
        ...rowRangePoints(9, [[1, 4]]),
        ...rowRangePoints(10, [[1, 4]]),
      ],
      [grid(2, 10)]
    ),
  ],
  'sala-media-izquierda-inferior': [
    ...excludeGridPoints(
      [
        ...rowRangePoints(13, [[1, 4]]),
        ...rowRangePoints(14, [[1, 4]]),
        ...rowRangePoints(15, [[1, 4]]),
        ...rowRangePoints(16, [[1, 4]]),
      ],
      [grid(4, 15)]
    ),
  ],
  'sala-media-derecha': [
    ...excludeGridPoints(
      [
        ...rowRangePoints(9, [[16, 19]]),
        ...rowRangePoints(10, [[16, 19]]),
        ...rowRangePoints(11, [[16, 19]]),
        ...rowRangePoints(13, [[16, 19]]),
        ...rowRangePoints(14, [[16, 19]]),
      ],
      [grid(16, 9)]
    ),
  ],
  'sala-inferior-izquierda': [
    ...excludeGridPoints(
      [
        ...rowRangePoints(19, [[0, 4]]),
        ...rowRangePoints(20, [[0, 4]]),
        ...rowRangePoints(21, [[0, 4]]),
        ...rowRangePoints(22, [[0, 4]]),
        ...rowRangePoints(23, [[0, 4]]),
        ...rowRangePoints(24, [[0, 4]]),
      ],
      [grid(3, 19), grid(4, 19), grid(3, 20)]
    ),
  ],
  'sala-inferior-centro': [
    ...rowRangePoints(18, [[8, 9], [11, 13]]),
    ...rowRangePoints(19, [[8, 9], [11, 13]]),
    ...rowRangePoints(20, [[8, 9], [11, 13]]),
    ...rowRangePoints(21, [[8, 9], [11, 13]]),
    ...rowRangePoints(22, [[8, 9], [11, 13]]),
  ],
  'sala-inferior-derecha': [
    ...rowRangePoints(19, [[18, 21]]),
    ...rowRangePoints(20, [[18, 21]]),
    ...rowRangePoints(21, [[18, 21]]),
    ...rowRangePoints(22, [[18, 21]]),
    ...rowRangePoints(23, [[18, 21]]),
    ...rowRangePoints(24, [[18, 21]]),
  ],
} as const;

const ROOM_FOOTPRINT_GRID_KEYS = new Set(
  Object.values(ROOM_GRID_FOOTPRINTS)
    .flat()
    .map((gridPoint) => buildGridCellKey(gridPoint))
);

const EXCLUDED_SQUARE_GRID_POINTS = [
  ...columnRangePoints(0, [[7, 10], [13, 16]]),
  ...rowRangePoints(12, [[1, 4]]),
  ...columnRangePoints(7, [[17, 17], [20, 22]]),
  ...columnRangePoints(8, [[2, 3], [5, 6], [8, 14], [20, 22]]),
  ...columnRangePoints(9, [[4, 4], [8, 8], [17, 19], [23, 23]]),
  ...columnRangePoints(10, [[4, 5], [17, 23]]),
  ...columnRangePoints(11, [[8, 8], [17, 17], [23, 23]]),
  ...columnRangePoints(12, [[4, 4], [6, 6], [9, 9]]),
  ...columnRangePoints(13, [[4, 4], [6, 6], [20, 22]]),
  ...columnRangePoints(14, [[20, 20]]),
  ...columnRangePoints(15, [[9, 11], [13, 14]]),
  ...columnRangePoints(16, [[1, 4]]),
  ...columnRangePoints(17, [[19, 21]]),
  ...columnRangePoints(18, [[15, 15]]),
  ...columnRangePoints(19, [[14, 14]]),
  grid(3, 20),
] as const;

const EXCLUDED_SQUARE_GRID_KEYS = new Set(
  EXCLUDED_SQUARE_GRID_POINTS.map((gridPoint) => buildGridCellKey(gridPoint))
);

const IMAGE_ALIGNED_EXTRA_GRID_POINTS = [
  ...rowRangePoints(0, [[6, 6]]),
  ...rowRangePoints(1, [[6, 7], [14, 14]]),
  ...rowRangePoints(2, [[6, 8], [14, 14]]),
  ...rowRangePoints(3, [[5, 8], [14, 14]]),
  ...rowRangePoints(4, [[1, 8], [15, 16]]),
  ...rowRangePoints(5, [[1, 8], [14, 16]]),
  ...rowRangePoints(6, [[5, 8], [11, 14], [15, 21]]),
  ...rowRangePoints(7, [[6, 13], [14, 22]]),
  ...rowRangePoints(8, [[5, 8], [13, 21]]),
  ...rowRangePoints(9, [[6, 8], [13, 16]]),
  ...rowRangePoints(10, [[2, 2], [5, 8], [14, 15]]),
  ...rowRangePoints(11, [[0, 8], [14, 15]]),
  ...rowRangePoints(12, [[6, 8], [14, 15]]),
  ...rowRangePoints(13, [[5, 8], [14, 15]]),
  ...rowRangePoints(14, [[5, 8], [14, 15]]),
  ...rowRangePoints(15, [[4, 12], [14, 17]]),
  ...rowRangePoints(16, [[5, 21]]),
  ...rowRangePoints(17, [[1, 8], [13, 13], [15, 22]]),
  ...rowRangePoints(18, [[1, 6], [15, 16], [18, 18]]),
  ...rowRangePoints(19, [[3, 3], [6, 7], [14, 17]]),
  ...rowRangePoints(20, [[3, 7], [15, 17]]),
  ...rowRangePoints(21, [[5, 7], [15, 17]]),
  ...rowRangePoints(22, [[5, 7], [15, 16]]),
  ...rowRangePoints(23, [[6, 8], [13, 15]]),
] as const;

const EXPANDED_MOVEMENT_GRAPH = buildExpandedMovementGraph();

const BOARD_MOVEMENT_NODES = EXPANDED_MOVEMENT_GRAPH.nodes;
const BOARD_MOVEMENT_CONNECTIONS = EXPANDED_MOVEMENT_GRAPH.connections;
export const BOARD_MOVEMENT_NODE_LIST = Object.values(BOARD_MOVEMENT_NODES).sort((left, right) => {
  const kindDelta = getTerminalRenderPriority(left.kind) - getTerminalRenderPriority(right.kind);
  if (kindDelta !== 0) {
    return kindDelta;
  }

  return left.label.localeCompare(right.label, 'es');
});

function findRoomNodeIdByDoorNodeId(nodeId: string) {
  const node = BOARD_MOVEMENT_NODES[nodeId];
  if (!node || node.kind !== 'square' || !node.gridPosition) {
    return null;
  }

  return ROOM_NODE_ID_BY_DOOR_GRID_KEY[buildGridCellKey(node.gridPosition)] ?? null;
}

export function getRoomEntryNodeByDoorNodeId(nodeId: string) {
  const roomNodeId = findRoomNodeIdByDoorNodeId(nodeId);
  return roomNodeId ? BOARD_MOVEMENT_NODES[roomNodeId] ?? null : null;
}

export function getSecretPassageDestinationNodeByRoomNodeId(nodeId: string) {
  const node = BOARD_MOVEMENT_NODES[nodeId];
  if (!node || node.kind !== 'room') {
    return null;
  }

  const destinationRoomNodeId = ROOM_SECRET_PASSAGE_DESTINATIONS[node.id];
  return destinationRoomNodeId ? BOARD_MOVEMENT_NODES[destinationRoomNodeId] ?? null : null;
}

export function getBoardRoomSpaceSlotIndex(nodeId: string) {
  return BOARD_ROOM_SPACE_SLOT_INDEX_BY_NODE_ID[nodeId as keyof typeof BOARD_ROOM_SPACE_SLOT_INDEX_BY_NODE_ID] ?? null;
}

export function findNearestBoardMovementNode(
  positionX: number,
  positionY: number,
  candidateNodeIds?: Iterable<string>
) {
  const allowedNodeIds = candidateNodeIds ? new Set(candidateNodeIds) : null;
  let matchedNode: BoardMovementNode | null = null;
  let matchedDistance = Number.POSITIVE_INFINITY;

  BOARD_MOVEMENT_NODE_LIST.forEach((node) => {
    if (allowedNodeIds && !allowedNodeIds.has(node.id)) {
      return;
    }

    const normalizedDistance = getNormalizedNodePickDistance(node, positionX, positionY);
    if (normalizedDistance === null || normalizedDistance >= matchedDistance) {
      return;
    }

    matchedNode = node;
    matchedDistance = normalizedDistance;
  });

  if (matchedNode) {
    return matchedNode;
  }

  return null;
}

function buildExpandedMovementGraph() {
  const nodes: Record<string, BoardMovementNode> = Object.fromEntries(
    Object.values(BASE_MOVEMENT_NODES).map((node) => [node.id, { ...node }])
  );
  const connections: Record<string, string[]> = Object.fromEntries(
    Object.keys(nodes).map((nodeId) => [nodeId, []])
  );
  const squareGridPointsByNodeId: Record<string, BoardGridPoint> = Object.fromEntries(
    Object.values(BASE_MOVEMENT_NODE_DEFINITIONS).reduce<[string, BoardGridPoint][]>((acc, nodeDefinition) => {
      if (nodeDefinition.kind === 'square') acc.push([nodeDefinition.id, nodeDefinition.gridPoint]);
      return acc;
    }, [])
  );
  const processedEdges = new Set<string>();

  Object.entries(BASE_MOVEMENT_CONNECTIONS).forEach(([fromNodeId, linkedNodeIds]) => {
    linkedNodeIds.forEach((toNodeId) => {
      const edgeKey = buildEdgeKey(fromNodeId, toNodeId);
      if (processedEdges.has(edgeKey)) {
        return;
      }

      processedEdges.add(edgeKey);
      const fromNode = BASE_MOVEMENT_NODES[fromNodeId];
      const toNode = BASE_MOVEMENT_NODES[toNodeId];

      if (!fromNode || !toNode) {
        return;
      }

      const forwardSegmentKey = `${fromNodeId}->${toNodeId}`;
      const reverseSegmentKey = `${toNodeId}->${fromNodeId}`;
      const forwardSquares = EXPLICIT_EDGE_GRID_POINTS[forwardSegmentKey];
      const reverseSquares = EXPLICIT_EDGE_GRID_POINTS[reverseSegmentKey];
      const explicitSquares = forwardSquares ?? (reverseSquares ? [...reverseSquares].reverse() : []);
      if (explicitSquares.length === 0) {
        connectMovementNodes(connections, fromNodeId, toNodeId);
        return;
      }

      let previousNodeId = fromNodeId;

      explicitSquares.forEach((square, squareIndex) => {
        const stepIndex = squareIndex + 1;
        const squareNodeId = buildSquareNodeId(fromNodeId, toNodeId, stepIndex);
        const squarePosition = materializeGridPoint(square);

        nodes[squareNodeId] = {
          id: squareNodeId,
          kind: 'square',
          label: `Casilla ${stepIndex} entre ${fromNode.label} y ${toNode.label}`,
          positionX: squarePosition.positionX,
          positionY: squarePosition.positionY,
          gridPosition: {
            col: square.col,
            row: square.row,
          },
        };
        squareGridPointsByNodeId[squareNodeId] = square;

        connections[squareNodeId] = connections[squareNodeId] ?? [];
        connectMovementNodes(connections, previousNodeId, squareNodeId);
        previousNodeId = squareNodeId;
      });

      connectMovementNodes(connections, previousNodeId, toNodeId);
    });
  });

  addImageAlignedExtraSquares(nodes, connections, squareGridPointsByNodeId);
  const preferredSquareNodeIdByGridKey = buildPreferredSquareNodeIdByGridKey(squareGridPointsByNodeId);
  connectOrthogonalGridSquares(connections, preferredSquareNodeIdByGridKey);
  const roomDoorConnections = materializeRoomDoorConnections(preferredSquareNodeIdByGridKey);
  connectRoomDoorSquares(nodes, connections, roomDoorConnections);
  connectRoomSecretPassages(nodes, connections);
  pruneExcludedSquareNodes(nodes, connections);

  validateRoomDoorTopology(nodes, connections, roomDoorConnections);
  validateRoomSecretPassageTopology(nodes, connections);

  return {
    nodes,
    connections: Object.fromEntries(
      Object.entries(connections).map(([nodeId, linkedNodeIds]) => [nodeId, [...new Set(linkedNodeIds)]])
    ) as Record<string, readonly string[]>,
  };
}

function connectMovementNodes(connections: Record<string, string[]>, leftNodeId: string, rightNodeId: string) {
  connections[leftNodeId] = connections[leftNodeId] ?? [];
  connections[rightNodeId] = connections[rightNodeId] ?? [];

  connections[leftNodeId].push(rightNodeId);
  connections[rightNodeId].push(leftNodeId);
}

function addImageAlignedExtraSquares(
  nodes: Record<string, BoardMovementNode>,
  connections: Record<string, string[]>,
  squareGridPointsByNodeId: Record<string, BoardGridPoint>
) {
  const baseNodeGridKeys = new Set(
    Object.values(BASE_MOVEMENT_NODE_DEFINITIONS).map((def) => buildGridCellKey(def.gridPoint))
  );
  const occupiedGridKeys = new Set([
    ...Object.values(squareGridPointsByNodeId).map((gridPoint) => buildGridCellKey(gridPoint)),
    ...baseNodeGridKeys,
  ]);

  IMAGE_ALIGNED_EXTRA_GRID_POINTS.forEach((gridPoint) => {
    const gridCellKey = buildGridCellKey(gridPoint);
    if (occupiedGridKeys.has(gridCellKey) || ROOM_FOOTPRINT_GRID_KEYS.has(gridCellKey)) {
      return;
    }

    const nodeId = buildGridSquareNodeId(gridPoint.col, gridPoint.row);
    const squarePosition = materializeGridPoint(gridPoint);

    nodes[nodeId] = {
      id: nodeId,
      kind: 'square',
      label: `Casilla ${gridPoint.col},${gridPoint.row}`,
      positionX: squarePosition.positionX,
      positionY: squarePosition.positionY,
      gridPosition: {
        col: gridPoint.col,
        row: gridPoint.row,
      },
    };
    connections[nodeId] = connections[nodeId] ?? [];
    squareGridPointsByNodeId[nodeId] = gridPoint;
    occupiedGridKeys.add(gridCellKey);
  });
}

function connectOrthogonalGridSquares(
  connections: Record<string, string[]>,
  squareNodeIdByGridKey: Record<string, string>
) {
  Object.entries(squareNodeIdByGridKey).forEach(([gridKey, nodeId]) => {
    const { col, row } = parseGridCellKey(gridKey);
    const safeCol = Number.isInteger(col) ? col : 0;
    const safeRow = Number.isInteger(row) ? row : 0;
    const orthogonalNeighbors = [
      buildGridCellKey(grid(safeCol - 1, safeRow)),
      buildGridCellKey(grid(safeCol + 1, safeRow)),
      buildGridCellKey(grid(safeCol, safeRow - 1)),
      buildGridCellKey(grid(safeCol, safeRow + 1)),
    ];

    orthogonalNeighbors.forEach((neighborGridKey) => {
      const neighborNodeId = squareNodeIdByGridKey[neighborGridKey];
      if (!neighborNodeId) {
        return;
      }

      connectMovementNodes(connections, nodeId, neighborNodeId);
    });
  });
}

function buildPreferredSquareNodeIdByGridKey(squareGridPointsByNodeId: Record<string, BoardGridPoint>) {
  return Object.entries(squareGridPointsByNodeId).reduce<Record<string, string>>((accumulator, [nodeId, gridPoint]) => {
    const gridKey = buildGridCellKey(gridPoint);
    const currentNodeId = accumulator[gridKey];
    if (!currentNodeId || getGridConnectionPriority(nodeId) < getGridConnectionPriority(currentNodeId)) {
      accumulator[gridKey] = nodeId;
    }

    return accumulator;
  }, {});
}

function materializeRoomDoorConnections(squareNodeIdByGridKey: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(ROOM_ENTRY_DOOR_GRID_COORDINATES).map(([roomNodeId, coordinates]) => [
      roomNodeId,
      coordinates
        .map((coordinate) => squareNodeIdByGridKey[buildGridCellKey(coordinate)])
        .filter((nodeId): nodeId is string => Boolean(nodeId)),
    ])
  ) as Record<string, readonly string[]>;
}

function connectRoomDoorSquares(
  nodes: Record<string, BoardMovementNode>,
  connections: Record<string, string[]>,
  roomDoorConnections: Record<string, readonly string[]>
) {
  Object.entries(roomDoorConnections).forEach(([roomNodeId, doorNodeIds]) => {
    doorNodeIds.forEach((doorNodeId) => {
      if (!nodes[roomNodeId] || !nodes[doorNodeId]) {
        return;
      }

      connectMovementNodes(connections, roomNodeId, doorNodeId);
    });
  });
}

function connectRoomSecretPassages(
  nodes: Record<string, BoardMovementNode>,
  connections: Record<string, string[]>
) {
  Object.entries(ROOM_SECRET_PASSAGE_DESTINATIONS).forEach(([fromRoomNodeId, toRoomNodeId]) => {
    const fromRoomNode = nodes[fromRoomNodeId];
    const toRoomNode = nodes[toRoomNodeId];

    if (!fromRoomNode || !toRoomNode || fromRoomNode.kind !== 'room' || toRoomNode.kind !== 'room') {
      return;
    }

    connectMovementNodes(connections, fromRoomNodeId, toRoomNodeId);
  });
}

function pruneExcludedSquareNodes(
  nodes: Record<string, BoardMovementNode>,
  connections: Record<string, string[]>
) {
  const removedNodeIds = new Set(
    Object.entries(nodes).reduce<string[]>((acc, [nodeId, node]) => {
      if (node.kind === 'square' && node.gridPosition && EXCLUDED_SQUARE_GRID_KEYS.has(buildGridCellKey(node.gridPosition))) {
        acc.push(nodeId);
      }
      return acc;
    }, [])
  );

  if (removedNodeIds.size === 0) {
    return;
  }

  removedNodeIds.forEach((nodeId) => {
    delete nodes[nodeId];
    delete connections[nodeId];
  });

  Object.values(connections).forEach((linkedNodeIds) => {
    for (let index = linkedNodeIds.length - 1; index >= 0; index -= 1) {
      const linkedNodeId = linkedNodeIds[index];
      if (linkedNodeId && removedNodeIds.has(linkedNodeId)) {
        linkedNodeIds.splice(index, 1);
      }
    }
  });
}

function grid(col: number, row: number, offsetX = 0, offsetY = 0): BoardGridPoint {
  return { col, row, offsetX, offsetY };
}

function rowRangePoints(row: number, segments: readonly BoardGridSegment[]) {
  return segments.flatMap(([startCol, endCol]) =>
    Array.from({ length: endCol - startCol + 1 }, (_value, offset) => grid(startCol + offset, row))
  );
}

function columnRangePoints(col: number, segments: readonly BoardGridSegment[]) {
  return segments.flatMap(([startRow, endRow]) =>
    Array.from({ length: endRow - startRow + 1 }, (_value, offset) => grid(col, startRow + offset))
  );
}

function excludeGridPoints(gridPoints: readonly BoardGridPoint[], excludedPoints: readonly BoardGridPoint[]) {
  const excludedGridKeys = new Set(excludedPoints.map((gridPoint) => buildGridCellKey(gridPoint)));
  return gridPoints.filter((gridPoint) => !excludedGridKeys.has(buildGridCellKey(gridPoint)));
}

function materializeGridPoint({ col, row, offsetX = 0, offsetY = 0 }: BoardGridPoint): ExplicitIntermediateSquare {
  const positionX = BOARD_GRID_COLUMNS_PERCENT[col];
  const positionY = BOARD_GRID_ROWS_PERCENT[row];

  if (typeof positionX !== 'number' || typeof positionY !== 'number') {
    throw new Error(`Punto de rejilla inválido: col=${col}, row=${row}.`);
  }

  return {
    positionX: roundToTwoDecimals(positionX + offsetX),
    positionY: roundToTwoDecimals(positionY + offsetY),
  };
}

function buildEdgeKey(leftNodeId: string, rightNodeId: string) {
  return [leftNodeId, rightNodeId].sort().join('::');
}

function buildSquareNodeId(leftNodeId: string, rightNodeId: string, stepIndex: number) {
  return `square:${buildEdgeKey(leftNodeId, rightNodeId)}:${stepIndex}`;
}

function buildGridSquareNodeId(col: number, row: number) {
  return `square:grid:${col}:${row}`;
}

function buildGridCellKey({ col, row }: Pick<BoardGridPoint, 'col' | 'row'>) {
  return `${col}:${row}`;
}

function parseGridCellKey(gridCellKey: string) {
  const [rawCol = '0', rawRow = '0'] = gridCellKey.split(':');
  const col = Number.parseInt(rawCol, 10);
  const row = Number.parseInt(rawRow, 10);
  return { col, row };
}

function getGridConnectionPriority(nodeId: string) {
  if (!nodeId.startsWith('square:')) {
    return 0;
  }

  if (nodeId.startsWith('square:grid:')) {
    return 1;
  }

  return 2;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}


function getNormalizedNodePickDistance(node: BoardMovementNode, positionX: number, positionY: number) {
  const offsetX = Math.abs(positionX - node.positionX);
  const offsetY = Math.abs(positionY - node.positionY);

  if (node.kind === 'room') {
    return getNormalizedRoomPickDistance(node.id, positionX, positionY);
  }

  const radius = node.kind === 'spawn'
    ? BOARD_MOVEMENT_NODE_PICK_RADIUS.spawnPercent
    : BOARD_MOVEMENT_NODE_PICK_RADIUS.squarePercent;
  const normalizedDistance = Math.hypot(offsetX, offsetY) / radius;

  return normalizedDistance <= 1 ? normalizedDistance : null;
}

function getTerminalRenderPriority(kind: BoardMovementNodeKind) {
  if (kind === 'room') {
    return 0;
  }

  if (kind === 'spawn') {
    return 1;
  }

  return 2;
}

function getNormalizedRoomPickDistance(roomNodeId: string, positionX: number, positionY: number) {
  const footprint = ROOM_GRID_FOOTPRINTS[roomNodeId];
  if (!footprint || footprint.length === 0) {
    const roomNode = BASE_MOVEMENT_NODES[roomNodeId];
    if (!roomNode) {
      return null;
    }

    const normalizedX = Math.abs(positionX - roomNode.positionX) / (BOARD_MOVEMENT_NODE_PICK_RADIUS.roomWidthPercent / 2);
    const normalizedY = Math.abs(positionY - roomNode.positionY) / (BOARD_MOVEMENT_NODE_PICK_RADIUS.roomHeightPercent / 2);

    if (normalizedX > 1 || normalizedY > 1) {
      return null;
    }

    return Math.max(normalizedX, normalizedY);
  }

  let matchedDistance = Number.POSITIVE_INFINITY;

  footprint.forEach((gridPoint) => {
    const bounds = getGridCellBounds(gridPoint.col, gridPoint.row, 0.18);
    if (
      positionX < bounds.left ||
      positionX > bounds.right ||
      positionY < bounds.top ||
      positionY > bounds.bottom
    ) {
      return;
    }

    const halfWidth = (bounds.right - bounds.left) / 2;
    const halfHeight = (bounds.bottom - bounds.top) / 2;
    const centerX = bounds.left + halfWidth;
    const centerY = bounds.top + halfHeight;
    const normalizedDistance = Math.max(
      Math.abs(positionX - centerX) / halfWidth,
      Math.abs(positionY - centerY) / halfHeight
    );

    if (normalizedDistance < matchedDistance) {
      matchedDistance = normalizedDistance;
    }
  });

  return Number.isFinite(matchedDistance) ? matchedDistance : null;
}

function getGridCellBounds(col: number, row: number, insetRatio = 0) {
  const centerX = BOARD_GRID_COLUMNS_PERCENT[col];
  const centerY = BOARD_GRID_ROWS_PERCENT[row];

  if (typeof centerX !== 'number' || typeof centerY !== 'number') {
    throw new Error(`Punto de rejilla inválido: col=${col}, row=${row}.`);
  }

  const fallbackNextX = BOARD_GRID_COLUMNS_PERCENT[col + 1] ?? centerX;
  const fallbackPreviousX = BOARD_GRID_COLUMNS_PERCENT[col - 1] ?? centerX;
  const fallbackNextY = BOARD_GRID_ROWS_PERCENT[row + 1] ?? centerY;
  const fallbackPreviousY = BOARD_GRID_ROWS_PERCENT[row - 1] ?? centerY;

  const previousX = col === 0 ? centerX - (fallbackNextX - centerX) : fallbackPreviousX;
  const nextX = col === BOARD_GRID_COLUMNS_PERCENT.length - 1
    ? centerX + (centerX - fallbackPreviousX)
    : fallbackNextX;
  const previousY = row === 0 ? centerY - (fallbackNextY - centerY) : fallbackPreviousY;
  const nextY = row === BOARD_GRID_ROWS_PERCENT.length - 1
    ? centerY + (centerY - fallbackPreviousY)
    : fallbackNextY;

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

function validateRoomDoorTopology(
  nodes: Record<string, BoardMovementNode>,
  connections: Record<string, string[]>,
  roomDoorConnections: Record<string, readonly string[]>
) {
  Object.entries(ROOM_ENTRY_DOOR_GRID_COORDINATES).forEach(([roomNodeId, coordinates]) => {
    const roomNode = nodes[roomNodeId];

    if (!roomNode || roomNode.kind !== 'room') {
      throw new Error(`Configuración de movimiento inválida: ${roomNodeId} no es una sala válida.`);
    }

    const doorNodeIds = roomDoorConnections[roomNodeId] ?? [];
    if (doorNodeIds.length !== coordinates.length) {
      throw new Error(`Configuración de movimiento inválida: ${roomNodeId} no materializa todas sus puertas definidas.`);
    }

    const expectedDoorSet = new Set(doorNodeIds);
    const expectedSecretPassageNodeId = ROOM_SECRET_PASSAGE_DESTINATIONS[roomNodeId];
    const expectedLinkedNodeIds = new Set(doorNodeIds);
    if (expectedSecretPassageNodeId) {
      expectedLinkedNodeIds.add(expectedSecretPassageNodeId);
    }

    const linkedNodeIds = [...new Set(connections[roomNodeId] ?? [])];

    if (linkedNodeIds.length !== expectedLinkedNodeIds.size) {
      throw new Error(`Configuración de movimiento inválida: ${roomNodeId} no coincide con sus puertas definidas.`);
    }

    linkedNodeIds.forEach((linkedNodeId) => {
      if (!expectedLinkedNodeIds.has(linkedNodeId)) {
        throw new Error(`Configuración de movimiento inválida: ${roomNodeId} conecta con ${linkedNodeId}, que no es enlace permitido.`);
      }
    });

    expectedDoorSet.forEach((doorNodeId) => {
      if (!nodes[doorNodeId]) {
        throw new Error(`Configuración de movimiento inválida: ${roomNodeId} referencia la puerta inexistente ${doorNodeId}.`);
      }

      if (!(connections[doorNodeId] ?? []).includes(roomNodeId)) {
        throw new Error(`Configuración de movimiento inválida: ${doorNodeId} no conecta de vuelta con ${roomNodeId}.`);
      }
    });
  });
}

function validateRoomSecretPassageTopology(
  nodes: Record<string, BoardMovementNode>,
  connections: Record<string, string[]>
) {
  Object.entries(ROOM_SECRET_PASSAGE_DESTINATIONS).forEach(([fromRoomNodeId, toRoomNodeId]) => {
    const fromRoomNode = nodes[fromRoomNodeId];
    const toRoomNode = nodes[toRoomNodeId];

    if (!fromRoomNode || fromRoomNode.kind !== 'room') {
      throw new Error(`Configuración de pasadizo inválida: ${fromRoomNodeId} no es una sala válida.`);
    }

    if (!toRoomNode || toRoomNode.kind !== 'room') {
      throw new Error(`Configuración de pasadizo inválida: ${toRoomNodeId} no es una sala válida.`);
    }

    if (ROOM_SECRET_PASSAGE_DESTINATIONS[toRoomNodeId] !== fromRoomNodeId) {
      throw new Error(`Configuración de pasadizo inválida: ${fromRoomNodeId} y ${toRoomNodeId} no están definidos en ambos sentidos.`);
    }

    if (!(connections[fromRoomNodeId] ?? []).includes(toRoomNodeId)) {
      throw new Error(`Configuración de pasadizo inválida: ${fromRoomNodeId} no conecta con ${toRoomNodeId}.`);
    }
  });
}