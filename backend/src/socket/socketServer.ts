import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { EstadoPartida, type ColorEquipo } from '@prisma/client';
import { Server, type Socket } from 'socket.io';
import {
  hostLobbySubscriptionSchema,
  startGameCommandSchema,
  teamLobbySubscriptionSchema,
  type HostLobbySubscriptionInput,
  type StartGameCommandInput,
  type TeamLobbySubscriptionInput,
} from '../lib/lobbySocketSchemas.js';
import { HttpError } from '../lib/http.js';
import {
  loadSessionSnapshotById,
  type SessionSnapshot,
  type SessionTeamSnapshot,
} from '../lib/sessionSnapshots.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { verifyAdminToken, type AuthTokenPayload } from '../middleware/auth.js';
import { lobbyPresenceStore } from './lobbyPresenceStore.js';
import { startSessionByAccessCode } from '../lib/sessionGameplay.js';

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
  updatedAt: number;
};

export type LobbyEvent = {
  id: string;
  type: 'system' | 'team-connected' | 'team-disconnected';
  message: string;
  occurredAt: number;
  teamColor?: ColorEquipo | undefined;
  teamId?: string | undefined;
};

export type GameStartedPayload = {
  session: SessionSnapshot;
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

type LobbySocketData = {
  sessionId?: string;
  teamId?: string;
  user?: AuthTokenPayload;
  role?: 'host' | 'team';
};

type LobbySocket = Socket<
  Record<string, never>,
  {
    'lobby:presence-updated': (state: LobbyPresenceState) => void;
    'lobby:event': (event: LobbyEvent) => void;
    gameStarted: (payload: GameStartedPayload) => void;
  },
  Record<string, never>,
  LobbySocketData
>;

const LOBBY_ROOM_PREFIX = 'lobby:session:';
const REALTIME_ENABLED_STATES: ReadonlySet<EstadoPartida> = new Set<EstadoPartida>([
  EstadoPartida.LOBBY,
  EstadoPartida.EN_CURSO,
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

function getLobbyRoom(sessionId: string) {
  return `${LOBBY_ROOM_PREFIX}${sessionId}`;
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
  const target = status === EstadoPartida.EN_CURSO ? 'la partida' : 'el lobby';
  const verb = action === 'connected' ? 'se ha conectado a' : 'se ha desconectado de';
  return `${teamName} ${verb} ${target}.`;
}

function buildGameStartedPayload(session: SessionSnapshot): GameStartedPayload {
  return {
    session,
    occurredAt: Date.now(),
  };
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