import { io, type Socket } from 'socket.io-client';
import { getStoredAdminToken } from './auth';
import type {
  FinalAccusationVerdict,
  GameResolutionMode,
  GameSetupCardsPayload,
  LobbySession,
  LobbyTeam,
  SessionResolutionState,
  SessionStatus,
  SessionTurn,
  SuggestionElement,
  SuggestionSummary,
  TeamColor,
  TeamHandCard,
} from './sessionApi';

export type { GameSetupCardsPayload };

export type LobbyPresenceTeam = LobbyTeam & {
  connected: boolean;
  lastSeenAt: number | null;
};

export type LobbyPresenceState = {
  sessionId: string;
  accessCode: string;
  status: SessionStatus;
  startedAt: string | null;
  durationSeconds: number;
  remainingSeconds: number;
  teams: LobbyPresenceTeam[];
  turn: SessionTurn | null;
  activeSuggestion: SuggestionSummary | null;
  resolution: SessionResolutionState | null;
  publicCards: TeamHandCard[];
  hiddenCards: TeamHandCard[];
  updatedAt: number;
};

export type LobbyEventMessage = {
  id: string;
  type: 'system' | 'team-connected' | 'team-disconnected' | 'final-accusation-verdict';
  message: string;
  occurredAt: number;
  teamColor?: TeamColor | undefined;
  teamId?: string | undefined;
  accusationVerdict?: FinalAccusationVerdict | undefined;
};

export type GameStartedPayload = {
  session: LobbySession;
  occurredAt: number;
};

export type GameStatusChangedPayload = {
  session: LobbySession;
  status: SessionStatus;
  occurredAt: number;
};

export type GameResolutionPayload = {
  session: LobbySession;
  resolution: SessionResolutionState;
  occurredAt: number;
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

export type StartGameAck =
  | {
      ok: true;
      payload: GameStartedPayload;
    }
  | {
      ok: false;
      error: string;
    };

export type TeamSecretPassageAck =
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
  matchingCards: SuggestionElement[];
  occurredAt: number;
};

export type GameRefutationResultPayload = {
  suggestion: SuggestionSummary;
  outcome: 'REFUTED' | 'UNREFUTED';
  occurredAt: number;
  shownCard?: SuggestionElement;
  shownByTeamId?: string;
  shownByTeamName?: string;
};

export type GameHiddenCardDetailsPayload = {
  card: TeamHandCard;
  occurredAt: number;
};

export type ConsultHiddenCardAck =
  | {
      ok: true;
      occurredAt: number;
    }
  | {
      ok: false;
      error: string;
    };

export type GameStatusChangeAck =
  | {
      ok: true;
      payload: GameStatusChangedPayload;
    }
  | {
      ok: false;
      error: string;
    };

export type GameTriggerResolutionAck =
  | {
      ok: true;
      payload: GameResolutionPayload;
    }
  | {
      ok: false;
      error: string;
    };

export type GameFinalChanceSubmissionAck =
  | {
      ok: true;
      payload: GameResolutionPayload;
    }
  | {
      ok: false;
      error: string;
    };

type ServerToClientEvents = {
  'lobby:presence-updated': (state: LobbyPresenceState) => void;
  'lobby:event': (event: LobbyEventMessage) => void;
  gameStarted: (payload: GameStartedPayload) => void;
  'game:status-changed': (payload: GameStatusChangedPayload) => void;
  'game:final-chance-start': (payload: GameResolutionPayload) => void;
  'game:show-solution': (payload: GameResolutionPayload) => void;
  'game:refute-request': (payload: GameRefuteRequestPayload) => void;
  'game:refutation-result': (payload: GameRefutationResultPayload) => void;
  'game:setup-cards': (payload: GameSetupCardsPayload) => void;
  'game:hidden-card-details': (payload: GameHiddenCardDetailsPayload) => void;
};

type ClientToServerEvents = {
  'lobby:host-subscribe': (payload: { sessionId: string }, acknowledge: (response: LobbySubscribeAck) => void) => void;
  'lobby:team-subscribe': (
    payload: { sessionId: string; teamId: string },
    acknowledge: (response: LobbySubscribeAck) => void
  ) => void;
  'lobby:team-heartbeat': () => void;
  'turn:use-secret-passage': (
    payload: { fromNodeId: string; toNodeId: string },
    acknowledge: (response: TeamSecretPassageAck) => void
  ) => void;
  'game:suggest': (
    payload: { subjectElementId: string; objectElementId: string; spaceElementId: string },
    acknowledge: (response: GameSuggestAck) => void
  ) => void;
  'game:refute': (
    payload: { shownElementId: string },
    acknowledge: (response: GameRefuteAck) => void
  ) => void;
  startGame: (payload: { accessCode: string }, acknowledge: (response: StartGameAck) => void) => void;
  'game:pause': (payload: { sessionId: string }, acknowledge: (response: GameStatusChangeAck) => void) => void;
  'game:resume': (payload: { sessionId: string }, acknowledge: (response: GameStatusChangeAck) => void) => void;
  'game:trigger-resolution': (
    payload: { sessionId: string; mode: GameResolutionMode },
    acknowledge: (response: GameTriggerResolutionAck) => void
  ) => void;
  'game:submit-final-chance': (
    payload: { subjectElementId: string; objectElementId: string; spaceElementId: string },
    acknowledge: (response: GameFinalChanceSubmissionAck) => void
  ) => void;
  'game:consult-hidden-card': (
    payload: { elementId: string },
    acknowledge: (response: ConsultHiddenCardAck) => void
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

export function emitTeamHeartbeat(socket: LobbySocketClient) {
  socket.emit('lobby:team-heartbeat');
}

export function startGameFromLobby(socket: LobbySocketClient, accessCode: string) {
  return new Promise<StartGameAck>((resolve) => {
    socket.emit('startGame', { accessCode }, resolve);
  });
}

export function pauseGameFromBoard(socket: LobbySocketClient, sessionId: string) {
  return new Promise<GameStatusChangeAck>((resolve) => {
    socket.emit('game:pause', { sessionId }, resolve);
  });
}

export function resumeGameFromBoard(socket: LobbySocketClient, sessionId: string) {
  return new Promise<GameStatusChangeAck>((resolve) => {
    socket.emit('game:resume', { sessionId }, resolve);
  });
}

export function triggerResolutionFromBoard(socket: LobbySocketClient, sessionId: string, mode: GameResolutionMode) {
  return new Promise<GameTriggerResolutionAck>((resolve) => {
    socket.emit('game:trigger-resolution', { sessionId, mode }, resolve);
  });
}

export function emitTeamSecretPassage(
  socket: LobbySocketClient,
  fromNodeId: string,
  toNodeId: string
) {
  return new Promise<TeamSecretPassageAck>((resolve) => {
    socket.emit('turn:use-secret-passage', { fromNodeId, toNodeId }, resolve);
  });
}

export function emitTeamSuggestion(
  socket: LobbySocketClient,
  payload: { subjectElementId: string; objectElementId: string; spaceElementId: string }
) {
  return new Promise<GameSuggestAck>((resolve) => {
    socket.emit('game:suggest', payload, resolve);
  });
}

export function emitTeamRefutation(socket: LobbySocketClient, shownElementId: string) {
  return new Promise<GameRefuteAck>((resolve) => {
    socket.emit('game:refute', { shownElementId }, resolve);
  });
}

export function submitFinalChanceAccusation(
  socket: LobbySocketClient,
  payload: { subjectElementId: string; objectElementId: string; spaceElementId: string }
) {
  return new Promise<GameFinalChanceSubmissionAck>((resolve) => {
    socket.emit('game:submit-final-chance', payload, resolve);
  });
}

export function emitConsultHiddenCard(socket: LobbySocketClient, elementId: string) {
  return new Promise<ConsultHiddenCardAck>((resolve) => {
    socket.emit('game:consult-hidden-card', { elementId }, resolve);
  });
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
    '/api'
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