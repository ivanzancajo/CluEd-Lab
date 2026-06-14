import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ColorEquipo, EstadoPartida, PrismaClient, TipoElemento } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import { getRoomEntryNodeByDoorNodeId } from '../src/lib/boardGraph.js';
import { BOARD_MOVEMENT_CONNECTIONS, BOARD_MOVEMENT_NODES } from '../src/lib/sessionMovement.js';
import sessionRoutes from '../src/routes/sessionRoutes.js';
import {
  registerSocketServer,
  type GameRefuteAck,
  type GameRefuteRequestPayload,
  type GameRefutationResultPayload,
  type GameSuggestAck,
  type LobbyPresenceState,
} from '../src/socket/socketServer.js';
import { getTeamSpawnPosition } from '../src/lib/teamSpawnPositions.js';
import { getTestDatabaseUrl } from './helpers/testDatabase';

type ErrorResponse = {
  error: string;
  details?: string[];
};

type SessionResponse = {
  item: {
    id: string;
    accessCode: string;
    status: string;
    turn: {
      currentTeamId: string;
      currentTeamName: string;
      currentTeamColor: string;
      dice: {
        valueOne: number;
        valueTwo: number;
        total: number;
      } | null;
    } | null;
    activeSuggestion: {
      eventId: string;
      emitterTeamId: string;
      receiverTeamId: string | null;
      subject: { id: string; name: string };
      object: { id: string; name: string };
      space: { id: string; name: string };
    } | null;
  };
};

type TeamMoveNode = {
  id: string;
  label: string;
  kind: 'spawn' | 'square' | 'room';
  positionX: number;
  positionY: number;
};

type MoveTeamResponse = {
  item: {
    session: SessionResponse['item'];
    currentNode: TeamMoveNode;
    destinationNodes: TeamMoveNode[];
    turnAdvanced: boolean;
  };
};

type EndTurnResponse = {
  item: {
    session: SessionResponse['item'];
  };
};

type TeamTerminalStateResponse = {
  item: {
    pendingSuggestion:
      | {
          type: 'AWAITING_REFUTATION';
          suggestion: {
            eventId: string;
          };
        }
      | {
          type: 'REFUTE_REQUEST';
          suggestion: {
            eventId: string;
          };
          matchingCards: Array<{
            id: string;
            name: string;
          }>;
        }
      | null;
    hand: Array<{
      id: string;
      kind: string;
      name: string;
    }>;
  };
};

type LobbySubscribeResponse =
  | {
      ok: true;
      state: LobbyPresenceState;
    }
  | {
      ok: false;
      error: string;
    };

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getTestDatabaseUrl(),
    },
  },
});

describe('SCRUM-84 sugerencia y refutacion', () => {
  let server: Server;
  let baseUrl = '';
  let socketUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/game', sessionRoutes);

    server = createServer(app);
    registerSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('No se pudo resolver el puerto del servidor de pruebas de sugerencias.');
    }

    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    socketUrl = baseUrl;
  });

  beforeEach(async () => {
    await prisma.partida.deleteMany();
    await prisma.solucion.deleteMany();
    await prisma.cluEdSkin.deleteMany();
    await prisma.elemento.deleteMany();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await prisma.$disconnect();
  });

  async function request(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);

    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
  }

  it('mantiene el turno al entrar en una sala y permite terminarlo sin sugerir', async () => {
    const seeded = await seedRoomMovementSession('SUGM01');

    const moveResponse = await request(`/api/game/sessions/SUGM01/teams/${seeded.redTeamId}/move`, {
      method: 'POST',
      body: JSON.stringify({ targetNodeId: seeded.roomDoorNodeId }),
    });
    const moveBody = (await moveResponse.json()) as MoveTeamResponse;

    expect(moveResponse.status).toBe(200);
    expect(moveBody.item.turnAdvanced).toBe(false);
    expect(moveBody.item.currentNode.id).toBe(seeded.roomNodeId);
    expect(moveBody.item.currentNode.kind).toBe('room');
    expect(moveBody.item.session.turn).toMatchObject({
      currentTeamId: seeded.redTeamId,
      dice: null,
    });

    const endTurnResponse = await request(`/api/game/sessions/SUGM01/teams/${seeded.redTeamId}/end-turn`, {
      method: 'POST',
    });
    const endTurnBody = (await endTurnResponse.json()) as EndTurnResponse;

    expect(endTurnResponse.status).toBe(200);
    expect(endTurnBody.item.session.turn).toMatchObject({
      currentTeamId: seeded.blueTeamId,
    });
  });

  it('resuelve la refutacion por socket, bloquea end-turn mientras esta pendiente y pasa el turno al refutador', async () => {
    const seeded = await seedSuggestionSession('SUGR01');
    const redSocket = await connectSocketClient(socketUrl);
    const blueSocket = await connectSocketClient(socketUrl);

    try {
      const redSubscribe = await emitSocketAck<LobbySubscribeResponse>(redSocket, 'lobby:team-subscribe', {
        sessionId: seeded.sessionId,
        teamId: seeded.redTeamId,
      });
      const blueSubscribe = await emitSocketAck<LobbySubscribeResponse>(blueSocket, 'lobby:team-subscribe', {
        sessionId: seeded.sessionId,
        teamId: seeded.blueTeamId,
      });

      expect(redSubscribe.ok).toBe(true);
      expect(blueSubscribe.ok).toBe(true);

      const refuteRequestPromise = waitForSocketEvent<GameRefuteRequestPayload>(blueSocket, 'game:refute-request');
      const suggestAck = await emitSocketAck<GameSuggestAck>(redSocket, 'game:suggest', {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });
      const refuteRequest = await refuteRequestPromise;

      expect(suggestAck).toEqual({
        ok: true,
        status: 'waiting-refutation',
        occurredAt: expect.any(Number),
      });
      expect(refuteRequest.suggestion.receiverTeamId).toBe(seeded.blueTeamId);
      expect(refuteRequest.matchingCards.map((card) => card.id).sort()).toEqual(
        [seeded.objectIds[0], seeded.spaceIds[0]].sort()
      );

      const pendingBlueStateResponse = await request(`/api/game/sessions/SUGR01/teams/${seeded.blueTeamId}/state`);
      const pendingBlueState = (await pendingBlueStateResponse.json()) as TeamTerminalStateResponse;

      expect(pendingBlueStateResponse.status).toBe(200);
      expect(pendingBlueState.item.pendingSuggestion).toMatchObject({
        type: 'REFUTE_REQUEST',
        matchingCards: expect.arrayContaining([
          expect.objectContaining({ id: seeded.objectIds[0] }),
          expect.objectContaining({ id: seeded.spaceIds[0] }),
        ]),
      });

      const sessionDuringSuggestionResponse = await request('/api/game/sessions/SUGR01');
      const sessionDuringSuggestion = (await sessionDuringSuggestionResponse.json()) as SessionResponse;

      expect(sessionDuringSuggestionResponse.status).toBe(200);
      expect(sessionDuringSuggestion.item.activeSuggestion).toMatchObject({
        emitterTeamId: seeded.redTeamId,
        receiverTeamId: seeded.blueTeamId,
        subject: { id: seeded.subjectIds[0] },
        object: { id: seeded.objectIds[0] },
        space: { id: seeded.spaceIds[0] },
      });

      const blockedEndTurnResponse = await request(`/api/game/sessions/SUGR01/teams/${seeded.redTeamId}/end-turn`, {
        method: 'POST',
      });
      const blockedEndTurn = (await blockedEndTurnResponse.json()) as ErrorResponse;

      expect(blockedEndTurnResponse.status).toBe(409);
      expect(blockedEndTurn.error).toBe('Hay una sugerencia pendiente de refutación y la partida está temporalmente bloqueada.');

      const refutationResultPromise = waitForSocketEvent<GameRefutationResultPayload>(redSocket, 'game:refutation-result');
      const refuteAck = await emitSocketAck<GameRefuteAck>(blueSocket, 'game:refute', {
        shownElementId: seeded.objectIds[0],
      });
      const refutationResult = await refutationResultPromise;

      expect(refuteAck).toEqual({
        ok: true,
        occurredAt: expect.any(Number),
      });
      expect(refutationResult).toMatchObject({
        outcome: 'REFUTED',
        shownCard: {
          id: seeded.objectIds[0],
        },
        shownByTeamId: seeded.blueTeamId,
        suggestion: {
          emitterTeamId: seeded.redTeamId,
          receiverTeamId: seeded.blueTeamId,
        },
      });

      const sessionAfterRefutationResponse = await request('/api/game/sessions/SUGR01');
      const sessionAfterRefutation = (await sessionAfterRefutationResponse.json()) as SessionResponse;

      expect(sessionAfterRefutation.item.activeSuggestion).toBeNull();
      expect(sessionAfterRefutation.item.turn).toMatchObject({
        currentTeamId: seeded.blueTeamId,
      });
    } finally {
      redSocket.disconnect();
      blueSocket.disconnect();
    }
  });
});

async function seedRoomMovementSession(accessCode: string) {
  const { session } = await seedSkinAndSession(accessCode);
  const roomNodeId = 'sala-superior-izquierda';
  const roomDoorNode = findDoorNodeForRoom(roomNodeId);
  const distanceByNodeId = buildShortestDistances(roomDoorNode.id);
  const startNodeId = Object.entries(distanceByNodeId).find(([nodeId, distance]) => {
    const node = BOARD_MOVEMENT_NODES[nodeId];
    return node?.kind === 'square' && distance === 2;
  })?.[0];

  if (!startNodeId) {
    throw new Error('No se pudo localizar una casilla a dos pasos de la puerta de la sala de prueba.');
  }

  const startNode = BOARD_MOVEMENT_NODES[startNodeId];
  const blueSpawn = getTeamSpawnPosition(ColorEquipo.AZUL);

  const redTeam = await prisma.equipo.create({
    data: {
      partidaId: session.id,
      color: ColorEquipo.ROJO,
      name: 'Equipo Rojo',
      positionX: startNode.positionX,
      positionY: startNode.positionY,
    },
  });

  const blueTeam = await prisma.equipo.create({
    data: {
      partidaId: session.id,
      color: ColorEquipo.AZUL,
      name: 'Equipo Azul',
      positionX: blueSpawn.positionX,
      positionY: blueSpawn.positionY,
    },
  });

  await prisma.partida.update({
    where: { id: session.id },
    data: {
      status: EstadoPartida.EN_CURSO,
      currentTurnTeamId: redTeam.id,
      currentTurnStartedAt: new Date('2026-05-13T10:00:00.000Z'),
      activeDiceValueOne: 1,
      activeDiceValueTwo: 1,
      activeDiceRemainingMoves: 2,
    },
  });

  return {
    sessionId: session.id,
    redTeamId: redTeam.id,
    blueTeamId: blueTeam.id,
    roomNodeId,
    roomDoorNodeId: roomDoorNode.id,
  };
}

async function seedSuggestionSession(accessCode: string) {
  const { skin, session } = await seedSkinAndSession(accessCode);
  const subjects = await createCollectionItems(skin.id, TipoElemento.SUJETO, 'Sujeto', 6);
  const objects = await createCollectionItems(skin.id, TipoElemento.OBJETO, 'Objeto', 6);
  const spaces = await createCollectionItems(skin.id, TipoElemento.ESPACIO, 'Espacio', 9);

  const redRoom = BOARD_MOVEMENT_NODES['sala-superior-izquierda'];
  const blueSpawn = getTeamSpawnPosition(ColorEquipo.AZUL);
  const greenSpawn = getTeamSpawnPosition(ColorEquipo.VERDE);

  const redTeam = await prisma.equipo.create({
    data: {
      partidaId: session.id,
      color: ColorEquipo.ROJO,
      name: 'Equipo Rojo',
      positionX: redRoom.positionX,
      positionY: redRoom.positionY,
    },
  });
  const blueTeam = await prisma.equipo.create({
    data: {
      partidaId: session.id,
      color: ColorEquipo.AZUL,
      name: 'Equipo Azul',
      positionX: blueSpawn.positionX,
      positionY: blueSpawn.positionY,
    },
  });
  const greenTeam = await prisma.equipo.create({
    data: {
      partidaId: session.id,
      color: ColorEquipo.VERDE,
      name: 'Equipo Verde',
      positionX: greenSpawn.positionX,
      positionY: greenSpawn.positionY,
    },
  });

  await prisma.partida.update({
    where: { id: session.id },
    data: {
      status: EstadoPartida.EN_CURSO,
      currentTurnTeamId: redTeam.id,
      currentTurnStartedAt: new Date('2026-05-13T10:00:00.000Z'),
      activeDiceValueOne: null,
      activeDiceValueTwo: null,
      activeDiceRemainingMoves: null,
    },
  });

  await prisma.cartaEquipo.createMany({
    data: [
      { equipoId: redTeam.id, elementId: subjects[1].id },
      { equipoId: blueTeam.id, elementId: objects[0].id },
      { equipoId: blueTeam.id, elementId: spaces[0].id },
      { equipoId: greenTeam.id, elementId: subjects[0].id },
      { equipoId: greenTeam.id, elementId: objects[1].id },
    ],
  });

  return {
    sessionId: session.id,
    redTeamId: redTeam.id,
    blueTeamId: blueTeam.id,
    greenTeamId: greenTeam.id,
    subjectIds: subjects.map((item) => item.id),
    objectIds: objects.map((item) => item.id),
    spaceIds: spaces.map((item) => item.id),
  };
}

async function seedSkinAndSession(accessCode: string) {
  const timestamp = Date.now();
  const skin = await prisma.cluEdSkin.create({
    data: {
      name: `Skin ${accessCode}`,
      objective: 'Validar sugerencias y refutaciones.',
      imageUrl: '',
      context: JSON.stringify({
        version: 1,
        gameTitle: 'Laboratorio de sugerencias',
        duration: '45',
        cat1Name: 'Sujetos',
        cat2Name: 'Objetos',
        cat3Name: 'Espacios',
        hasMotifs: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    },
  });

  const session = await prisma.partida.create({
    data: {
      accessCode,
      status: EstadoPartida.LOBBY,
      durationMinutes: 45,
      skinId: skin.id,
    },
  });

  return { skin, session };
}

async function createCollectionItems(skinId: string, kind: TipoElemento, prefix: string, count: number) {
  const createdElements: Array<{ id: string }> = [];

  for (let index = 0; index < count; index += 1) {
    const element = await prisma.elemento.create({
      data: {
        name: `${prefix} ${index + 1}`,
        kind,
        imageUrl: '',
      },
    });

    await prisma.descripcionElemento.create({
      data: {
        skinId,
        elementId: element.id,
        description: `Descripcion de ${prefix} ${index + 1}`,
        motif: kind === TipoElemento.ESPACIO ? `Motivo ${index + 1}` : null,
      },
    });

    createdElements.push({ id: element.id });
  }

  return createdElements;
}

function findDoorNodeForRoom(roomNodeId: string) {
  const roomDoorNode = Object.values(BOARD_MOVEMENT_NODES).find(
    (node) => node.kind === 'square' && getRoomEntryNodeByDoorNodeId(node.id)?.id === roomNodeId
  );

  if (!roomDoorNode) {
    throw new Error(`No se pudo localizar una puerta para la sala ${roomNodeId}.`);
  }

  return roomDoorNode;
}

async function connectSocketClient(socketUrl: string) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = createSocketClient(socketUrl, {
      autoConnect: false,
      transports: ['websocket'],
    });

    const handleConnect = () => {
      socket.off('connect_error', handleError);
      resolve(socket);
    };
    const handleError = (error: Error) => {
      socket.off('connect', handleConnect);
      reject(error);
    };

    socket.once('connect', handleConnect);
    socket.once('connect_error', handleError);
    socket.connect();
  });
}

async function emitSocketAck<T>(socket: Socket, eventName: string, payload: unknown) {
  return new Promise<T>((resolve) => {
    socket.emit(eventName, payload, resolve);
  });
}

async function waitForSocketEvent<T>(socket: Socket, eventName: string) {
  return new Promise<T>((resolve) => {
    socket.once(eventName, resolve);
  });
}

function buildShortestDistances(startNodeId: string) {
  const distances = new Map<string, number>([[startNodeId, 0]]);
  const queue: string[] = [startNodeId];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId) {
      continue;
    }

    const currentDistance = distances.get(currentNodeId) ?? 0;
    const linkedNodeIds = BOARD_MOVEMENT_CONNECTIONS[currentNodeId] ?? [];

    linkedNodeIds.forEach((linkedNodeId) => {
      if (distances.has(linkedNodeId)) {
        return;
      }

      distances.set(linkedNodeId, currentDistance + 1);
      queue.push(linkedNodeId);
    });
  }

  return Object.fromEntries(distances.entries());
}
