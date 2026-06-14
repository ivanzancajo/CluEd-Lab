import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ColorEquipo,
  EstadoPartida,
  PrismaClient,
  TipoElemento,
  TipoEvento,
} from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import {
  clearSessionResolution,
  finalizeActiveSessionResolution,
  getSessionResolutionSnapshot,
  hasTeamSubmittedResolution,
  loadResolutionSolutionBySessionId,
  recordResolutionSubmission,
  scheduleSessionResolutionCleanup,
  showSessionSolution,
  startFinalChanceResolution,
} from '../src/lib/sessionResolution.js';
import sessionRoutes from '../src/routes/sessionRoutes.js';
import { getTeamSpawnPosition } from '../src/lib/teamSpawnPositions.js';
import { lobbyPresenceStore } from '../src/socket/lobbyPresenceStore.js';
import {
  registerSocketServer,
  type GameResolutionPayload,
  type LobbyPresenceState,
} from '../src/socket/socketServer.js';
import { getTestDatabaseUrl } from './helpers/testDatabase';

type LobbySubscribeResponse =
  | {
      ok: true;
      state: LobbyPresenceState;
    }
  | {
      ok: false;
      error: string;
    };

type GameTriggerResolutionAck =
  | {
      ok: true;
      payload: GameResolutionPayload;
    }
  | {
      ok: false;
      error: string;
    };

type GameFinalChanceSubmissionAck =
  | {
      ok: true;
      payload: GameResolutionPayload;
    }
  | {
      ok: false;
      error: string;
    };

type SessionResponse = {
  item: {
    id: string;
    accessCode: string;
    status: EstadoPartida;
    finishedAt: string | null;
    winnerTeam: {
      id: string;
      name: string;
      color: ColorEquipo;
    } | null;
    resolution: GameResolutionPayload['resolution'] | null;
  };
};

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getTestDatabaseUrl(),
    },
  },
});

describe('SCRUM-93 resolucion y cierre de partida', () => {
  let server: Server;
  let baseUrl = '';
  let socketUrl = '';

  function signAdminToken(payload: object, expiresIn: SignOptions['expiresIn'] = '8h') {
    return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn });
  }

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
      throw new Error('No se pudo resolver el puerto del servidor de pruebas de resolución.');
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

  it('cierra la partida por revelado directo, publica la solución y libera la sesión realtime', async () => {
    const seeded = await seedResolutionSession('RESD01');
    const hostSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', username: 'admin', sub: 'socket-admin' }));
    const redSocket = await connectSocketClient(socketUrl);

    try {
      const hostSubscription = await emitSocketAck<LobbySubscribeResponse>(hostSocket, 'lobby:host-subscribe', {
        sessionId: seeded.sessionId,
      });
      const teamSubscription = await emitSocketAck<LobbySubscribeResponse>(redSocket, 'lobby:team-subscribe', {
        sessionId: seeded.sessionId,
        teamId: seeded.redTeamId,
      });

      expect(hostSubscription.ok).toBe(true);
      expect(teamSubscription.ok).toBe(true);

      const hostShowSolutionPromise = waitForSocketEvent<GameResolutionPayload>(hostSocket, 'game:show-solution');
      const redShowSolutionPromise = waitForSocketEvent<GameResolutionPayload>(redSocket, 'game:show-solution');
      const resolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(hostSocket, 'game:trigger-resolution', {
        sessionId: seeded.sessionId,
        mode: 'DIRECT_REVEAL',
      });
      const [hostShowSolution, redShowSolution] = await Promise.all([hostShowSolutionPromise, redShowSolutionPromise]);

      expect(resolutionResponse.ok).toBe(true);
      if (!resolutionResponse.ok) {
        return;
      }

      expect(resolutionResponse.payload.session.status).toBe(EstadoPartida.FINALIZADA);
      expect(resolutionResponse.payload.resolution).toMatchObject({
        phase: 'MOSTRANDO_SOLUCION',
        mode: 'DIRECT_REVEAL',
        winningTeams: [],
      });
      expect(hostShowSolution.resolution).toMatchObject({
        phase: 'MOSTRANDO_SOLUCION',
        mode: 'DIRECT_REVEAL',
      });
      expect(redShowSolution.resolution.solution).toMatchObject({
        subject: { id: seeded.subjectIds[0], name: 'Sujeto 1' },
        object: { id: seeded.objectIds[0], name: 'Objeto 1' },
        space: { id: seeded.spaceIds[0], name: 'Espacio 1' },
      });

      const sessionResponse = await request('/api/game/sessions/RESD01');
      const sessionBody = (await sessionResponse.json()) as SessionResponse;

      expect(sessionResponse.status).toBe(200);
      expect(sessionBody.item.status).toBe(EstadoPartida.FINALIZADA);
      expect(sessionBody.item.finishedAt).toEqual(expect.any(String));
      expect(sessionBody.item.winnerTeam).toBeNull();
      expect(sessionBody.item.resolution).toMatchObject({
        phase: 'MOSTRANDO_SOLUCION',
        mode: 'DIRECT_REVEAL',
        winningTeams: [],
      });

      const persistedSession = await loadPersistedClosedSession(seeded.sessionId);

      const persistedResolutionEvent = await prisma.evento.findFirstOrThrow({
        where: {
          partidaId: seeded.sessionId,
          eventType: TipoEvento.SISTEMA,
        },
        orderBy: {
          occurredAt: 'desc',
        },
      });

      expect(persistedResolutionEvent.detail).toMatchObject({
        kind: 'GAME_RESOLUTION',
        mode: 'DIRECT_REVEAL',
        winnerTeamId: null,
        winningTeamIds: [],
      });
      expectClosedSessionState(persistedSession, null);

      await wait(600);

      expect(lobbyPresenceStore.getConnectedTeamIds(seeded.sessionId)).toHaveLength(0);

      const postCleanupAck = await emitSocketAck<GameFinalChanceSubmissionAck>(redSocket, 'game:submit-final-chance', {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });

      expect(postCleanupAck.ok).toBe(false);
      if (postCleanupAck.ok) {
        return;
      }

      expect(postCleanupAck.error).toContain('Solo un terminal de equipo puede enviar una acusación final de resolución');
    } finally {
      hostSocket.disconnect();
      redSocket.disconnect();
    }
  });

  it('cierra la última oportunidad con varios ganadores y limpia los recursos realtime de la sesión', async () => {
    const seeded = await seedResolutionSession('RESF01');
    const hostSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', username: 'admin', sub: 'socket-admin' }));
    const redSocket = await connectSocketClient(socketUrl);
    const blueSocket = await connectSocketClient(socketUrl);

    try {
      const hostSubscription = await emitSocketAck<LobbySubscribeResponse>(hostSocket, 'lobby:host-subscribe', {
        sessionId: seeded.sessionId,
      });
      const redSubscription = await emitSocketAck<LobbySubscribeResponse>(redSocket, 'lobby:team-subscribe', {
        sessionId: seeded.sessionId,
        teamId: seeded.redTeamId,
      });
      const blueSubscription = await emitSocketAck<LobbySubscribeResponse>(blueSocket, 'lobby:team-subscribe', {
        sessionId: seeded.sessionId,
        teamId: seeded.blueTeamId,
      });

      expect(hostSubscription.ok).toBe(true);
      expect(redSubscription.ok).toBe(true);
      expect(blueSubscription.ok).toBe(true);

      const redFinalChancePromise = waitForSocketEvent<GameResolutionPayload>(redSocket, 'game:final-chance-start');
      const blueFinalChancePromise = waitForSocketEvent<GameResolutionPayload>(blueSocket, 'game:final-chance-start');
      const startResolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(hostSocket, 'game:trigger-resolution', {
        sessionId: seeded.sessionId,
        mode: 'FINAL_CHANCE',
      });
      const [redFinalChancePayload, blueFinalChancePayload] = await Promise.all([redFinalChancePromise, blueFinalChancePromise]);

      expect(startResolutionResponse.ok).toBe(true);
      if (!startResolutionResponse.ok) {
        return;
      }

      expect(startResolutionResponse.payload.resolution).toMatchObject({
        phase: 'ESPERANDO_RESOLUCION',
        mode: 'FINAL_CHANCE',
      });
      expect(startResolutionResponse.payload.resolution.eligibleTeamIds).toEqual(
        expect.arrayContaining([seeded.redTeamId, seeded.blueTeamId])
      );
      expect(redFinalChancePayload.resolution.phase).toBe('ESPERANDO_RESOLUCION');
      expect(blueFinalChancePayload.resolution.phase).toBe('ESPERANDO_RESOLUCION');

      const firstSubmission = await emitSocketAck<GameFinalChanceSubmissionAck>(redSocket, 'game:submit-final-chance', {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });

      expect(firstSubmission.ok).toBe(true);
      if (!firstSubmission.ok) {
        return;
      }

      expect(firstSubmission.payload.resolution).toMatchObject({
        phase: 'ESPERANDO_RESOLUCION',
        mode: 'FINAL_CHANCE',
      });
      expect(firstSubmission.payload.resolution.submittedTeamIds).toHaveLength(1);

      const hostShowSolutionPromise = waitForSocketEvent<GameResolutionPayload>(hostSocket, 'game:show-solution');
      const redShowSolutionPromise = waitForSocketEvent<GameResolutionPayload>(redSocket, 'game:show-solution');
      const blueShowSolutionPromise = waitForSocketEvent<GameResolutionPayload>(blueSocket, 'game:show-solution');
      const secondSubmission = await emitSocketAck<GameFinalChanceSubmissionAck>(blueSocket, 'game:submit-final-chance', {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });
      const [hostShowSolution, redShowSolution, blueShowSolution] = await Promise.all([
        hostShowSolutionPromise,
        redShowSolutionPromise,
        blueShowSolutionPromise,
      ]);

      expect(secondSubmission.ok).toBe(true);
      if (!secondSubmission.ok) {
        return;
      }

      expect(secondSubmission.payload.session.status).toBe(EstadoPartida.FINALIZADA);
      expect(secondSubmission.payload.resolution).toMatchObject({
        phase: 'MOSTRANDO_SOLUCION',
        mode: 'FINAL_CHANCE',
      });
      expect(secondSubmission.payload.resolution.winningTeams.map((team) => team.id).sort()).toEqual(
        [seeded.redTeamId, seeded.blueTeamId].sort()
      );
      expect(hostShowSolution.resolution.winningTeams).toHaveLength(2);
      expect(redShowSolution.resolution.solution).toMatchObject({
        subject: { id: seeded.subjectIds[0], name: 'Sujeto 1' },
        object: { id: seeded.objectIds[0], name: 'Objeto 1' },
        space: { id: seeded.spaceIds[0], name: 'Espacio 1' },
      });
      expect(blueShowSolution.session.status).toBe(EstadoPartida.FINALIZADA);

      const persistedSession = await prisma.partida.findUniqueOrThrow({
        where: { id: seeded.sessionId },
        select: {
          status: true,
          winnerTeamId: true,
          finishedAt: true,
          currentTurnTeamId: true,
          currentTurnStartedAt: true,
          activeDiceValueOne: true,
          activeDiceValueTwo: true,
          activeDiceRemainingMoves: true,
          activeSuggestionEventId: true,
        },
      });
      const persistedResolutionEvent = await prisma.evento.findFirstOrThrow({
        where: {
          partidaId: seeded.sessionId,
          eventType: TipoEvento.SISTEMA,
        },
        orderBy: {
          occurredAt: 'desc',
        },
      });

      expect(persistedSession).toMatchObject({
        status: EstadoPartida.FINALIZADA,
        winnerTeamId: null,
      });
      expect(persistedSession.finishedAt).toBeInstanceOf(Date);
      expect(persistedResolutionEvent.detail).toMatchObject({
        kind: 'GAME_RESOLUTION',
        mode: 'FINAL_CHANCE',
        winnerTeamId: null,
        winningTeamIds: expect.arrayContaining([seeded.redTeamId, seeded.blueTeamId]),
        missingTeamIds: [],
      });
      expectClosedSessionState(persistedSession, null);

      const sessionResponse = await request('/api/game/sessions/RESF01');
      const sessionBody = (await sessionResponse.json()) as SessionResponse;

      expect(sessionResponse.status).toBe(200);
      expect(sessionBody.item.status).toBe(EstadoPartida.FINALIZADA);
      expect(sessionBody.item.winnerTeam).toBeNull();
      expect(sessionBody.item.resolution).toMatchObject({
        phase: 'MOSTRANDO_SOLUCION',
        mode: 'FINAL_CHANCE',
      });
      expect(sessionBody.item.resolution?.winningTeams.map((team) => team.id).sort()).toEqual(
        [seeded.redTeamId, seeded.blueTeamId].sort()
      );

      await wait(600);

      expect(lobbyPresenceStore.getConnectedTeamIds(seeded.sessionId)).toHaveLength(0);

      const postCleanupAck = await emitSocketAck<GameFinalChanceSubmissionAck>(redSocket, 'game:submit-final-chance', {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });

      expect(postCleanupAck.ok).toBe(false);
      if (postCleanupAck.ok) {
        return;
      }

      expect(postCleanupAck.error).toContain('Solo un terminal de equipo puede enviar una acusación final de resolución');
    } finally {
      hostSocket.disconnect();
      redSocket.disconnect();
      blueSocket.disconnect();
    }
  });

  it('persiste un ganador único en la última oportunidad, limpia el estado de partida y rechaza envíos duplicados', async () => {
    const seeded = await seedResolutionSession('RESU01');
    const hostSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', username: 'admin', sub: 'socket-admin' }));
    const redSocket = await connectSocketClient(socketUrl);
    const blueSocket = await connectSocketClient(socketUrl);

    try {
      const hostSubscription = await emitSocketAck<LobbySubscribeResponse>(hostSocket, 'lobby:host-subscribe', {
        sessionId: seeded.sessionId,
      });
      const redSubscription = await emitSocketAck<LobbySubscribeResponse>(redSocket, 'lobby:team-subscribe', {
        sessionId: seeded.sessionId,
        teamId: seeded.redTeamId,
      });
      const blueSubscription = await emitSocketAck<LobbySubscribeResponse>(blueSocket, 'lobby:team-subscribe', {
        sessionId: seeded.sessionId,
        teamId: seeded.blueTeamId,
      });

      expect(hostSubscription.ok).toBe(true);
      expect(redSubscription.ok).toBe(true);
      expect(blueSubscription.ok).toBe(true);

      const startResolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(hostSocket, 'game:trigger-resolution', {
        sessionId: seeded.sessionId,
        mode: 'FINAL_CHANCE',
      });

      expect(startResolutionResponse.ok).toBe(true);
      if (!startResolutionResponse.ok) {
        return;
      }

      const firstSubmission = await emitSocketAck<GameFinalChanceSubmissionAck>(redSocket, 'game:submit-final-chance', {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });

      expect(firstSubmission.ok).toBe(true);
      if (!firstSubmission.ok) {
        return;
      }

      const duplicateSubmission = await emitSocketAck<GameFinalChanceSubmissionAck>(redSocket, 'game:submit-final-chance', {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });

      expect(duplicateSubmission.ok).toBe(false);
      if (duplicateSubmission.ok) {
        return;
      }

      expect(duplicateSubmission.error).toContain('El equipo ya ha enviado su acusación final y debe esperar al resto.');

      const hostShowSolutionPromise = waitForSocketEvent<GameResolutionPayload>(hostSocket, 'game:show-solution');
      const redShowSolutionPromise = waitForSocketEvent<GameResolutionPayload>(redSocket, 'game:show-solution');
      const blueShowSolutionPromise = waitForSocketEvent<GameResolutionPayload>(blueSocket, 'game:show-solution');
      const secondSubmission = await emitSocketAck<GameFinalChanceSubmissionAck>(blueSocket, 'game:submit-final-chance', {
        subjectElementId: seeded.subjectIds[1],
        objectElementId: seeded.objectIds[1],
        spaceElementId: seeded.spaceIds[1],
      });
      const [hostShowSolution, redShowSolution, blueShowSolution] = await Promise.all([
        hostShowSolutionPromise,
        redShowSolutionPromise,
        blueShowSolutionPromise,
      ]);

      expect(secondSubmission.ok).toBe(true);
      if (!secondSubmission.ok) {
        return;
      }

      expect(secondSubmission.payload.resolution.winningTeams.map((team) => team.id)).toEqual([seeded.redTeamId]);
      expect(hostShowSolution.resolution.winningTeams.map((team) => team.id)).toEqual([seeded.redTeamId]);
      expect(redShowSolution.session.winnerTeam?.id).toBe(seeded.redTeamId);
      expect(blueShowSolution.session.status).toBe(EstadoPartida.FINALIZADA);

      const persistedSession = await loadPersistedClosedSession(seeded.sessionId);
      const persistedResolutionEvent = await prisma.evento.findFirstOrThrow({
        where: {
          partidaId: seeded.sessionId,
          eventType: TipoEvento.SISTEMA,
        },
        orderBy: {
          occurredAt: 'desc',
        },
      });
      const sessionResponse = await request('/api/game/sessions/RESU01');
      const sessionBody = (await sessionResponse.json()) as SessionResponse;

      expect(sessionResponse.status).toBe(200);
      expect(sessionBody.item.winnerTeam?.id).toBe(seeded.redTeamId);
      expect(sessionBody.item.resolution?.winningTeams.map((team) => team.id)).toEqual([seeded.redTeamId]);
      expectClosedSessionState(persistedSession, seeded.redTeamId);
      expect(persistedResolutionEvent.detail).toMatchObject({
        kind: 'GAME_RESOLUTION',
        mode: 'FINAL_CHANCE',
        winnerTeamId: seeded.redTeamId,
        winningTeamIds: [seeded.redTeamId],
        submittedTeamIds: expect.arrayContaining([seeded.redTeamId, seeded.blueTeamId]),
        missingTeamIds: [],
      });

      await wait(600);

      expect(lobbyPresenceStore.getConnectedTeamIds(seeded.sessionId)).toHaveLength(0);
    } finally {
      hostSocket.disconnect();
      redSocket.disconnect();
      blueSocket.disconnect();
    }
  });

  it('requiere autenticación de administrador para abrir la resolución', async () => {
    const seeded = await seedResolutionSession('RESA01');
    const teamSocket = await connectSocketClient(socketUrl);

    try {
      const teamSubscription = await emitSocketAck<LobbySubscribeResponse>(teamSocket, 'lobby:team-subscribe', {
        sessionId: seeded.sessionId,
        teamId: seeded.redTeamId,
      });

      expect(teamSubscription.ok).toBe(true);

      const resolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(teamSocket, 'game:trigger-resolution', {
        sessionId: seeded.sessionId,
        mode: 'DIRECT_REVEAL',
      });

      expect(resolutionResponse.ok).toBe(false);
      if (resolutionResponse.ok) {
        return;
      }

      expect(resolutionResponse.error).toContain('Acceso denegado. Se requiere autenticación de administrador.');
    } finally {
      teamSocket.disconnect();
    }
  });

  it('bloquea la apertura de la resolución con sugerencia pendiente o sin equipos elegibles', async () => {
    const pendingSeed = await seedResolutionSession('RESP01');
    const pendingHostSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', username: 'admin', sub: 'socket-admin' }));

    try {
      const hostSubscription = await emitSocketAck<LobbySubscribeResponse>(pendingHostSocket, 'lobby:host-subscribe', {
        sessionId: pendingSeed.sessionId,
      });

      expect(hostSubscription.ok).toBe(true);

      const suggestionEvent = await prisma.evento.create({
        data: {
          partidaId: pendingSeed.sessionId,
          eventType: TipoEvento.SUGERENCIA,
          detail: {
            version: 1,
            kind: 'PENDING_SUGGESTION_TEST',
          },
        },
      });

      await prisma.partida.update({
        where: { id: pendingSeed.sessionId },
        data: {
          activeSuggestionEventId: suggestionEvent.id,
        },
      });

      const pendingResolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(pendingHostSocket, 'game:trigger-resolution', {
        sessionId: pendingSeed.sessionId,
        mode: 'FINAL_CHANCE',
      });

      expect(pendingResolutionResponse.ok).toBe(false);
      if (pendingResolutionResponse.ok) {
        return;
      }

      expect(pendingResolutionResponse.error).toContain('No se puede abrir la resolución mientras exista una sugerencia pendiente de refutación.');
    } finally {
      pendingHostSocket.disconnect();
    }

    const noEligibleSeed = await seedResolutionSession('RESN01');
    const noEligibleHostSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', username: 'admin', sub: 'socket-admin' }));

    try {
      const hostSubscription = await emitSocketAck<LobbySubscribeResponse>(noEligibleHostSocket, 'lobby:host-subscribe', {
        sessionId: noEligibleSeed.sessionId,
      });

      expect(hostSubscription.ok).toBe(true);

      await prisma.equipo.updateMany({
        where: {
          partidaId: noEligibleSeed.sessionId,
        },
        data: {
          falseAccusation: true,
        },
      });

      const noEligibleResolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(noEligibleHostSocket, 'game:trigger-resolution', {
        sessionId: noEligibleSeed.sessionId,
        mode: 'FINAL_CHANCE',
      });

      expect(noEligibleResolutionResponse.ok).toBe(false);
      if (noEligibleResolutionResponse.ok) {
        return;
      }

      expect(noEligibleResolutionResponse.error).toContain('No hay equipos activos disponibles para la última oportunidad.');
    } finally {
      noEligibleHostSocket.disconnect();
    }
  });

  it('expone la resolución transitoria en snapshots REST y rechaza acusaciones antes de activarla', async () => {
    const seeded = await seedResolutionSession('RESR01');
    const hostSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', username: 'admin', sub: 'socket-admin' }));
    const redSocket = await connectSocketClient(socketUrl);
    const blueSocket = await connectSocketClient(socketUrl);

    try {
      const hostSubscription = await emitSocketAck<LobbySubscribeResponse>(hostSocket, 'lobby:host-subscribe', {
        sessionId: seeded.sessionId,
      });
      const redSubscription = await emitSocketAck<LobbySubscribeResponse>(redSocket, 'lobby:team-subscribe', {
        sessionId: seeded.sessionId,
        teamId: seeded.redTeamId,
      });
      const blueSubscription = await emitSocketAck<LobbySubscribeResponse>(blueSocket, 'lobby:team-subscribe', {
        sessionId: seeded.sessionId,
        teamId: seeded.blueTeamId,
      });

      expect(hostSubscription.ok).toBe(true);
      expect(redSubscription.ok).toBe(true);
      expect(blueSubscription.ok).toBe(true);

      const prematureSubmission = await emitSocketAck<GameFinalChanceSubmissionAck>(redSocket, 'game:submit-final-chance', {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });

      expect(prematureSubmission.ok).toBe(false);
      if (prematureSubmission.ok) {
        return;
      }

      expect(prematureSubmission.error).toContain('La fase de resolución no está activa para esta sesión.');

      const startResolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(hostSocket, 'game:trigger-resolution', {
        sessionId: seeded.sessionId,
        mode: 'FINAL_CHANCE',
      });

      expect(startResolutionResponse.ok).toBe(true);
      if (!startResolutionResponse.ok) {
        return;
      }

      const waitingSessionResponse = await request('/api/game/sessions/RESR01');
      const waitingSessionBody = (await waitingSessionResponse.json()) as SessionResponse;

      expect(waitingSessionResponse.status).toBe(200);
      expect(waitingSessionBody.item.status).toBe(EstadoPartida.EN_CURSO);
      expect(waitingSessionBody.item.resolution).toMatchObject({
        phase: 'ESPERANDO_RESOLUCION',
        mode: 'FINAL_CHANCE',
      });
      expect(waitingSessionBody.item.resolution?.deadlineAt).toEqual(expect.any(String));
      expect(waitingSessionBody.item.resolution?.eligibleTeamIds.sort()).toEqual(
        [seeded.redTeamId, seeded.blueTeamId].sort()
      );
      expect(waitingSessionBody.item.resolution?.submittedTeamIds).toEqual([]);

      const firstSubmission = await emitSocketAck<GameFinalChanceSubmissionAck>(redSocket, 'game:submit-final-chance', {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });

      expect(firstSubmission.ok).toBe(true);
      if (!firstSubmission.ok) {
        return;
      }

      const updatedSessionResponse = await request('/api/game/sessions/RESR01');
      const updatedSessionBody = (await updatedSessionResponse.json()) as SessionResponse;

      expect(updatedSessionResponse.status).toBe(200);
      expect(updatedSessionBody.item.resolution).toMatchObject({
        phase: 'ESPERANDO_RESOLUCION',
        mode: 'FINAL_CHANCE',
      });
      expect(updatedSessionBody.item.resolution?.submittedTeamIds).toEqual([seeded.redTeamId]);
    } finally {
      clearSessionResolution(seeded.sessionId);
      hostSocket.disconnect();
      redSocket.disconnect();
      blueSocket.disconnect();
    }
  });

  it('rechaza órdenes de resolución inválidas o sobre partidas que no están en curso', async () => {
    const seeded = await seedResolutionSession('RESI01');
    const hostSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', username: 'admin', sub: 'socket-admin' }));

    try {
      const hostSubscription = await emitSocketAck<LobbySubscribeResponse>(hostSocket, 'lobby:host-subscribe', {
        sessionId: seeded.sessionId,
      });

      expect(hostSubscription.ok).toBe(true);

      const invalidResolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(hostSocket, 'game:trigger-resolution', {
        sessionId: seeded.sessionId,
        mode: 'INVALID_MODE',
      });

      expect(invalidResolutionResponse.ok).toBe(false);
      if (invalidResolutionResponse.ok) {
        return;
      }

      expect(invalidResolutionResponse.error).toContain('El modo de resolución indicado no es válido.');

      await prisma.partida.update({
        where: { id: seeded.sessionId },
        data: {
          status: EstadoPartida.PAUSADA,
        },
      });

      const pausedResolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(hostSocket, 'game:trigger-resolution', {
        sessionId: seeded.sessionId,
        mode: 'DIRECT_REVEAL',
      });

      expect(pausedResolutionResponse.ok).toBe(false);
      if (pausedResolutionResponse.ok) {
        return;
      }

      expect(pausedResolutionResponse.error).toContain('La resolución solo puede activarse cuando la partida está en curso.');
    } finally {
      hostSocket.disconnect();
    }
  });

  it('rechaza el revelado directo si la sesión no tiene skin o si la solución no pertenece a la configuración activa', async () => {
    const noSkinSeed = await seedResolutionSession('RESSK1');
    const noSkinHostSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', username: 'admin', sub: 'socket-admin' }));

    try {
      const hostSubscription = await emitSocketAck<LobbySubscribeResponse>(noSkinHostSocket, 'lobby:host-subscribe', {
        sessionId: noSkinSeed.sessionId,
      });

      expect(hostSubscription.ok).toBe(true);

      await prisma.partida.update({
        where: { id: noSkinSeed.sessionId },
        data: {
          skinId: null,
        },
      });

      const noSkinResolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(noSkinHostSocket, 'game:trigger-resolution', {
        sessionId: noSkinSeed.sessionId,
        mode: 'DIRECT_REVEAL',
      });

      expect(noSkinResolutionResponse.ok).toBe(false);
      if (noSkinResolutionResponse.ok) {
        return;
      }

      expect(noSkinResolutionResponse.error).toContain('La sesión no tiene una configuración válida asociada.');
    } finally {
      noSkinHostSocket.disconnect();
    }

    const inconsistentSeed = await seedResolutionSession('RESSK2');
    const inconsistentHostSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', username: 'admin', sub: 'socket-admin' }));

    try {
      const hostSubscription = await emitSocketAck<LobbySubscribeResponse>(inconsistentHostSocket, 'lobby:host-subscribe', {
        sessionId: inconsistentSeed.sessionId,
      });

      expect(hostSubscription.ok).toBe(true);

      const straySubject = await prisma.elemento.create({
        data: {
          name: 'Sujeto ajeno',
          kind: TipoElemento.SUJETO,
          imageUrl: '',
        },
      });

      await prisma.solucion.update({
        where: { id: inconsistentSeed.solutionId },
        data: {
          subjectElementId: straySubject.id,
        },
      });

      const inconsistentResolutionResponse = await emitSocketAck<GameTriggerResolutionAck>(inconsistentHostSocket, 'game:trigger-resolution', {
        sessionId: inconsistentSeed.sessionId,
        mode: 'DIRECT_REVEAL',
      });

      expect(inconsistentResolutionResponse.ok).toBe(false);
      if (inconsistentResolutionResponse.ok) {
        return;
      }

      expect(inconsistentResolutionResponse.error).toContain(
        'La solución contiene un sujeto que no pertenece a la configuración activa.'
      );
    } finally {
      inconsistentHostSocket.disconnect();
    }
  });

  it('finaliza la resolución parcial conservando missingTeamIds y el ganador único cuando expira la espera', async () => {
    const seeded = await seedResolutionSession('RESM01');

    try {
      const resolution = startFinalChanceResolution({
        sessionId: seeded.sessionId,
        eligibleTeamIds: [seeded.redTeamId, seeded.blueTeamId],
        durationMs: 1_000,
      });

      expect(resolution).toMatchObject({
        phase: 'ESPERANDO_RESOLUCION',
        mode: 'FINAL_CHANCE',
      });

      const updatedResolution = recordResolutionSubmission(seeded.sessionId, seeded.redTeamId, {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });

      expect(updatedResolution.submittedTeamIds).toEqual([seeded.redTeamId]);

      const finalizedResolution = await finalizeActiveSessionResolution(prisma, seeded.sessionId);
      const persistedSession = await loadPersistedClosedSession(seeded.sessionId);
      const persistedResolutionEvent = await prisma.evento.findFirstOrThrow({
        where: {
          partidaId: seeded.sessionId,
          eventType: TipoEvento.SISTEMA,
        },
        orderBy: {
          occurredAt: 'desc',
        },
      });

      expect(finalizedResolution.mode).toBe('FINAL_CHANCE');
      expect(finalizedResolution.winningTeams.map((team) => team.id)).toEqual([seeded.redTeamId]);
      expect(finalizedResolution.missingTeamIds).toEqual([seeded.blueTeamId]);
      expect(finalizedResolution.resolution).toMatchObject({
        phase: 'MOSTRANDO_SOLUCION',
        mode: 'FINAL_CHANCE',
      });
      expectClosedSessionState(persistedSession, seeded.redTeamId);
      expect(persistedResolutionEvent.detail).toMatchObject({
        kind: 'GAME_RESOLUTION',
        mode: 'FINAL_CHANCE',
        winnerTeamId: seeded.redTeamId,
        winningTeamIds: [seeded.redTeamId],
        submittedTeamIds: [seeded.redTeamId],
        missingTeamIds: [seeded.blueTeamId],
      });
    } finally {
      clearSessionResolution(seeded.sessionId);
    }
  });

  it('mantiene el snapshot transitorio de resolución, evita dobles aperturas y rechaza equipos no elegibles', async () => {
    const seeded = await seedResolutionSession('RESS01');

    try {
      const initialResolution = startFinalChanceResolution({
        sessionId: seeded.sessionId,
        eligibleTeamIds: [seeded.redTeamId],
        durationMs: 5_000,
      });

      expect(initialResolution.eligibleTeamIds).toEqual([seeded.redTeamId]);
      expect(hasTeamSubmittedResolution(seeded.sessionId, seeded.redTeamId)).toBe(false);
      expect(getSessionResolutionSnapshot(seeded.sessionId)).toMatchObject({
        phase: 'ESPERANDO_RESOLUCION',
        mode: 'FINAL_CHANCE',
        eligibleTeamIds: [seeded.redTeamId],
        submittedTeamIds: [],
      });

      expect(() =>
        startFinalChanceResolution({
          sessionId: seeded.sessionId,
          eligibleTeamIds: [seeded.redTeamId],
          durationMs: 5_000,
        })
      ).toThrow('La sesión ya tiene una fase de resolución activa.');

      expect(() =>
        recordResolutionSubmission(seeded.sessionId, seeded.blueTeamId, {
          subjectElementId: seeded.subjectIds[0],
          objectElementId: seeded.objectIds[0],
          spaceElementId: seeded.spaceIds[0],
        })
      ).toThrow('El equipo no puede participar en la fase de resolución actual.');

      const updatedResolution = recordResolutionSubmission(seeded.sessionId, seeded.redTeamId, {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      });

      expect(updatedResolution.submittedTeamIds).toEqual([seeded.redTeamId]);
      expect(hasTeamSubmittedResolution(seeded.sessionId, seeded.redTeamId)).toBe(true);

      scheduleSessionResolutionCleanup(seeded.sessionId, 0);
      await wait(20);

      expect(getSessionResolutionSnapshot(seeded.sessionId)).toBeNull();
    } finally {
      clearSessionResolution(seeded.sessionId);
    }
  });

  it('rechaza finalizar una resolución inexistente o cerrar una partida fuera de curso', async () => {
    const missingStateSeed = await seedResolutionSession('RESX01');
    const pausedSeed = await seedResolutionSession('RESX02');

    await expect(finalizeActiveSessionResolution(prisma, missingStateSeed.sessionId)).rejects.toThrow(
      'La sesión no tiene una fase de resolución activa.'
    );

    try {
      startFinalChanceResolution({
        sessionId: pausedSeed.sessionId,
        eligibleTeamIds: [pausedSeed.redTeamId, pausedSeed.blueTeamId],
        durationMs: 1_000,
      });

      await prisma.partida.update({
        where: { id: pausedSeed.sessionId },
        data: {
          status: EstadoPartida.PAUSADA,
        },
      });

      await expect(finalizeActiveSessionResolution(prisma, pausedSeed.sessionId)).rejects.toThrow(
        'La sesión no está en un estado válido para cerrar la resolución.'
      );
    } finally {
      clearSessionResolution(pausedSeed.sessionId);
    }
  });

  it('rechaza acusaciones finales sin fase activa o cuando la solución ya se está mostrando', async () => {
    const seeded = await seedResolutionSession('RESPHS');

    expect(() =>
      recordResolutionSubmission(seeded.sessionId, seeded.redTeamId, {
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      })
    ).toThrow('La fase de resolución no está activa para esta sesión.');

    try {
      const solution = await loadResolutionSolutionBySessionId(prisma, seeded.sessionId);

      showSessionSolution({
        sessionId: seeded.sessionId,
        mode: 'DIRECT_REVEAL',
        solution,
      });

      expect(() =>
        recordResolutionSubmission(seeded.sessionId, seeded.redTeamId, {
          subjectElementId: seeded.subjectIds[0],
          objectElementId: seeded.objectIds[0],
          spaceElementId: seeded.spaceIds[0],
        })
      ).toThrow('La sesión no está aceptando acusaciones finales en este momento.');
    } finally {
      clearSessionResolution(seeded.sessionId);
    }
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
});

async function seedResolutionSession(accessCode: string) {
  const timestamp = Date.now();
  const skin = await prisma.cluEdSkin.create({
    data: {
      name: `Skin ${accessCode}`,
      objective: 'Validar resolución y cierre.',
      imageUrl: '',
      context: JSON.stringify({
        version: 1,
        gameTitle: 'Laboratorio de Resolucion',
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

  const subjects = await createCollectionItems(skin.id, TipoElemento.SUJETO, 'Sujeto', 2);
  const objects = await createCollectionItems(skin.id, TipoElemento.OBJETO, 'Objeto', 2);
  const spaces = await createCollectionItems(skin.id, TipoElemento.ESPACIO, 'Espacio', 2);

  const solution = await prisma.solucion.create({
    data: {
      subjectElementId: subjects[0].id,
      objectElementId: objects[0].id,
      spaceElementId: spaces[0].id,
    },
  });

  const session = await prisma.partida.create({
    data: {
      accessCode,
      status: EstadoPartida.EN_CURSO,
      startedAt: new Date('2026-05-15T10:00:00.000Z'),
      durationMinutes: 45,
      activeDiceValueOne: 4,
      activeDiceValueTwo: 6,
      activeDiceRemainingMoves: 5,
      skinId: skin.id,
      solutionId: solution.id,
    },
  });

  const redTeam = await prisma.equipo.create({
    data: {
      partidaId: session.id,
      color: ColorEquipo.ROJO,
      name: 'Equipo Rojo',
      ...getTeamSpawnPosition(ColorEquipo.ROJO),
    },
  });
  const blueTeam = await prisma.equipo.create({
    data: {
      partidaId: session.id,
      color: ColorEquipo.AZUL,
      name: 'Equipo Azul',
      ...getTeamSpawnPosition(ColorEquipo.AZUL),
    },
  });

  await prisma.partida.update({
    where: { id: session.id },
    data: {
      currentTurnTeamId: redTeam.id,
      currentTurnStartedAt: new Date('2026-05-15T10:01:00.000Z'),
    },
  });

  return {
    sessionId: session.id,
    solutionId: solution.id,
    redTeamId: redTeam.id,
    blueTeamId: blueTeam.id,
    subjectIds: subjects.map((subject) => subject.id),
    objectIds: objects.map((object) => object.id),
    spaceIds: spaces.map((space) => space.id),
  };
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

async function connectSocketClient(socketUrl: string, token?: string) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = createSocketClient(socketUrl, {
      autoConnect: false,
      auth: token ? { token } : {},
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

async function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function loadPersistedClosedSession(sessionId: string) {
  return prisma.partida.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      status: true,
      winnerTeamId: true,
      finishedAt: true,
      currentTurnTeamId: true,
      currentTurnStartedAt: true,
      activeDiceValueOne: true,
      activeDiceValueTwo: true,
      activeDiceRemainingMoves: true,
      activeSuggestionEventId: true,
    },
  });
}

function expectClosedSessionState(
  session: Awaited<ReturnType<typeof loadPersistedClosedSession>>,
  winnerTeamId: string | null
) {
  expect(session).toMatchObject({
    status: EstadoPartida.FINALIZADA,
    winnerTeamId,
    currentTurnTeamId: null,
    currentTurnStartedAt: null,
    activeDiceValueOne: null,
    activeDiceValueTwo: null,
    activeDiceRemainingMoves: null,
    activeSuggestionEventId: null,
  });
  expect(session.finishedAt).toBeInstanceOf(Date);
}