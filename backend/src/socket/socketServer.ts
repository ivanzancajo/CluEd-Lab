import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { EstadoPartida, type ColorEquipo } from '@prisma/client';
import { Server, type Socket } from 'socket.io';
import {
  gameFinalChanceAccusationCommandSchema,
  gameTriggerResolutionCommandSchema,
  gameRefuteCommandSchema,
  gameSuggestCommandSchema,
  gameStatusCommandSchema,
  hostLobbySubscriptionSchema,
  startGameCommandSchema,
  teamSecretPassageCommandSchema,
  teamLobbySubscriptionSchema,
  type GameFinalChanceAccusationCommandInput,
  type GameTriggerResolutionCommandInput,
  type GameRefuteCommandInput,
  type GameSuggestCommandInput,
  type GameStatusCommandInput,
  type HostLobbySubscriptionInput,
  type StartGameCommandInput,
  type TeamSecretPassageCommandInput,
  type TeamLobbySubscriptionInput,
} from '../lib/lobbySocketSchemas.js';
import { HttpError } from '../lib/http.js';
import {
  loadSessionSnapshotById,
  type SessionSnapshot,
  type SessionTeamSnapshot,
  type SessionTurnSnapshot,
} from '../lib/sessionSnapshots.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { verifyAdminToken, type AuthTokenPayload } from '../middleware/auth.js';
import { lobbyPresenceStore } from './lobbyPresenceStore.js';
import { endSessionByGM, loadTeamTerminalStateByAccessCode, pauseSession, resumeSession, startSessionByAccessCode } from '../lib/sessionGameplay.js';
import { findBoardMovementNodeByPosition, isSecretPassageMoveValid } from '../lib/sessionMovement.js';
import { BOARD_MOVEMENT_NODES } from '../lib/boardGraph.js';
import {
  finalizeActiveSessionResolution,
  loadResolutionSolutionBySessionId,
  recordResolutionSubmission,
  scheduleSessionResolutionCleanup,
  showSessionSolution,
  startFinalChanceResolution,
  type ResolutionMode,
  type SessionResolutionSnapshot,
} from '../lib/sessionResolution.js';
import {
  createSuggestionBySessionId,
  refuteActiveSuggestionBySessionId,
  type SuggestionElementSnapshot,
  type SuggestionSummary,
} from '../lib/sessionSuggestion.js';

type LobbyPresenceTeam = SessionTeamSnapshot & {
  connected: boolean;
  lastSeenAt: number | null;
};

export type LobbyPresenceState = {
  sessionId: string;
  accessCode: string;
  status: EstadoPartida;
  startedAt: string | null;
  durationSeconds: number;
  remainingSeconds: number;
  teams: LobbyPresenceTeam[];
  turn: SessionTurnSnapshot | null;
  activeSuggestion: SuggestionSummary | null;
  resolution: SessionResolutionSnapshot | null;
  publicCards: import('../lib/sessionCards.js').TeamHandCard[];
  updatedAt: number;
};

export type LobbyEvent = {
  id: string;
  type: 'system' | 'team-connected' | 'team-disconnected' | 'final-accusation-verdict';
  message: string;
  occurredAt: number;
  teamColor?: ColorEquipo | undefined;
  teamId?: string | undefined;
  accusationVerdict?: import('../lib/sessionAccusation.js').FinalAccusationVerdict | undefined;
};

export type GameStartedPayload = {
  session: SessionSnapshot;
  occurredAt: number;
};

export type GameSetupCardsPayload = {
  hand: import('../lib/sessionCards.js').TeamHandCard[];
  occurredAt: number;
};

export type GameStatusChangedPayload = {
  session: SessionSnapshot;
  status: EstadoPartida;
  occurredAt: number;
};

export type GameResolutionPayload = {
  session: SessionSnapshot;
  resolution: SessionResolutionSnapshot;
  occurredAt: number;
};

type LobbySubscribeAck =
  | {
      ok: true;
      state: LobbyPresenceState;
    }
  | {
      ok: false;
      error: string;
    };

type StartGameAck =
  | {
      ok: true;
      payload: GameStartedPayload;
    }
  | {
      ok: false;
      error: string;
    };

type TeamSecretPassageAck =
  | {
      ok: true;
      occurredAt: number;
    }
  | {
      ok: false;
      error: string;
    };

export type GameSuggestAck =
  | {
      ok: true;
      status: 'waiting-refutation' | 'resolved-without-refutation';
      occurredAt: number;
    }
  | {
      ok: false;
      error: string;
    };

export type GameRefuteAck =
  | {
      ok: true;
      occurredAt: number;
    }
  | {
      ok: false;
      error: string;
    };

export type GameRefuteRequestPayload = {
  suggestion: SuggestionSummary;
  matchingCards: SuggestionElementSnapshot[];
  occurredAt: number;
};

export type GameRefutationResultPayload = {
  suggestion: SuggestionSummary;
  outcome: 'REFUTED' | 'UNREFUTED';
  occurredAt: number;
  shownCard?: SuggestionElementSnapshot | undefined;
  shownByTeamId?: string | undefined;
  shownByTeamName?: string | undefined;
};

type GameStatusChangeAck =
  | {
      ok: true;
      payload: GameStatusChangedPayload;
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

type LobbyClientToServerEvents = {
  'lobby:host-subscribe': (payload: unknown, acknowledge?: (response: LobbySubscribeAck) => void) => void;
  'lobby:team-subscribe': (payload: unknown, acknowledge?: (response: LobbySubscribeAck) => void) => void;
  startGame: (payload: unknown, acknowledge?: (response: StartGameAck) => void) => void;
  'game:pause': (payload: unknown, acknowledge?: (response: GameStatusChangeAck) => void) => void;
  'game:resume': (payload: unknown, acknowledge?: (response: GameStatusChangeAck) => void) => void;
  'game:trigger-resolution': (payload: unknown, acknowledge?: (response: GameTriggerResolutionAck) => void) => void;
  'lobby:team-heartbeat': () => void;
  'turn:use-secret-passage': (payload: unknown, acknowledge?: (response: TeamSecretPassageAck) => void) => void;
  'game:suggest': (payload: unknown, acknowledge?: (response: GameSuggestAck) => void) => void;
  'game:refute': (payload: unknown, acknowledge?: (response: GameRefuteAck) => void) => void;
  'game:submit-final-chance': (payload: unknown, acknowledge?: (response: GameFinalChanceSubmissionAck) => void) => void;
};

type LobbySocketData = {
  sessionId?: string;
  teamId?: string;
  user?: AuthTokenPayload;
  role?: 'host' | 'team';
};

type LobbySocket = Socket<
  LobbyClientToServerEvents,
  {
    'lobby:presence-updated': (state: LobbyPresenceState) => void;
    'lobby:event': (event: LobbyEvent) => void;
    gameStarted: (payload: GameStartedPayload) => void;
    'game:status-changed': (payload: GameStatusChangedPayload) => void;
    'game:final-chance-start': (payload: GameResolutionPayload) => void;
    'game:show-solution': (payload: GameResolutionPayload) => void;
    'game:refute-request': (payload: GameRefuteRequestPayload) => void;
    'game:refutation-result': (payload: GameRefutationResultPayload) => void;
    'game:setup-cards': (payload: GameSetupCardsPayload) => void;
  },
  Record<string, never>,
  LobbySocketData
>;

const LOBBY_ROOM_PREFIX = 'lobby:session:';
const TEAM_ROOM_PREFIX = 'lobby:session-team:';
const FINAL_CHANCE_DURATION_MS = 90 * 1000;
const CLOSED_SESSION_REALTIME_CLEANUP_DELAY_MS = 250;
const CLOSED_SESSION_RESOLUTION_RETENTION_MS = 2 * 60 * 1000;
const REALTIME_ENABLED_STATES: ReadonlySet<EstadoPartida> = new Set<EstadoPartida>([
  EstadoPartida.LOBBY,
  EstadoPartida.EN_CURSO,
  EstadoPartida.PAUSADA,
]);

let activeIo: Server | null = null;

export function registerSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.socketIoCorsOrigins,
      credentials: true,
    },
  });

  activeIo = io;

  io.on('connection', (socket) => {
    registerLobbyHandlers(io, socket as LobbySocket);
  });

  return io;
}

function registerLobbyHandlers(io: Server, socket: LobbySocket) {
  socket.on('lobby:host-subscribe', async (payload: unknown, acknowledge?: (response: LobbySubscribeAck) => void) => {
    try {
      const input = parseHostSubscription(payload);
      const user = requireAdminUser(socket);
      const state = await buildLobbyPresenceState(input.sessionId);

      ensureRealtimeStateAvailable(state.status);

      socket.data.role = 'host';
      socket.data.sessionId = input.sessionId;
      socket.data.user = user;
      await socket.join(getLobbyRoom(input.sessionId));

      acknowledge?.({ ok: true, state });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('lobby:team-subscribe', async (payload: unknown, acknowledge?: (response: LobbySubscribeAck) => void) => {
    try {
      const input = parseTeamSubscription(payload);
      const stateBeforeConnect = await buildLobbyPresenceState(input.sessionId);

      ensureRealtimeStateAvailable(stateBeforeConnect.status);

      const team = await prisma.equipo.findFirst({
        where: {
          id: input.teamId,
          partidaId: input.sessionId,
        },
        select: {
          id: true,
          color: true,
          name: true,
        },
      });

      if (!team) {
        throw new HttpError(404, 'El equipo indicado no pertenece a la sesión seleccionada.');
      }

      socket.data.role = 'team';
      socket.data.sessionId = input.sessionId;
      socket.data.teamId = input.teamId;
      await socket.join(getLobbyRoom(input.sessionId));
      await socket.join(getTeamRoom(input.sessionId, input.teamId));

      lobbyPresenceStore.connectTeam(input.sessionId, input.teamId, socket.id);

      const state = await buildLobbyPresenceState(input.sessionId);
      acknowledge?.({ ok: true, state });

      broadcastLobbyUpdate(io, state);
      broadcastLobbyEvent(io, input.sessionId, {
        id: randomUUID(),
        type: 'team-connected',
        message: buildConnectionMessage(team.name, state.status, 'connected'),
        occurredAt: Date.now(),
        teamColor: team.color,
        teamId: team.id,
      });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('startGame', async (payload: unknown, acknowledge?: (response: StartGameAck) => void) => {
    try {
      const input = parseStartGameCommand(payload);
      requireAdminUser(socket);

      const session = await prisma.$transaction(
        (tx) => startSessionByAccessCode(tx, input.accessCode),
        { isolationLevel: 'Serializable' }
      );
      const gameStartedPayload = buildGameStartedPayload(session);

      for (const team of session.teams) {
        const terminalState = await loadTeamTerminalStateByAccessCode(prisma, input.accessCode, team.id);
        io.to(getTeamRoom(session.id, team.id)).emit('game:setup-cards', {
          hand: terminalState.hand,
          occurredAt: gameStartedPayload.occurredAt,
        });
      }

      broadcastLobbyUpdate(io, await buildLobbyPresenceState(session.id));
      broadcastLobbyEvent(io, session.id, {
        id: randomUUID(),
        type: 'system',
        message: 'El Game Master ha iniciado la partida.',
        occurredAt: gameStartedPayload.occurredAt,
      });
      broadcastGameStarted(io, session.id, gameStartedPayload);

      acknowledge?.({ ok: true, payload: gameStartedPayload });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('game:pause', async (payload: unknown, acknowledge?: (response: GameStatusChangeAck) => void) => {
    try {
      const input = parseGameStatusCommand(payload);
      requireAdminUser(socket);

      const session = await prisma.$transaction(
        (tx) => pauseSession(tx, input.sessionId),
        { isolationLevel: 'Serializable' }
      );
      const statusPayload = buildGameStatusChangedPayload(session);

      broadcastLobbyUpdate(io, await buildLobbyPresenceState(session.id));
      broadcastLobbyEvent(io, session.id, {
        id: randomUUID(),
        type: 'system',
        message: 'El Game Master ha pausado la partida.',
        occurredAt: statusPayload.occurredAt,
      });
      broadcastGameStatusChanged(io, session.id, statusPayload);

      acknowledge?.({ ok: true, payload: statusPayload });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('game:resume', async (payload: unknown, acknowledge?: (response: GameStatusChangeAck) => void) => {
    try {
      const input = parseGameStatusCommand(payload);
      requireAdminUser(socket);

      const session = await prisma.$transaction(
        (tx) => resumeSession(tx, input.sessionId),
        { isolationLevel: 'Serializable' }
      );
      const statusPayload = buildGameStatusChangedPayload(session);

      broadcastLobbyUpdate(io, await buildLobbyPresenceState(session.id));
      broadcastLobbyEvent(io, session.id, {
        id: randomUUID(),
        type: 'system',
        message: 'El Game Master ha reanudado la partida.',
        occurredAt: statusPayload.occurredAt,
      });
      broadcastGameStatusChanged(io, session.id, statusPayload);

      acknowledge?.({ ok: true, payload: statusPayload });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('game:end-session', async (payload: unknown, acknowledge?: (response: GameStatusChangeAck) => void) => {
    try {
      const input = parseGameStatusCommand(payload);
      requireAdminUser(socket);

      const session = await prisma.$transaction(
        (tx) => endSessionByGM(tx, input.sessionId),
        { isolationLevel: 'Serializable' }
      );
      const statusPayload = buildGameStatusChangedPayload(session);

      broadcastLobbyUpdate(io, await buildLobbyPresenceState(session.id));
      broadcastLobbyEvent(io, session.id, {
        id: randomUUID(),
        type: 'system',
        message: 'El Game Master ha finalizado la partida.',
        occurredAt: statusPayload.occurredAt,
      });
      broadcastGameStatusChanged(io, session.id, statusPayload);
      scheduleRealtimeSessionCleanup(io, session.id);
      acknowledge?.({ ok: true, payload: statusPayload });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('game:trigger-resolution', async (payload: unknown, acknowledge?: (response: GameTriggerResolutionAck) => void) => {
    try {
      const input = parseGameTriggerResolutionCommand(payload);
      requireAdminUser(socket);

      const session = await prisma.partida.findUnique({
        where: { id: input.sessionId },
        select: {
          id: true,
          status: true,
          activeSuggestionEventId: true,
          teams: {
            select: {
              id: true,
              name: true,
              color: true,
              falseAccusation: true,
              eliminatedAt: true,
            },
          },
        },
      });

      if (!session) {
        throw new HttpError(404, 'La sesión solicitada no existe.');
      }

      if (session.status !== EstadoPartida.EN_CURSO) {
        throw new HttpError(409, 'La resolución solo puede activarse cuando la partida está en curso.');
      }

      if (session.activeSuggestionEventId) {
        throw new HttpError(409, 'No se puede abrir la resolución mientras exista una sugerencia pendiente de refutación.');
      }

      const occurredAt = Date.now();
      const eligibleTeams = session.teams.filter((team) => !team.falseAccusation && !team.eliminatedAt);
      let resolution: SessionResolutionSnapshot;

      if (input.mode === 'FINAL_CHANCE') {
        if (eligibleTeams.length === 0) {
          throw new HttpError(409, 'No hay equipos activos disponibles para la última oportunidad.');
        }

        resolution = startFinalChanceResolution({
          sessionId: session.id,
          eligibleTeamIds: eligibleTeams.map((team) => team.id),
          durationMs: FINAL_CHANCE_DURATION_MS,
          onDeadline: (expiredSessionId) => {
            void finalizeResolutionFlow(io, expiredSessionId).catch(() => {
              // El timeout no debe dejar errores sin controlar en el loop de socket.
            });
          },
        });

        const resolutionPayload = await emitResolutionUpdate(session.id, resolution, occurredAt, {
          id: randomUUID(),
          type: 'system',
          message: `El Game Master ha activado la última oportunidad para ${eligibleTeams.length} equipo${eligibleTeams.length === 1 ? '' : 's'}.`,
          occurredAt,
        });

        broadcastFinalChanceStart(io, session.id, resolutionPayload);
        acknowledge?.({ ok: true, payload: resolutionPayload });
        return;
      }

      const solution = await loadResolutionSolutionBySessionId(prisma, session.id);
      showSessionSolution({
        sessionId: session.id,
        mode: input.mode,
        solution,
        winningTeams: [],
      });

      const resolutionPayload = await finalizeResolutionFlow(io, session.id, occurredAt);
      acknowledge?.({ ok: true, payload: resolutionPayload });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('game:submit-final-chance', async (payload: unknown, acknowledge?: (response: GameFinalChanceSubmissionAck) => void) => {
    try {
      if (socket.data.role !== 'team' || !socket.data.sessionId || !socket.data.teamId) {
        throw new HttpError(403, 'Solo un terminal de equipo puede enviar una acusación final de resolución.');
      }

      const input = parseGameFinalChanceAccusationCommand(payload);
      const resolution = recordResolutionSubmission(socket.data.sessionId, socket.data.teamId, input);
      const occurredAt = Date.now();

      if (resolution.submittedTeamIds.length >= resolution.eligibleTeamIds.length) {
        const resolutionPayload = await finalizeResolutionFlow(io, socket.data.sessionId, occurredAt);
        acknowledge?.({ ok: true, payload: resolutionPayload });
        return;
      }

      const pendingTeams = resolution.eligibleTeamIds.length - resolution.submittedTeamIds.length;
      const resolutionPayload = await emitResolutionUpdate(socket.data.sessionId, resolution, occurredAt, {
        id: randomUUID(),
        type: 'system',
        message: `Se ha recibido una acusación final. Quedan ${pendingTeams} equipo${pendingTeams === 1 ? '' : 's'} pendientes.`,
        occurredAt,
      });

      acknowledge?.({ ok: true, payload: resolutionPayload });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('lobby:team-heartbeat', async () => {
    if (socket.data.role !== 'team' || !socket.data.sessionId || !socket.data.teamId) {
      return;
    }

    lobbyPresenceStore.touchTeam(socket.data.sessionId, socket.data.teamId);

    try {
      const state = await buildLobbyPresenceState(socket.data.sessionId);
      broadcastLobbyUpdate(io, state);
    } catch {
      // Un heartbeat nunca debe romper la conexión del terminal.
    }
  });

  socket.on('turn:use-secret-passage', async (payload: unknown, acknowledge?: (response: TeamSecretPassageAck) => void) => {
    try {
      if (socket.data.role !== 'team' || !socket.data.sessionId || !socket.data.teamId) {
        throw new HttpError(403, 'Solo un terminal de equipo puede usar un pasadizo.');
      }

      const input = parseTeamSecretPassageCommand(payload);

      const session = await prisma.partida.findUnique({
        where: { id: socket.data.sessionId },
        select: {
          id: true,
          status: true,
          currentTurnTeamId: true,
          currentTurnHasMoved: true,
          activeSuggestionEventId: true,
          teams: {
            where: { id: socket.data.teamId },
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
        throw new HttpError(404, 'La sesión realtime indicada ya no existe.');
      }

      ensureRealtimeStateAvailable(session.status ?? EstadoPartida.LOBBY);

      if (session.status !== EstadoPartida.EN_CURSO) {
        throw new HttpError(409, 'Solo se puede usar un pasadizo cuando la partida está en curso.');
      }

      if (session.currentTurnTeamId !== socket.data.teamId) {
        throw new HttpError(409, 'Solo el equipo con turno activo puede usar un pasadizo.');
      }

      if (session.currentTurnHasMoved) {
        throw new HttpError(409, 'Solo puedes usar el pasadizo si llevas en la sala desde el turno anterior.');
      }

      if (session.activeSuggestionEventId) {
        throw new HttpError(409, 'Hay una sugerencia pendiente de refutación y la partida está temporalmente bloqueada.');
      }

      const currentTeam = session.teams[0];
      if (!currentTeam) {
        throw new HttpError(404, 'El equipo indicado no pertenece a la sesión actual.');
      }

      const currentNode = findBoardMovementNodeByPosition(currentTeam.positionX, currentTeam.positionY);
      if (!currentNode || currentNode.id !== input.fromNodeId) {
        throw new HttpError(409, 'La sala origen no coincide con la posición actual del equipo.');
      }

      if (!isSecretPassageMoveValid(input.fromNodeId, input.toNodeId)) {
        throw new HttpError(409, 'El pasadizo solicitado no está disponible para la sala actual.');
      }

      const fromRoomLabel = currentNode.label;
      const toRoomNode = BOARD_MOVEMENT_NODES[input.toNodeId];
      const toRoomLabel = toRoomNode?.label ?? input.toNodeId;

      if (!toRoomNode) {
        throw new HttpError(404, 'El nodo destino del pasadizo no existe en el tablero.');
      }

      await prisma.equipo.update({
        where: { id: socket.data.teamId },
        data: {
          positionX: toRoomNode.positionX,
          positionY: toRoomNode.positionY,
        },
      });

      await prisma.partida.update({
        where: { id: socket.data.sessionId },
        data: {
          activeDiceValueOne: null,
          activeDiceValueTwo: null,
          activeDiceRemainingMoves: null,
          currentTurnHasMoved: true,
        },
      });

      const occurredAt = Date.now();

      await emitSessionSnapshotUpdate(socket.data.sessionId, {
        id: randomUUID(),
        type: 'system',
        message: `${currentTeam.name} ha usado el pasadizo de ${fromRoomLabel} a ${toRoomLabel}. Puede lanzar una sugerencia o terminar su turno.`,
        occurredAt,
        teamColor: currentTeam.color,
        teamId: currentTeam.id,
      });

      acknowledge?.({ ok: true, occurredAt });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('game:suggest', async (payload: unknown, acknowledge?: (response: GameSuggestAck) => void) => {
    try {
      if (socket.data.role !== 'team' || !socket.data.sessionId || !socket.data.teamId) {
        throw new HttpError(403, 'Solo un terminal de equipo puede lanzar sugerencias.');
      }

      const input = parseGameSuggestCommand(payload);
      const result = await prisma.$transaction(
        (tx) => createSuggestionBySessionId(tx, socket.data.sessionId as string, socket.data.teamId as string, input),
        { isolationLevel: 'Serializable' }
      );
      const occurredAt = Date.now();

      if (result.refutationRequired && result.suggestion.receiverTeamId) {
        await emitSessionSnapshotUpdate(result.sessionId, {
          id: randomUUID(),
          type: 'system',
          message: `${result.suggestion.emitterTeamName} ha sugerido ${result.suggestion.subject.name} con ${result.suggestion.object.name} en ${result.suggestion.space.name}. Esperando refutación de ${result.suggestion.receiverTeamName}.`,
          occurredAt,
          teamColor: result.suggestion.emitterTeamColor,
          teamId: result.suggestion.emitterTeamId,
        });

        emitRefuteRequest(io, result.sessionId, result.suggestion.receiverTeamId, {
          suggestion: result.suggestion,
          matchingCards: result.matchingCards,
          occurredAt,
        });

        acknowledge?.({ ok: true, status: 'waiting-refutation', occurredAt });
        return;
      }

      await emitSessionSnapshotUpdate(result.sessionId, {
        id: randomUUID(),
        type: 'system',
        message: `${result.suggestion.emitterTeamName} ha sugerido ${result.suggestion.subject.name} con ${result.suggestion.object.name} en ${result.suggestion.space.name}. Nadie ha podido refutar.${result.nextTurnTeamName ? ` Turno para ${result.nextTurnTeamName}.` : ''}`,
        occurredAt,
        teamColor: result.suggestion.emitterTeamColor,
        teamId: result.suggestion.emitterTeamId,
      });

      emitRefutationResult(io, result.sessionId, result.suggestion.emitterTeamId, {
        suggestion: result.suggestion,
        outcome: 'UNREFUTED',
        occurredAt,
      });

      acknowledge?.({ ok: true, status: 'resolved-without-refutation', occurredAt });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('game:refute', async (payload: unknown, acknowledge?: (response: GameRefuteAck) => void) => {
    try {
      if (socket.data.role !== 'team' || !socket.data.sessionId || !socket.data.teamId) {
        throw new HttpError(403, 'Solo un terminal de equipo puede refutar sugerencias.');
      }

      const input = parseGameRefuteCommand(payload);
      const result = await prisma.$transaction(
        (tx) => refuteActiveSuggestionBySessionId(tx, socket.data.sessionId as string, socket.data.teamId as string, input.shownElementId),
        { isolationLevel: 'Serializable' }
      );
      const occurredAt = Date.now();

      await emitSessionSnapshotUpdate(result.sessionId, {
        id: randomUUID(),
        type: 'system',
        message: `${result.refutingTeamName} ha refutado la sugerencia de ${result.suggestion.emitterTeamName}.${result.nextTurnTeamName ? ` Turno para ${result.nextTurnTeamName}.` : ''}`,
        occurredAt,
        teamColor: result.refutingTeamColor,
        teamId: result.refutingTeamId,
      });

      emitRefutationResult(io, result.sessionId, result.suggestion.emitterTeamId, {
        suggestion: result.suggestion,
        outcome: 'REFUTED',
        occurredAt,
        shownCard: result.shownCard,
        shownByTeamId: result.refutingTeamId,
        shownByTeamName: result.refutingTeamName,
      });

      acknowledge?.({ ok: true, occurredAt });
    } catch (error) {
      acknowledge?.({ ok: false, error: getSocketErrorMessage(error) });
    }
  });

  socket.on('disconnect', async () => {
    if (socket.data.role !== 'team' || !socket.data.sessionId || !socket.data.teamId) {
      return;
    }

    const { sessionId, teamId } = socket.data;
    lobbyPresenceStore.disconnectTeam(sessionId, teamId, socket.id);

    try {
      const team = await prisma.equipo.findFirst({
        where: {
          id: teamId,
          partidaId: sessionId,
        },
        select: {
          id: true,
          color: true,
          name: true,
        },
      });

      const state = await buildLobbyPresenceState(sessionId);
      broadcastLobbyUpdate(io, state);

      if (team) {
        broadcastLobbyEvent(io, sessionId, {
          id: randomUUID(),
          type: 'team-disconnected',
          message: buildConnectionMessage(team.name, state.status, 'disconnected'),
          occurredAt: Date.now(),
          teamColor: team.color,
          teamId: team.id,
        });
      }
    } catch {
      // La desconexión no debe bloquearse por fallos de consulta del snapshot.
    }
  });
}

function parseHostSubscription(payload: unknown): HostLobbySubscriptionInput {
  const parsed = hostLobbySubscriptionSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, 'La suscripción del host no es válida.', parsed.error.issues.map((issue) => issue.message));
  }

  return parsed.data;
}

function parseTeamSubscription(payload: unknown): TeamLobbySubscriptionInput {
  const parsed = teamLobbySubscriptionSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(
      400,
      'La suscripción del equipo no es válida.',
      parsed.error.issues.map((issue) => issue.message)
    );
  }

  return parsed.data;
}

function parseStartGameCommand(payload: unknown): StartGameCommandInput {
  const parsed = startGameCommandSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, 'La orden de inicio de partida no es válida.', parsed.error.issues.map((issue) => issue.message));
  }

  return parsed.data;
}

function parseGameStatusCommand(payload: unknown): GameStatusCommandInput {
  const parsed = gameStatusCommandSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, 'La orden de cambio de estado no es válida.', parsed.error.issues.map((issue) => issue.message));
  }

  return parsed.data;
}

function parseGameTriggerResolutionCommand(payload: unknown): GameTriggerResolutionCommandInput {
  const parsed = gameTriggerResolutionCommandSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, 'La orden de resolución no es válida.', parsed.error.issues.map((issue) => issue.message));
  }

  return parsed.data;
}

function parseTeamSecretPassageCommand(payload: unknown): TeamSecretPassageCommandInput {
  const parsed = teamSecretPassageCommandSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, 'La orden de pasadizo no es válida.', parsed.error.issues.map((issue) => issue.message));
  }

  return parsed.data;
}

function parseGameSuggestCommand(payload: unknown): GameSuggestCommandInput {
  const parsed = gameSuggestCommandSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, 'La sugerencia indicada no es válida.', parsed.error.issues.map((issue) => issue.message));
  }

  return parsed.data;
}

function parseGameRefuteCommand(payload: unknown): GameRefuteCommandInput {
  const parsed = gameRefuteCommandSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, 'La refutación indicada no es válida.', parsed.error.issues.map((issue) => issue.message));
  }

  return parsed.data;
}

function parseGameFinalChanceAccusationCommand(payload: unknown): GameFinalChanceAccusationCommandInput {
  const parsed = gameFinalChanceAccusationCommandSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, 'La acusación final de resolución no es válida.', parsed.error.issues.map((issue) => issue.message));
  }

  return parsed.data;
}

function requireAdminUser(socket: LobbySocket) {
  const token = getSocketToken(socket);

  if (!token) {
    throw new HttpError(401, 'Acceso denegado. Se requiere autenticación de administrador.');
  }

  return verifyAdminToken(token);
}

function getSocketToken(socket: LobbySocket) {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const headerValue = socket.handshake.headers.authorization;
  if (typeof headerValue === 'string' && headerValue.startsWith('Bearer ')) {
    return headerValue.slice('Bearer '.length).trim();
  }

  return null;
}

async function buildLobbyPresenceState(sessionId: string): Promise<LobbyPresenceState> {
  const snapshot = await loadSessionSnapshotById(prisma, sessionId);

  return {
    sessionId: snapshot.id,
    accessCode: snapshot.accessCode,
    status: snapshot.status,
    startedAt: snapshot.startedAt,
    durationSeconds: snapshot.durationSeconds,
    remainingSeconds: snapshot.remainingSeconds,
    teams: snapshot.teams.map((team) => ({
      ...team,
      connected: lobbyPresenceStore.isTeamConnected(snapshot.id, team.id),
      lastSeenAt: lobbyPresenceStore.getTeamLastSeen(snapshot.id, team.id),
    })),
    turn: snapshot.turn,
    activeSuggestion: snapshot.activeSuggestion,
    resolution: snapshot.resolution,
    publicCards: snapshot.publicCards,
    updatedAt: Date.now(),
  };
}

function broadcastLobbyUpdate(io: Server, state: LobbyPresenceState) {
  io.to(getLobbyRoom(state.sessionId)).emit('lobby:presence-updated', state);
}

function broadcastLobbyEvent(io: Server, sessionId: string, event: LobbyEvent) {
  io.to(getLobbyRoom(sessionId)).emit('lobby:event', event);
}

function broadcastGameStarted(io: Server, sessionId: string, payload: GameStartedPayload) {
  io.to(getLobbyRoom(sessionId)).emit('gameStarted', payload);
}

function broadcastGameStatusChanged(io: Server, sessionId: string, payload: GameStatusChangedPayload) {
  io.to(getLobbyRoom(sessionId)).emit('game:status-changed', payload);
}

function broadcastFinalChanceStart(io: Server, sessionId: string, payload: GameResolutionPayload) {
  io.to(getLobbyRoom(sessionId)).emit('game:final-chance-start', payload);
}

function broadcastShowSolution(io: Server, sessionId: string, payload: GameResolutionPayload) {
  io.to(getLobbyRoom(sessionId)).emit('game:show-solution', payload);
}

function emitRefuteRequest(io: Server, sessionId: string, teamId: string, payload: GameRefuteRequestPayload) {
  io.to(getTeamRoom(sessionId, teamId)).emit('game:refute-request', payload);
}

function emitRefutationResult(io: Server, sessionId: string, teamId: string, payload: GameRefutationResultPayload) {
  io.to(getTeamRoom(sessionId, teamId)).emit('game:refutation-result', payload);
}

function getLobbyRoom(sessionId: string) {
  return `${LOBBY_ROOM_PREFIX}${sessionId}`;
}

function getTeamRoom(sessionId: string, teamId: string) {
  return `${TEAM_ROOM_PREFIX}${sessionId}:${teamId}`;
}

function getSocketErrorMessage(error: unknown) {
  if (error instanceof HttpError) {
    return error.details?.[0] ?? error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Se ha producido un error interno al conectar con la sala de espera.';
}

function ensureRealtimeStateAvailable(status: EstadoPartida) {
  if (!REALTIME_ENABLED_STATES.has(status)) {
    throw new HttpError(409, 'La sesión no admite conexiones realtime en su estado actual.');
  }
}

function buildConnectionMessage(teamName: string, status: EstadoPartida, action: 'connected' | 'disconnected') {
  const target = status === EstadoPartida.LOBBY ? 'el lobby' : 'la partida';
  const verb = action === 'connected' ? 'se ha conectado a' : 'se ha desconectado de';
  return `${teamName} ${verb} ${target}.`;
}

function buildGameStartedPayload(session: SessionSnapshot): GameStartedPayload {
  return {
    session,
    occurredAt: Date.now(),
  };
}

function buildGameStatusChangedPayload(session: SessionSnapshot): GameStatusChangedPayload {
  return {
    session,
    status: session.status,
    occurredAt: Date.now(),
  };
}

function buildGameResolutionPayload(
  session: SessionSnapshot,
  resolution: SessionResolutionSnapshot,
  occurredAt: number
): GameResolutionPayload {
  return {
    session,
    resolution,
    occurredAt,
  };
}

async function emitResolutionUpdate(
  sessionId: string,
  resolution: SessionResolutionSnapshot,
  occurredAt: number,
  event: LobbyEvent
) {
  await emitSessionSnapshotUpdate(sessionId, event);
  const session = await loadSessionSnapshotById(prisma, sessionId);
  return buildGameResolutionPayload(session, resolution, occurredAt);
}

async function finalizeResolutionFlow(io: Server, sessionId: string, occurredAt = Date.now()) {
  const result = await prisma.$transaction(
    (tx) => finalizeActiveSessionResolution(tx, sessionId),
    { isolationLevel: 'Serializable' }
  );

  const resolutionPayload = await emitResolutionUpdate(sessionId, result.resolution, occurredAt, {
    id: randomUUID(),
    type: 'system',
    message: buildResolutionCompletionMessage(result.mode, result.winningTeams.length),
    occurredAt,
  });

  broadcastShowSolution(io, sessionId, resolutionPayload);
  scheduleSessionResolutionCleanup(sessionId, CLOSED_SESSION_RESOLUTION_RETENTION_MS);
  scheduleRealtimeSessionCleanup(io, sessionId);
  return resolutionPayload;
}

function scheduleRealtimeSessionCleanup(io: Server, sessionId: string) {
  const timeoutId = setTimeout(() => {
    void cleanupRealtimeSession(io, sessionId).catch(() => {
      // La limpieza tardía no debe afectar al cierre persistido de la partida.
    });
  }, CLOSED_SESSION_REALTIME_CLEANUP_DELAY_MS);

  timeoutId.unref?.();
}

async function cleanupRealtimeSession(io: Server, sessionId: string) {
  const roomSockets = await io.in(getLobbyRoom(sessionId)).fetchSockets();

  for (const socket of roomSockets) {
    if (socket.data.sessionId !== sessionId) {
      continue;
    }

    const joinedTeamId = socket.data.teamId;

    socket.leave(getLobbyRoom(sessionId));
    if (joinedTeamId) {
      socket.leave(getTeamRoom(sessionId, joinedTeamId));
    }

    socket.data.sessionId = undefined;
    socket.data.teamId = undefined;
    socket.data.role = undefined;
  }

  lobbyPresenceStore.clearSession(sessionId);
}

function buildResolutionCompletionMessage(mode: ResolutionMode, winnerCount: number) {
  if (mode === 'DIRECT_REVEAL') {
    return 'El Game Master ha cerrado la partida y ha revelado la solución final.';
  }

  if (winnerCount === 0) {
    return 'La fase de resolución ha terminado. Ningún equipo ha acertado la solución final.';
  }

  if (winnerCount === 1) {
    return 'La fase de resolución ha terminado. Un equipo ha acertado la solución final.';
  }

  return `La fase de resolución ha terminado. ${winnerCount} equipos han acertado la solución final.`;
}

export async function emitSessionSnapshotUpdate(sessionId: string, event?: LobbyEvent) {
  if (!activeIo) {
    return;
  }

  const state = await buildLobbyPresenceState(sessionId);
  broadcastLobbyUpdate(activeIo, state);

  if (event) {
    broadcastLobbyEvent(activeIo, sessionId, event);
  }
}

export async function emitGameStarted(session: SessionSnapshot) {
  if (!activeIo) {
    return;
  }

  const payload = buildGameStartedPayload(session);
  broadcastGameStarted(activeIo, session.id, payload);
}