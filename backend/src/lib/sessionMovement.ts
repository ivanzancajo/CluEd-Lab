import { ColorEquipo, EstadoPartida } from '@prisma/client';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';
import {
  BOARD_MOVEMENT_CONNECTIONS,
  BOARD_MOVEMENT_NODES,
  getRoomEntryNodeByDoorNodeId,
  type BoardMovementNode,
} from './boardGraph.js';
import {
  buildNextTurnUpdate,
  ensureCurrentTurnBelongsToTeam,
  ensureTurnHasNoActiveDice,
  getActiveDice,
  rollTurnDice,
  type SessionTurnDice,
} from './sessionTurn.js';

type TeamMovementClient = Pick<typeof prisma, 'partida' | 'equipo'>;
export { BOARD_MOVEMENT_CONNECTIONS, BOARD_MOVEMENT_NODES } from './boardGraph.js';
export type { BoardMovementNode } from './boardGraph.js';

export type TeamMoveState = {
  diceRoll: number | null;
  remainingMoves: number | null;
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
  dice: SessionTurnDice;
  remainingMoves: number | null;
  currentNode: BoardMovementNode;
  destinationNodes: BoardMovementNode[];
  turnAdvanced: boolean;
};

export type TeamDiceRollResult = {
  sessionId: string;
  teamId: string;
  teamName: string;
  teamColor: ColorEquipo;
  dice: SessionTurnDice;
  remainingMoves: number | null;
  currentNode: BoardMovementNode;
  destinationNodes: BoardMovementNode[];
  turnAdvanced: boolean;
};

const MOVEMENT_POSITION_TOLERANCE = 0.75;

export function getAdjacentMoveNodes(currentNodeId: string, occupiedNodeIds: Iterable<string> = []) {
  const occupiedSet = new Set(occupiedNodeIds);

  return (BOARD_MOVEMENT_CONNECTIONS[currentNodeId] ?? [])
    .map((nodeId) => BOARD_MOVEMENT_NODES[nodeId])
    .filter((node): node is BoardMovementNode => Boolean(node))
    .filter((node) => !occupiedSet.has(node.id));
}

export const getAvailableMoveNodes = getAdjacentMoveNodes;

export function getIncrementalMoveNodes(currentNodeId: string, occupiedNodeIds: Iterable<string> = []) {
  return getAdjacentMoveNodes(currentNodeId, occupiedNodeIds)
    .map((node) => ({
      ...node,
      stepsRequired: 1,
    }))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'room' ? 1 : -1;
      }

      return left.label.localeCompare(right.label, 'es');
    });
}

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

    if (current.steps >= diceRoll) {
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

      const node = BOARD_MOVEMENT_NODES[linkedNodeId];
      if (!node) {
        return;
      }

      if (nextSteps === diceRoll) {
        reachableNodes.set(linkedNodeId, {
          ...node,
          stepsRequired: nextSteps,
        });
        return;
      }

      queue.push({ nodeId: linkedNodeId, steps: nextSteps });
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

export function resolveCommittedMoveTargetNode(currentNode: BoardMovementNode, targetNode: BoardMovementNode) {
  if (currentNode.kind === 'room') {
    return targetNode;
  }

  return getRoomEntryNodeByDoorNodeId(targetNode.id) ?? targetNode;
}

export async function loadTeamMoveStateByAccessCode(
  client: TeamMovementClient,
  accessCode: string,
  teamId: string
): Promise<TeamMoveState> {
  const session = await loadMovementSessionByAccessCode(client, accessCode);
  ensureSessionIsMovable(session.status);
  ensureCurrentTurnBelongsToTeam(session, teamId);

  const currentNode = resolveTeamMovementContext(session, teamId).currentNode;
  const activeDice = getActiveDice(session);
  if (!activeDice) {
    return {
      diceRoll: null,
      remainingMoves: null,
      currentNode,
      destinationNodes: [],
    };
  }

  const moveState = buildTeamMoveValidationState(session, teamId, activeDice.total);

  return {
    diceRoll: moveState.diceRoll,
    remainingMoves: activeDice.total,
    currentNode: moveState.currentNode,
    destinationNodes: moveState.availableMoves,
  };
}

export async function rollTeamDiceByAccessCode(
  client: TeamMovementClient,
  accessCode: string,
  teamId: string
): Promise<TeamDiceRollResult> {
  const session = await loadMovementSessionByAccessCode(client, accessCode);
  ensureSessionIsMovable(session.status);
  ensureCurrentTurnBelongsToTeam(session, teamId);
  ensureTurnHasNoActiveDice(session);

  const movementContext = resolveTeamMovementContext(session, teamId);
  const dice = rollTurnDice();
  const destinationNodes = getReachableMoveNodes(
    movementContext.currentNode.id,
    movementContext.occupiedNodeIds,
    dice.total
  );
  const turnAdvanced = destinationNodes.length === 0;

  await client.partida.update({
    where: { id: session.id },
    data: turnAdvanced
      ? buildNextTurnUpdate(session)
      : {
          activeDiceValueOne: dice.valueOne,
          activeDiceValueTwo: dice.valueTwo,
          activeDiceRemainingMoves: dice.total,
        },
  });

  return {
    sessionId: session.id,
    teamId: movementContext.team.id,
    teamName: movementContext.team.name,
    teamColor: movementContext.team.color,
    dice,
    remainingMoves: turnAdvanced ? null : dice.total,
    currentNode: movementContext.currentNode,
    destinationNodes,
    turnAdvanced,
  };
}

export async function moveTeamByAccessCode(
  client: TeamMovementClient,
  accessCode: string,
  teamId: string,
  targetNodeId: string
): Promise<TeamMoveResult> {
  const session = await loadMovementSessionByAccessCode(client, accessCode);
  ensureSessionIsMovable(session.status);
  ensureCurrentTurnBelongsToTeam(session, teamId);

  const activeDice = getActiveDice(session);
  if (!activeDice) {
    throw new HttpError(409, 'El equipo actual debe lanzar los dados antes de moverse.');
  }

  const currentState = buildTeamMoveValidationState(session, teamId, activeDice.total);
  const targetNode = currentState.availableMoves.find((node) => node.id === targetNodeId);

  if (!targetNode) {
    throw new HttpError(409, 'El destino solicitado no es válido para la tirada actual.');
  }

  const currentTeam = session.teams.find((team) => team.id === teamId);
  if (!currentTeam) {
    throw new HttpError(404, 'El equipo indicado no pertenece a la sesión seleccionada.');
  }

  const committedTargetNode = resolveCommittedMoveTargetNode(currentState.currentNode, targetNode);

  await client.equipo.update({
    where: { id: teamId },
    data: {
      positionX: committedTargetNode.positionX,
      positionY: committedTargetNode.positionY,
    },
  });

  await client.partida.update({
    where: { id: session.id },
    data: buildNextTurnUpdate(session),
  });

  const updatedSession = await loadMovementSessionByAccessCode(client, accessCode);
  const updatedContext = resolveTeamMovementContext(updatedSession, teamId);

  return {
    sessionId: updatedSession.id,
    teamId: currentTeam.id,
    teamName: currentTeam.name,
    teamColor: currentTeam.color,
    dice: activeDice,
    remainingMoves: null,
    currentNode: updatedContext.currentNode,
    destinationNodes: [],
    turnAdvanced: true,
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
      currentTurnTeamId: true,
      currentTurnStartedAt: true,
      activeDiceValueOne: true,
      activeDiceValueTwo: true,
      activeDiceRemainingMoves: true,
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
    currentTurnTeamId: session.currentTurnTeamId,
    currentTurnStartedAt: session.currentTurnStartedAt,
    activeDiceValueOne: session.activeDiceValueOne,
    activeDiceValueTwo: session.activeDiceValueTwo,
    activeDiceRemainingMoves: session.activeDiceRemainingMoves,
    teams: session.teams,
  };
}

function buildTeamMoveValidationState(
  session: {
    id: string;
    status: EstadoPartida;
    currentTurnTeamId: string | null;
    currentTurnStartedAt: Date | null;
    activeDiceValueOne: number | null;
    activeDiceValueTwo: number | null;
    activeDiceRemainingMoves: number | null;
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
  ensureDiceRollIsValid(diceRoll);

  const { currentNode, occupiedNodeIds } = resolveTeamMovementContext(session, teamId);

  const availableMoves = getReachableMoveNodes(currentNode.id, occupiedNodeIds, diceRoll);

  return {
    diceRoll,
    currentNode,
    availableMoves,
  };
}

function resolveTeamMovementContext(session: {
  teams: Array<{
    id: string;
    name: string;
    color: ColorEquipo;
    positionX: number | null;
    positionY: number | null;
  }>;
}, teamId: string) {
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

  return {
    team,
    currentNode,
    occupiedNodeIds,
  };
}