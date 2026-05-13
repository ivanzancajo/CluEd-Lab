import { ColorEquipo, EstadoPartida } from '@prisma/client';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';
import { loadSkinConfiguration, type LoadedSkinConfiguration } from './skinConfigs.js';
import { loadActiveSuggestionSummaryById, type SuggestionSummary } from './sessionSuggestion.js';
import { COLOR_SORT_ORDER } from './teamOrder.js';

export const COLOR_LABELS: Record<ColorEquipo, string> = {
  [ColorEquipo.ROJO]: 'Equipo Rojo',
  [ColorEquipo.AMARILLO]: 'Equipo Amarillo',
  [ColorEquipo.AZUL]: 'Equipo Azul',
  [ColorEquipo.VERDE]: 'Equipo Verde',
  [ColorEquipo.MORADO]: 'Equipo Morado',
  [ColorEquipo.BLANCO]: 'Equipo Blanco',
};

export type SessionReader = Pick<typeof prisma, 'partida' | 'cluedoSkin' | 'evento'>;

export type SessionTeamSnapshot = {
  id: string;
  name: string;
  color: ColorEquipo;
  positionX: number;
  positionY: number;
  falseAccusation: boolean;
};

export type SessionTurnDiceSnapshot = {
  valueOne: number;
  valueTwo: number;
  total: number;
};

export type SessionTurnSnapshot = {
  currentTeamId: string;
  currentTeamName: string;
  currentTeamColor: ColorEquipo;
  startedAt: string | null;
  dice: SessionTurnDiceSnapshot | null;
  remainingMoves: number | null;
};

export type SessionSnapshot = {
  id: string;
  accessCode: string;
  status: EstadoPartida;
  startedAt: string | null;
  durationSeconds: number;
  remainingSeconds: number;
  skin: LoadedSkinConfiguration;
  teams: SessionTeamSnapshot[];
  turn: SessionTurnSnapshot | null;
  activeSuggestion: SuggestionSummary | null;
};

export async function loadSessionSnapshotByAccessCode(
  client: SessionReader,
  accessCode: string
): Promise<SessionSnapshot> {
  return loadSessionSnapshot(client, { accessCode });
}

export async function loadSessionSnapshotById(
  client: SessionReader,
  sessionId: string
): Promise<SessionSnapshot> {
  return loadSessionSnapshot(client, { id: sessionId });
}

export function mapTeamSnapshot(team: {
  id: string;
  name: string;
  color: ColorEquipo;
  positionX: number | null;
  positionY: number | null;
  falseAccusation: boolean | null;
}): SessionTeamSnapshot {
  return {
    id: team.id,
    name: team.name,
    color: team.color,
    positionX: team.positionX ?? 0,
    positionY: team.positionY ?? 0,
    falseAccusation: team.falseAccusation ?? false,
  };
}

export function sortTeamsByColor(left: SessionTeamSnapshot, right: SessionTeamSnapshot) {
  return COLOR_SORT_ORDER.indexOf(left.color) - COLOR_SORT_ORDER.indexOf(right.color);
}

async function loadSessionSnapshot(
  client: SessionReader,
  where: { accessCode: string } | { id: string }
): Promise<SessionSnapshot> {
  const session = await client.partida.findUnique({
    where,
    select: {
      id: true,
      accessCode: true,
      status: true,
      startedAt: true,
      pausedAt: true,
      durationMinutes: true,
      skinId: true,
      currentTurnTeamId: true,
      currentTurnStartedAt: true,
      activeDiceValueOne: true,
      activeDiceValueTwo: true,
      activeDiceRemainingMoves: true,
      activeSuggestionEventId: true,
      currentTurnTeam: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
      teams: {
        select: {
          id: true,
          name: true,
          color: true,
          positionX: true,
          positionY: true,
          falseAccusation: true,
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

  const skin = await loadSkinConfiguration(client, session.skinId);
  const durationMinutes = normalizeDurationMinutes(session.durationMinutes, skin.duration);
  const durationSeconds = durationMinutes * 60;
  const startedAt = session.startedAt?.toISOString() ?? null;
  const activeSuggestion = session.activeSuggestionEventId
    ? await loadActiveSuggestionSummaryById(client, session.activeSuggestionEventId)
    : null;

  return {
    id: session.id,
    accessCode: session.accessCode,
    status: session.status ?? EstadoPartida.LOBBY,
    startedAt,
    durationSeconds,
    remainingSeconds: calculateRemainingSeconds(
      durationSeconds,
      session.status ?? EstadoPartida.LOBBY,
      session.startedAt,
      session.pausedAt
    ),
    skin,
    teams: session.teams.map(mapTeamSnapshot).sort(sortTeamsByColor),
    turn: buildTurnSnapshot(session),
    activeSuggestion,
  };
}

function buildTurnSnapshot(session: {
  currentTurnTeamId: string | null;
  currentTurnStartedAt: Date | null;
  activeDiceValueOne: number | null;
  activeDiceValueTwo: number | null;
  activeDiceRemainingMoves: number | null;
  currentTurnTeam: {
    id: string;
    name: string;
    color: ColorEquipo;
  } | null;
}) {
  if (!session.currentTurnTeamId || !session.currentTurnTeam) {
    return null;
  }

  return {
    currentTeamId: session.currentTurnTeam.id,
    currentTeamName: session.currentTurnTeam.name,
    currentTeamColor: session.currentTurnTeam.color,
    startedAt: session.currentTurnStartedAt?.toISOString() ?? null,
    dice:
      typeof session.activeDiceValueOne === 'number' && typeof session.activeDiceValueTwo === 'number'
        ? {
            valueOne: session.activeDiceValueOne,
            valueTwo: session.activeDiceValueTwo,
            total: session.activeDiceValueOne + session.activeDiceValueTwo,
          }
        : null,
    remainingMoves:
      typeof session.activeDiceValueOne === 'number' && typeof session.activeDiceValueTwo === 'number'
        ? getTurnRemainingMoves(
            session.activeDiceValueOne + session.activeDiceValueTwo,
            session.activeDiceRemainingMoves
          )
        : null,
  } satisfies SessionTurnSnapshot;
}

function getTurnRemainingMoves(total: number, remainingMoves: number | null) {
  if (typeof remainingMoves !== 'number' || !Number.isInteger(remainingMoves) || remainingMoves < 0) {
    return total;
  }

  return Math.min(remainingMoves, total);
}

function normalizeDurationMinutes(durationMinutes: number | null, fallbackDuration: string) {
  if (typeof durationMinutes === 'number' && Number.isFinite(durationMinutes) && durationMinutes > 0) {
    return Math.trunc(durationMinutes);
  }

  const parsed = Number.parseInt(fallbackDuration, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

function calculateRemainingSeconds(
  durationSeconds: number,
  status: EstadoPartida,
  startedAt: Date | null,
  pausedAt: Date | null
) {
  if (!startedAt) {
    return durationSeconds;
  }

  if (status === EstadoPartida.PAUSADA && pausedAt) {
    const elapsedSecondsWhenPaused = Math.max(0, Math.floor((pausedAt.getTime() - startedAt.getTime()) / 1000));
    return Math.max(0, durationSeconds - elapsedSecondsWhenPaused);
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
  return Math.max(0, durationSeconds - elapsedSeconds);
}