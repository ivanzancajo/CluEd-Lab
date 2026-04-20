import { io, type Socket } from 'socket.io-client';
import { getStoredAdminToken } from './auth';
import type { LobbyTeam, SessionStatus, TeamColor } from './sessionApi';

export type LobbyPresenceTeam = LobbyTeam & {
  connected: boolean;
};

export type LobbyPresenceState = {
  sessionId: string;
  accessCode: string;
  status: SessionStatus;
  startedAt: string | null;
  durationSeconds: number;
  remainingSeconds: number;
  teams: LobbyPresenceTeam[];
  updatedAt: number;
};

export type LobbyEventMessage = {
  id: string;
  type: 'system' | 'team-connected' | 'team-disconnected';
  message: string;
  occurredAt: number;
  teamColor?: TeamColor | undefined;
  teamId?: string | undefined;
};

export type LobbySubscribeAck =
  | {
      ok: true;
      state: LobbyPresenceState;
    }
  | {
      ok: false;
      error: string;
    };

type ServerToClientEvents = {
  'lobby:presence-updated': (state: LobbyPresenceState) => void;
  'lobby:event': (event: LobbyEventMessage) => void;
};

type ClientToServerEvents = {
  'lobby:host-subscribe': (payload: { sessionId: string }, acknowledge: (response: LobbySubscribeAck) => void) => void;
  'lobby:team-subscribe': (
    payload: { sessionId: string; teamId: string },
    acknowledge: (response: LobbySubscribeAck) => void
  ) => void;
};

export type LobbySocketClient = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createLobbySocketClient(options?: { admin?: boolean }): LobbySocketClient {
  const { path, url } = resolveSocketConfig();
  const token = options?.admin ? getStoredAdminToken() : null;

  return io(url, {
    path,
    autoConnect: false,
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
  });
}

export function subscribeHostToLobby(socket: LobbySocketClient, sessionId: string) {
  return emitWithAck(socket, 'lobby:host-subscribe', { sessionId });
}

export function subscribeTeamToLobby(socket: LobbySocketClient, sessionId: string, teamId: string) {
  return emitWithAck(socket, 'lobby:team-subscribe', { sessionId, teamId });
}

function emitWithAck<EventName extends keyof ClientToServerEvents>(
  socket: LobbySocketClient,
  eventName: EventName,
  payload: Parameters<ClientToServerEvents[EventName]>[0]
) {
  return new Promise<LobbySubscribeAck>((resolve) => {
    socket.emit(eventName, payload as never, resolve);
  });
}

function resolveSocketConfig() {
  const raw = (
    import.meta.env.VITE_SOCKET_URL ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:4000/api'
  ).trim();

  if (!raw || raw === '/api' || raw === '/api/') {
    return {
      url: undefined,
      path: '/socket.io',
    };
  }

  try {
    const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(raw, fallbackOrigin);
    const isSameOrigin = typeof window !== 'undefined' && parsed.origin === window.location.origin;

    return {
      url: isSameOrigin ? undefined : parsed.origin,
      path: parsed.pathname.endsWith('/socket.io') ? parsed.pathname : '/socket.io',
    };
  } catch {
    const normalized = raw.replace(/\/$/, '');

    if (normalized.endsWith('/api')) {
      return {
        url: normalized.slice(0, -4),
        path: '/socket.io',
      };
    }

    if (normalized.endsWith('/socket.io')) {
      const baseUrl = normalized.slice(0, -'/socket.io'.length);
      return {
        url: baseUrl || undefined,
        path: '/socket.io',
      };
    }

    return {
      url: normalized || undefined,
      path: '/socket.io',
    };
  }
}