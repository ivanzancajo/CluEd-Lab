import { ColorEquipo, EstadoPartida, TipoEvento } from '@prisma/client';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';
import { loadSkinConfiguration } from './skinConfigs.js';

export type ResolutionMode = 'DIRECT_REVEAL' | 'FINAL_CHANCE';
export type ResolutionPhase = 'ESPERANDO_RESOLUCION' | 'MOSTRANDO_SOLUCION';

export type SessionResolutionCard = {
  id: string;
  name: string;
};

export type SessionResolutionWinningTeam = {
  id: string;
  name: string;
  color: ColorEquipo;
};

export type SessionResolutionSolution = {
  subject: SessionResolutionCard;
  object: SessionResolutionCard;
  space: SessionResolutionCard;
};

export type SessionResolutionSnapshot = {
  phase: ResolutionPhase;
  mode: ResolutionMode;
  startedAt: string;
  deadlineAt: string | null;
  eligibleTeamIds: string[];
  submittedTeamIds: string[];
  solution: SessionResolutionSolution | null;
  winningTeams: SessionResolutionWinningTeam[];
};

type SessionResolutionClient = Pick<typeof prisma, 'partida' | 'cluEdSkin'>;

type SessionResolutionPersistenceClient = Pick<typeof prisma, 'partida' | 'cluEdSkin' | 'evento'>;

export type FinalChanceAccusationInput = {
  subjectElementId: string;
  objectElementId: string;
  spaceElementId: string;
};

type StoredFinalChanceAccusation = FinalChanceAccusationInput & {
  submittedAt: Date;
};

type SessionResolutionState = {
  sessionId: string;
  phase: ResolutionPhase;
  mode: ResolutionMode;
  startedAt: Date;
  deadlineAt: Date | null;
  eligibleTeamIds: Set<string>;
  submittedTeamIds: Set<string>;
  accusationsByTeamId: Map<string, StoredFinalChanceAccusation>;
  solution: SessionResolutionSolution | null;
  winningTeams: SessionResolutionWinningTeam[];
  timeoutId: ReturnType<typeof setTimeout> | null;
};

const sessionResolutionStore = new Map<string, SessionResolutionState>();

function scheduleResolutionTimeout(callback: () => void, delayMs: number) {
  const timeoutId = setTimeout(callback, Math.max(0, delayMs));
  timeoutId.unref?.();
  return timeoutId;
}

export async function loadResolutionSolutionBySessionId(
  client: SessionResolutionClient,
  sessionId: string
): Promise<SessionResolutionSolution> {
  const session = await client.partida.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      skinId: true,
      solution: {
        select: {
          subjectElementId: true,
          objectElementId: true,
          spaceElementId: true,
        },
      },
    },
  });

  if (!session) {
    throw new HttpError(404, 'La sesión solicitada no existe.');
  }

  if (!session.skinId) {
    throw new HttpError(409, 'La sesión no tiene una configuración válida asociada.');
  }

  if (!session.solution?.subjectElementId || !session.solution.objectElementId || !session.solution.spaceElementId) {
    throw new HttpError(409, 'La sesión no tiene una solución válida configurada para revelar.');
  }

  const skin = await loadSkinConfiguration(client, session.skinId);

  return {
    subject: resolveConfiguredCard(skin.subjects, session.solution.subjectElementId, 'sujeto'),
    object: resolveConfiguredCard(skin.objects, session.solution.objectElementId, 'objeto'),
    space: resolveConfiguredCard(skin.spaces, session.solution.spaceElementId, 'espacio'),
  };
}

export function startFinalChanceResolution(options: {
  sessionId: string;
  eligibleTeamIds: string[];
  durationMs: number;
  onDeadline?: (sessionId: string) => void;
}) {
  ensureResolutionIsIdle(options.sessionId);

  const startedAt = new Date();
  const deadlineAt = new Date(startedAt.getTime() + options.durationMs);
  const state: SessionResolutionState = {
    sessionId: options.sessionId,
    phase: 'ESPERANDO_RESOLUCION',
    mode: 'FINAL_CHANCE',
    startedAt,
    deadlineAt,
    eligibleTeamIds: new Set(options.eligibleTeamIds),
    submittedTeamIds: new Set<string>(),
    accusationsByTeamId: new Map<string, StoredFinalChanceAccusation>(),
    solution: null,
    winningTeams: [],
    timeoutId:
      typeof options.onDeadline === 'function'
        ? scheduleResolutionTimeout(() => {
            options.onDeadline?.(options.sessionId);
          }, options.durationMs)
        : null,
  };

  sessionResolutionStore.set(options.sessionId, state);
  return buildSessionResolutionSnapshot(state);
}

export function showSessionSolution(options: {
  sessionId: string;
  mode: ResolutionMode;
  solution: SessionResolutionSolution;
  winningTeams?: SessionResolutionWinningTeam[];
}) {
  const previous = sessionResolutionStore.get(options.sessionId);
  const state: SessionResolutionState = {
    sessionId: options.sessionId,
    phase: 'MOSTRANDO_SOLUCION',
    mode: options.mode,
    startedAt: previous?.startedAt ?? new Date(),
    deadlineAt: null,
    eligibleTeamIds: previous?.eligibleTeamIds ?? new Set<string>(),
    submittedTeamIds: previous?.submittedTeamIds ?? new Set<string>(),
    accusationsByTeamId: previous?.accusationsByTeamId ?? new Map<string, StoredFinalChanceAccusation>(),
    solution: options.solution,
    winningTeams: options.winningTeams ?? [],
    timeoutId: null,
  };

  clearResolutionTimer(previous);
  sessionResolutionStore.set(options.sessionId, state);
  return buildSessionResolutionSnapshot(state);
}

export function recordResolutionSubmission(sessionId: string, teamId: string, accusation: FinalChanceAccusationInput) {
  const state = sessionResolutionStore.get(sessionId);
  if (!state) {
    throw new HttpError(409, 'La fase de resolución no está activa para esta sesión.');
  }

  if (state.mode !== 'FINAL_CHANCE' || state.phase !== 'ESPERANDO_RESOLUCION') {
    throw new HttpError(409, 'La sesión no está aceptando acusaciones finales en este momento.');
  }

  if (!state.eligibleTeamIds.has(teamId)) {
    throw new HttpError(409, 'El equipo no puede participar en la fase de resolución actual.');
  }

  if (state.submittedTeamIds.has(teamId)) {
    throw new HttpError(409, 'El equipo ya ha enviado su acusación final y debe esperar al resto.');
  }

  state.accusationsByTeamId.set(teamId, {
    ...accusation,
    submittedAt: new Date(),
  });
  state.submittedTeamIds.add(teamId);
  return buildSessionResolutionSnapshot(state);
}

export function hasTeamSubmittedResolution(sessionId: string, teamId: string) {
  return sessionResolutionStore.get(sessionId)?.submittedTeamIds.has(teamId) ?? false;
}

export function clearSessionResolution(sessionId: string) {
  const state = sessionResolutionStore.get(sessionId);
  clearResolutionTimer(state);
  sessionResolutionStore.delete(sessionId);
}

export function scheduleSessionResolutionCleanup(sessionId: string, retentionMs: number) {
  const state = sessionResolutionStore.get(sessionId);
  if (!state) {
    return;
  }

  clearResolutionTimer(state);
  state.timeoutId = scheduleResolutionTimeout(() => {
    clearSessionResolution(sessionId);
  }, retentionMs);
}

export function getSessionResolutionSnapshot(sessionId: string): SessionResolutionSnapshot | null {
  const state = sessionResolutionStore.get(sessionId);
  return state ? buildSessionResolutionSnapshot(state) : null;
}

export async function finalizeActiveSessionResolution(
  client: SessionResolutionPersistenceClient,
  sessionId: string
) {
  const state = sessionResolutionStore.get(sessionId);
  if (!state) {
    throw new HttpError(409, 'La sesión no tiene una fase de resolución activa.');
  }

  const session = await client.partida.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
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
    throw new HttpError(409, 'La sesión no está en un estado válido para cerrar la resolución.');
  }

  const occurredAt = new Date();
  const solution = state.solution ?? (await loadResolutionSolutionBySessionId(client, sessionId));
  const winningTeams =
    state.mode === 'FINAL_CHANCE'
      ? session.teams
          .filter((team) => isEligibleResolutionTeam(team.id, state))
          .filter((team) => doesAccusationMatchSolution(state.accusationsByTeamId.get(team.id), solution))
          .map((team) => ({
            id: team.id,
            name: team.name,
            color: team.color,
          }))
      : [];
  const missingTeamIds = Array.from(state.eligibleTeamIds).filter((teamId) => !state.submittedTeamIds.has(teamId));
  const winnerTeamId = winningTeams.length === 1 ? winningTeams[0]?.id ?? null : null;

  await client.partida.update({
    where: { id: sessionId },
    data: {
      status: EstadoPartida.FINALIZADA,
      finishedAt: occurredAt,
      pausedAt: null,
      winnerTeamId,
      currentTurnTeamId: null,
      currentTurnStartedAt: null,
      activeDiceValueOne: null,
      activeDiceValueTwo: null,
      activeDiceRemainingMoves: null,
      activeSuggestionEventId: null,
    },
  });

  const event = await client.evento.create({
    data: {
      partidaId: sessionId,
      eventType: TipoEvento.SISTEMA,
      occurredAt,
      detail: {
        version: 1,
        kind: 'GAME_RESOLUTION',
        mode: state.mode,
        phase: 'MOSTRANDO_SOLUCION',
        solution,
        winnerTeamId,
        winningTeamIds: winningTeams.map((team) => team.id),
        eligibleTeamIds: Array.from(state.eligibleTeamIds),
        submittedTeamIds: Array.from(state.submittedTeamIds),
        missingTeamIds,
        accusations:
          state.mode === 'FINAL_CHANCE'
            ? Array.from(state.accusationsByTeamId.entries()).map(([teamId, accusation]) => ({
                teamId,
                subjectElementId: accusation.subjectElementId,
                objectElementId: accusation.objectElementId,
                spaceElementId: accusation.spaceElementId,
                submittedAt: accusation.submittedAt.toISOString(),
              }))
            : [],
      },
    },
    select: {
      id: true,
    },
  });

  const resolution = showSessionSolution({
    sessionId,
    mode: state.mode,
    solution,
    winningTeams,
  });

  return {
    eventId: event.id,
    occurredAt: occurredAt.getTime(),
    resolution,
    winningTeams,
    missingTeamIds,
    mode: state.mode,
  };
}

function buildSessionResolutionSnapshot(state: SessionResolutionState): SessionResolutionSnapshot {
  return {
    phase: state.phase,
    mode: state.mode,
    startedAt: state.startedAt.toISOString(),
    deadlineAt: state.deadlineAt?.toISOString() ?? null,
    eligibleTeamIds: Array.from(state.eligibleTeamIds),
    submittedTeamIds: Array.from(state.submittedTeamIds),
    solution: state.solution,
    winningTeams: state.winningTeams,
  };
}

function isEligibleResolutionTeam(teamId: string, state: SessionResolutionState) {
  return state.eligibleTeamIds.has(teamId);
}

function doesAccusationMatchSolution(
  accusation: StoredFinalChanceAccusation | undefined,
  solution: SessionResolutionSolution
) {
  if (!accusation) {
    return false;
  }

  return (
    accusation.subjectElementId === solution.subject.id &&
    accusation.objectElementId === solution.object.id &&
    accusation.spaceElementId === solution.space.id
  );
}

function ensureResolutionIsIdle(sessionId: string) {
  if (sessionResolutionStore.has(sessionId)) {
    throw new HttpError(409, 'La sesión ya tiene una fase de resolución activa.');
  }
}

function clearResolutionTimer(state: SessionResolutionState | undefined) {
  if (state?.timeoutId) {
    clearTimeout(state.timeoutId);
  }
}

function resolveConfiguredCard(
  cards: Array<{ id: string; name: string }>,
  elementId: string,
  label: 'sujeto' | 'objeto' | 'espacio'
) {
  const card = cards.find((currentCard) => currentCard.id === elementId);

  if (!card) {
    throw new HttpError(409, `La solución contiene un ${label} que no pertenece a la configuración activa.`);
  }

  return card;
}