import { ColorEquipo, EstadoPartida } from '@prisma/client';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';

type TeamMovementClient = Pick<typeof prisma, 'partida' | 'equipo'>;

type MovementNodeKind = 'spawn' | 'square' | 'room';

type BaseMovementNode = {
  id: string;
  label: string;
  positionX: number;
  positionY: number;
  kind: MovementNodeKind;
};

export type BoardMovementNode = {
  id: string;
  label: string;
  positionX: number;
  positionY: number;
  kind: MovementNodeKind;
  stepsRequired?: number;
};

export type TeamMoveState = {
  diceRoll: number;
  currentNode: BoardMovementNode;
  destinationNodes: BoardMovementNode[];
};

type TeamMoveValidationState = {
  diceRoll: number;
  currentNode: BoardMovementNode;
  availableMoves: BoardMovementNode[];
};

export type TeamMoveResult = {
  sessionId: string;
  teamId: string;
  teamName: string;
  teamColor: ColorEquipo;
  diceRoll: number;
  currentNode: BoardMovementNode;
};

const MOVEMENT_POSITION_TOLERANCE = 0.75;
const GRID_STEP_PERCENT = 3.95;

const BASE_MOVEMENT_NODES: Record<string, BaseMovementNode> = {
  'spawn-rojo': { id: 'spawn-rojo', label: 'Salida roja', positionX: 64.97, positionY: 10.03, kind: 'spawn' },
  'pasillo-superior-derecho': {
    id: 'pasillo-superior-derecho',
    label: 'Cruce superior derecho',
    positionX: 64.97,
    positionY: 18.4,
    kind: 'square',
  },
  'pasillo-superior-central': {
    id: 'pasillo-superior-central',
    label: 'Cruce superior central',
    positionX: 50.0,
    positionY: 18.4,
    kind: 'square',
  },
  'centro-norte': {
    id: 'centro-norte',
    label: 'Corredor norte del centro',
    positionX: 48.3,
    positionY: 34.2,
    kind: 'square',
  },
  'spawn-morado': { id: 'spawn-morado', label: 'Salida morada', positionX: 10.03, positionY: 29.04, kind: 'spawn' },
  'pasillo-izquierdo-superior': {
    id: 'pasillo-izquierdo-superior',
    label: 'Cruce izquierdo superior',
    positionX: 16.0,
    positionY: 29.04,
    kind: 'square',
  },
  'sala-superior-izquierda': {
    id: 'sala-superior-izquierda',
    label: 'Sala superior izquierda',
    positionX: 21.66,
    positionY: 15.17,
    kind: 'room',
  },
  'sala-superior-centro': {
    id: 'sala-superior-centro',
    label: 'Sala superior central',
    positionX: 50.2,
    positionY: 18.72,
    kind: 'room',
  },
  'sala-superior-derecha': {
    id: 'sala-superior-derecha',
    label: 'Sala superior derecha',
    positionX: 78.6,
    positionY: 17.72,
    kind: 'room',
  },
  'pasillo-izquierdo-central': {
    id: 'pasillo-izquierdo-central',
    label: 'Cruce izquierdo central',
    positionX: 16.0,
    positionY: 49.55,
    kind: 'square',
  },
  'centro-oeste': {
    id: 'centro-oeste',
    label: 'Corredor oeste del centro',
    positionX: 38.5,
    positionY: 49.55,
    kind: 'square',
  },
  'centro-este': {
    id: 'centro-este',
    label: 'Corredor este del centro',
    positionX: 58.1,
    positionY: 49.55,
    kind: 'square',
  },
  'sala-media-izquierda': {
    id: 'sala-media-izquierda',
    label: 'Sala media izquierda',
    positionX: 21.6,
    positionY: 37.0,
    kind: 'room',
  },
  'sala-media-izquierda-inferior': {
    id: 'sala-media-izquierda-inferior',
    label: 'Sala izquierda inferior',
    positionX: 20.26,
    positionY: 56.6,
    kind: 'room',
  },
  'sala-media-derecha': {
    id: 'sala-media-derecha',
    label: 'Sala media derecha',
    positionX: 76.6,
    positionY: 48.68,
    kind: 'room',
  },
  'spawn-azul': { id: 'spawn-azul', label: 'Salida azul', positionX: 10.03, positionY: 70.05, kind: 'spawn' },
  'pasillo-izquierdo-inferior': {
    id: 'pasillo-izquierdo-inferior',
    label: 'Cruce izquierdo inferior',
    positionX: 16.0,
    positionY: 70.05,
    kind: 'square',
  },
  'pasillo-inferior-izquierdo': {
    id: 'pasillo-inferior-izquierdo',
    label: 'Cruce inferior izquierdo',
    positionX: 42.06,
    positionY: 86.6,
    kind: 'square',
  },
  'centro-sur': {
    id: 'centro-sur',
    label: 'Corredor sur del centro',
    positionX: 48.3,
    positionY: 66.0,
    kind: 'square',
  },
  'sala-inferior-izquierda': {
    id: 'sala-inferior-izquierda',
    label: 'Sala inferior izquierda',
    positionX: 19.83,
    positionY: 81.0,
    kind: 'room',
  },
  'spawn-verde': { id: 'spawn-verde', label: 'Salida verde', positionX: 42.06, positionY: 91.93, kind: 'spawn' },
  'pasillo-inferior-central': {
    id: 'pasillo-inferior-central',
    label: 'Cruce inferior central',
    positionX: 50.0,
    positionY: 86.6,
    kind: 'square',
  },
  'sala-inferior-centro': {
    id: 'sala-inferior-centro',
    label: 'Sala inferior central',
    positionX: 50.2,
    positionY: 77.1,
    kind: 'room',
  },
  'pasillo-inferior-derecho': {
    id: 'pasillo-inferior-derecho',
    label: 'Cruce inferior derecho',
    positionX: 57.94,
    positionY: 86.6,
    kind: 'square',
  },
  'spawn-blanco': { id: 'spawn-blanco', label: 'Salida blanca', positionX: 57.94, positionY: 91.93, kind: 'spawn' },
  'sala-inferior-derecha': {
    id: 'sala-inferior-derecha',
    label: 'Sala inferior derecha',
    positionX: 79.8,
    positionY: 78.6,
    kind: 'room',
  },
  'pasillo-derecho-central': {
    id: 'pasillo-derecho-central',
    label: 'Cruce derecho central',
    positionX: 82.2,
    positionY: 49.55,
    kind: 'square',
  },
  'pasillo-derecho-superior': {
    id: 'pasillo-derecho-superior',
    label: 'Cruce derecho superior',
    positionX: 82.2,
    positionY: 32.94,
    kind: 'square',
  },
  'spawn-amarillo': { id: 'spawn-amarillo', label: 'Salida amarilla', positionX: 88.02, positionY: 32.94, kind: 'spawn' },
};

const BASE_MOVEMENT_CONNECTIONS: Record<string, readonly string[]> = {
  'spawn-rojo': ['pasillo-superior-derecho'],
  'pasillo-superior-derecho': [
    'spawn-rojo',
    'pasillo-superior-central',
    'pasillo-derecho-superior',
  ],
  'pasillo-superior-central': [
    'pasillo-superior-derecho',
    'pasillo-izquierdo-superior',
    'centro-norte',
  ],
  'centro-norte': ['pasillo-superior-central', 'centro-oeste', 'centro-este'],
  'spawn-morado': ['pasillo-izquierdo-superior'],
  'pasillo-izquierdo-superior': [
    'spawn-morado',
    'pasillo-superior-central',
    'pasillo-izquierdo-central',
  ],
  'pasillo-izquierdo-central': [
    'pasillo-izquierdo-superior',
    'pasillo-izquierdo-inferior',
    'centro-oeste',
  ],
  'centro-oeste': [
    'centro-norte',
    'centro-sur',
    'pasillo-izquierdo-central',
  ],
  'centro-este': ['centro-norte', 'centro-sur', 'pasillo-derecho-central'],
  'spawn-azul': ['pasillo-izquierdo-inferior'],
  'pasillo-izquierdo-inferior': [
    'spawn-azul',
    'pasillo-izquierdo-central',
    'pasillo-inferior-izquierdo',
  ],
  'pasillo-inferior-izquierdo': [
    'pasillo-izquierdo-inferior',
    'spawn-verde',
    'pasillo-inferior-central',
    'centro-sur',
  ],
  'centro-sur': [
    'centro-oeste',
    'centro-este',
    'pasillo-inferior-izquierdo',
    'pasillo-inferior-central',
    'pasillo-inferior-derecho',
  ],
  'spawn-verde': ['pasillo-inferior-izquierdo'],
  'pasillo-inferior-central': ['pasillo-inferior-izquierdo', 'pasillo-inferior-derecho', 'centro-sur'],
  'pasillo-inferior-derecho': [
    'pasillo-inferior-central',
    'spawn-blanco',
    'pasillo-derecho-central',
    'centro-sur',
  ],
  'spawn-blanco': ['pasillo-inferior-derecho'],
  'pasillo-derecho-central': [
    'pasillo-inferior-derecho',
    'pasillo-derecho-superior',
    'centro-este',
  ],
  'pasillo-derecho-superior': [
    'spawn-amarillo',
    'pasillo-derecho-central',
    'pasillo-superior-derecho',
  ],
  'spawn-amarillo': ['pasillo-derecho-superior'],
};

const ROOM_DOOR_CONNECTIONS: Record<string, readonly string[]> = {
  'sala-superior-izquierda': ['square:pasillo-izquierdo-superior::pasillo-superior-central:7'],
  'sala-superior-centro': [
    'square:centro-norte::pasillo-superior-central:1',
    'square:centro-norte::pasillo-superior-central:2',
  ],
  'sala-superior-derecha': ['square:pasillo-derecho-superior::pasillo-superior-derecho:7'],
  'sala-media-izquierda': ['square:centro-oeste::pasillo-izquierdo-central:3'],
  'sala-media-izquierda-inferior': ['square:pasillo-izquierdo-central::pasillo-izquierdo-inferior:4'],
  'sala-media-derecha': [
    'square:centro-este::pasillo-derecho-central:1',
    'square:centro-este::pasillo-derecho-central:2',
  ],
  'sala-inferior-izquierda': ['square:pasillo-inferior-izquierdo::pasillo-izquierdo-inferior:7'],
  'sala-inferior-centro': [
    'square:centro-oeste::centro-sur:6',
    'centro-sur',
    'square:centro-este::centro-sur:6',
  ],
  'sala-inferior-derecha': ['square:pasillo-derecho-central::pasillo-inferior-derecho:3'],
};

const EXPANDED_MOVEMENT_GRAPH = buildExpandedMovementGraph();

export const BOARD_MOVEMENT_NODES = EXPANDED_MOVEMENT_GRAPH.nodes;
export const BOARD_MOVEMENT_CONNECTIONS = EXPANDED_MOVEMENT_GRAPH.connections;

export function getAdjacentMoveNodes(currentNodeId: string, occupiedNodeIds: Iterable<string> = []) {
  const occupiedSet = new Set(occupiedNodeIds);

  return (BOARD_MOVEMENT_CONNECTIONS[currentNodeId] ?? [])
    .map((nodeId) => BOARD_MOVEMENT_NODES[nodeId])
    .filter((node): node is BoardMovementNode => Boolean(node))
    .filter((node) => !occupiedSet.has(node.id));
}

  export const getAvailableMoveNodes = getAdjacentMoveNodes;

export function getReachableMoveNodes(currentNodeId: string, occupiedNodeIds: Iterable<string>, diceRoll: number) {
  const occupiedSet = new Set(occupiedNodeIds);
  const visitedSteps = new Map<string, number>([[currentNodeId, 0]]);
  const queue: Array<{ nodeId: string; steps: number }> = [{ nodeId: currentNodeId, steps: 0 }];
  const reachableNodes = new Map<string, BoardMovementNode>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const linkedNodeIds = BOARD_MOVEMENT_CONNECTIONS[current.nodeId] ?? [];

    linkedNodeIds.forEach((linkedNodeId) => {
      if (occupiedSet.has(linkedNodeId)) {
        return;
      }

      const nextSteps = current.steps + 1;
      if (nextSteps > diceRoll) {
        return;
      }

      const previousBest = visitedSteps.get(linkedNodeId);
      if (previousBest !== undefined && previousBest <= nextSteps) {
        return;
      }

      visitedSteps.set(linkedNodeId, nextSteps);
      queue.push({ nodeId: linkedNodeId, steps: nextSteps });

      const node = BOARD_MOVEMENT_NODES[linkedNodeId];
      if (!node) {
        return;
      }

      reachableNodes.set(linkedNodeId, {
        ...node,
        stepsRequired: nextSteps,
      });
    });
  }

  return Array.from(reachableNodes.values()).sort((left, right) => {
    const stepDelta = (left.stepsRequired ?? 0) - (right.stepsRequired ?? 0);
    if (stepDelta !== 0) {
      return stepDelta;
    }

    if (left.kind !== right.kind) {
      return left.kind === 'room' ? 1 : -1;
    }

    return left.label.localeCompare(right.label, 'es');
  });
}

export function findBoardMovementNodeByPosition(positionX: number | null, positionY: number | null) {
  if (typeof positionX !== 'number' || typeof positionY !== 'number') {
    return null;
  }

  return (
    Object.values(BOARD_MOVEMENT_NODES).find(
      (node) =>
        Math.abs(node.positionX - positionX) <= MOVEMENT_POSITION_TOLERANCE &&
        Math.abs(node.positionY - positionY) <= MOVEMENT_POSITION_TOLERANCE
    ) ?? null
  );
}

export async function loadTeamMoveStateByAccessCode(
  client: TeamMovementClient,
  accessCode: string,
  teamId: string,
  diceRoll: number
): Promise<TeamMoveState> {
  const session = await loadMovementSessionByAccessCode(client, accessCode);
  ensureSessionIsMovable(session.status);
  ensureDiceRollIsValid(diceRoll);

  const moveState = buildTeamMoveValidationState(session, teamId, diceRoll);

  return {
    diceRoll: moveState.diceRoll,
    currentNode: moveState.currentNode,
    destinationNodes: getDestinationNodes(moveState.currentNode.id),
  };
}

export async function moveTeamByAccessCode(
  client: TeamMovementClient,
  accessCode: string,
  teamId: string,
  targetNodeId: string,
  diceRoll: number
): Promise<TeamMoveResult> {
  const session = await loadMovementSessionByAccessCode(client, accessCode);
  ensureSessionIsMovable(session.status);
  ensureDiceRollIsValid(diceRoll);

  const currentState = buildTeamMoveValidationState(session, teamId, diceRoll);
  const targetNode = currentState.availableMoves.find((node) => node.id === targetNodeId);

  if (!targetNode) {
    throw new HttpError(409, 'El destino solicitado no es válido para la tirada actual.');
  }

  const currentTeam = session.teams.find((team) => team.id === teamId);
  if (!currentTeam) {
    throw new HttpError(404, 'El equipo indicado no pertenece a la sesión seleccionada.');
  }

  await client.equipo.update({
    where: { id: teamId },
    data: {
      positionX: targetNode.positionX,
      positionY: targetNode.positionY,
    },
  });

  const updatedSession = await loadMovementSessionByAccessCode(client, accessCode);
  const updatedState = buildTeamMoveValidationState(updatedSession, teamId, diceRoll);

  return {
    sessionId: updatedSession.id,
    teamId: currentTeam.id,
    teamName: currentTeam.name,
    teamColor: currentTeam.color,
    diceRoll,
    currentNode: updatedState.currentNode,
  };
}

function ensureSessionIsMovable(status: EstadoPartida) {
  if (status !== EstadoPartida.EN_CURSO) {
    throw new HttpError(409, 'Solo se puede mover un peón cuando la partida está en curso.');
  }
}

function ensureDiceRollIsValid(diceRoll: number) {
  if (!Number.isInteger(diceRoll) || diceRoll < 2 || diceRoll > 12) {
    throw new HttpError(400, 'La tirada indicada no es válida.');
  }
}

async function loadMovementSessionByAccessCode(client: TeamMovementClient, accessCode: string) {
  const session = await client.partida.findUnique({
    where: { accessCode },
    select: {
      id: true,
      status: true,
      teams: {
        select: {
          id: true,
          name: true,
          color: true,
          positionX: true,
          positionY: true,
        },
      },
    },
  });

  if (!session) {
    throw new HttpError(404, 'La sesión solicitada no existe.');
  }

  return {
    id: session.id,
    status: session.status ?? EstadoPartida.LOBBY,
    teams: session.teams,
  };
}

function buildTeamMoveValidationState(
  session: {
    id: string;
    status: EstadoPartida;
    teams: Array<{
      id: string;
      name: string;
      color: ColorEquipo;
      positionX: number | null;
      positionY: number | null;
    }>;
  },
  teamId: string,
  diceRoll: number
): TeamMoveValidationState {
  const team = session.teams.find((currentTeam) => currentTeam.id === teamId);

  if (!team) {
    throw new HttpError(404, 'El equipo indicado no pertenece a la sesión seleccionada.');
  }

  const currentNode = findBoardMovementNodeByPosition(team.positionX, team.positionY);
  if (!currentNode) {
    throw new HttpError(409, 'La posición actual del equipo no pertenece todavía al grafo de movimiento soportado.');
  }

  const occupiedNodeIds = new Set(
    session.teams
      .filter((currentTeam) => currentTeam.id !== teamId)
      .map((currentTeam) => findBoardMovementNodeByPosition(currentTeam.positionX, currentTeam.positionY)?.id)
      .filter((nodeId): nodeId is string => Boolean(nodeId))
  );

  const availableMoves = getReachableMoveNodes(currentNode.id, occupiedNodeIds, diceRoll);

  return {
    diceRoll,
    currentNode,
    availableMoves,
  };
}

function getDestinationNodes(currentNodeId: string) {
  return Object.values(BOARD_MOVEMENT_NODES)
    .filter((node) => node.id !== currentNodeId)
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'room' ? 1 : -1;
      }

      return left.label.localeCompare(right.label, 'es');
    })
    .map((node) => ({
      id: node.id,
      label: node.label,
      positionX: node.positionX,
      positionY: node.positionY,
      kind: node.kind,
    }));
}

function buildExpandedMovementGraph() {
  const nodes: Record<string, BoardMovementNode> = Object.fromEntries(
    Object.values(BASE_MOVEMENT_NODES).map((node) => [node.id, { ...node }])
  );
  const connections: Record<string, string[]> = Object.fromEntries(
    Object.keys(nodes).map((nodeId) => [nodeId, []])
  );
  const processedEdges = new Set<string>();

  Object.entries(BASE_MOVEMENT_CONNECTIONS).forEach(([fromNodeId, linkedNodeIds]) => {
    linkedNodeIds.forEach((toNodeId) => {
      const edgeKey = [fromNodeId, toNodeId].sort().join('::');
      if (processedEdges.has(edgeKey)) {
        return;
      }

      processedEdges.add(edgeKey);
      const fromNode = BASE_MOVEMENT_NODES[fromNodeId];
      const toNode = BASE_MOVEMENT_NODES[toNodeId];

      if (!fromNode || !toNode) {
        return;
      }

      const edgeSteps = getEdgeStepCount(fromNode, toNode);
      if (edgeSteps <= 1) {
        connectMovementNodes(connections, fromNodeId, toNodeId);
        return;
      }

      let previousNodeId = fromNodeId;

      for (let stepIndex = 1; stepIndex < edgeSteps; stepIndex += 1) {
        const stepRatio = stepIndex / edgeSteps;
        const squareNodeId = `square:${edgeKey}:${stepIndex}`;
        const squareNode: BoardMovementNode = {
          id: squareNodeId,
          kind: 'square',
          label: `Casilla ${stepIndex} entre ${fromNode.label} y ${toNode.label}`,
          positionX: roundToTwoDecimals(interpolate(fromNode.positionX, toNode.positionX, stepRatio)),
          positionY: roundToTwoDecimals(interpolate(fromNode.positionY, toNode.positionY, stepRatio)),
        };

        nodes[squareNodeId] = squareNode;
        connections[squareNodeId] = connections[squareNodeId] ?? [];
        connectMovementNodes(connections, previousNodeId, squareNodeId);
        previousNodeId = squareNodeId;
      }

      connectMovementNodes(connections, previousNodeId, toNodeId);
    });
  });

  Object.entries(ROOM_DOOR_CONNECTIONS).forEach(([roomNodeId, doorNodeIds]) => {
    doorNodeIds.forEach((doorNodeId) => {
      if (!nodes[roomNodeId] || !nodes[doorNodeId]) {
        return;
      }

      connectMovementNodes(connections, roomNodeId, doorNodeId);
    });
  });

  return {
    nodes,
    connections: Object.fromEntries(
      Object.entries(connections).map(([nodeId, linkedNodeIds]) => [nodeId, [...new Set(linkedNodeIds)]])
    ) as Record<string, readonly string[]>,
  };
}

function getEdgeStepCount(left: BaseMovementNode, right: BaseMovementNode) {
  if (left.kind === 'room' || right.kind === 'room') {
    return 1;
  }

  const manhattanDistance = Math.abs(left.positionX - right.positionX) + Math.abs(left.positionY - right.positionY);
  return Math.max(1, Math.round(manhattanDistance / GRID_STEP_PERCENT));
}

function connectMovementNodes(connections: Record<string, string[]>, leftNodeId: string, rightNodeId: string) {
  connections[leftNodeId] = connections[leftNodeId] ?? [];
  connections[rightNodeId] = connections[rightNodeId] ?? [];

  connections[leftNodeId].push(rightNodeId);
  connections[rightNodeId].push(leftNodeId);
}

function interpolate(startValue: number, endValue: number, ratio: number) {
  return startValue + (endValue - startValue) * ratio;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}