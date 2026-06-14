import { ColorEquipo, EstadoPartida, RazonEliminacionEquipo } from '@prisma/client';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';
import { loadSkinConfiguration, type LoadedSkinConfiguration } from './skinConfigs.js';
import { getSessionResolutionSnapshot, type SessionResolutionSnapshot } from './sessionResolution.js';
import { loadActiveSuggestionSummaryById, type SuggestionSummary } from './sessionSuggestion.js';
import { buildSkinItemLookup, sortHandCards, type TeamHandCard } from './sessionCards.js';

export const COLOR_SORT_ORDER: ColorEquipo[] = [
  ColorEquipo.ROJO,
  ColorEquipo.AMARILLO,
  ColorEquipo.AZUL,
  ColorEquipo.VERDE,
  ColorEquipo.MORADO,
  ColorEquipo.BLANCO,
];

export const COLOR_LABELS: Record<ColorEquipo, string> = {
  [ColorEquipo.ROJO]: 'Equipo Rojo',
  [ColorEquipo.AMARILLO]: 'Equipo Amarillo',
  [ColorEquipo.AZUL]: 'Equipo Azul',
  [ColorEquipo.VERDE]: 'Equipo Verde',
  [ColorEquipo.MORADO]: 'Equipo Morado',
  [ColorEquipo.BLANCO]: 'Equipo Blanco',
};

export type SessionReader = Pick<typeof prisma, 'partida' | 'cluEdSkin' | 'evento' | 'cartaPublica'>;

export type SessionTeamSnapshot = {
  id: string;
  name: string;
  color: ColorEquipo;
  positionX: number;
  positionY: number;
  falseAccusation: boolean;
  eliminatedAt: string | null;
  eliminationReason: RazonEliminacionEquipo | null;
};

export type SessionWinnerSnapshot = {
  id: string;
  name: string;
  color: ColorEquipo;
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
  hasMoved: boolean;
};

export type SessionSnapshot = {
  id: string;
  accessCode: string;
  status: EstadoPartida;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number;
  remainingSeconds: number;
  skin: LoadedSkinConfiguration;
  teams: SessionTeamSnapshot[];
  turn: SessionTurnSnapshot | null;
  activeSuggestion: SuggestionSummary | null;
  winnerTeam: SessionWinnerSnapshot | null;
  resolution: SessionResolutionSnapshot | null;
  publicCards: TeamHandCard[];
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
  eliminatedAt: Date | null;
  eliminationReason: RazonEliminacionEquipo | null;
}): SessionTeamSnapshot {
  return {
    id: team.id,
    name: team.name,
    color: team.color,
    positionX: team.positionX ?? 0,
    positionY: team.positionY ?? 0,
    falseAccusation: team.falseAccusation ?? false,
    eliminatedAt: team.eliminatedAt?.toISOString() ?? null,
    eliminationReason: team.eliminationReason ?? null,
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
      finishedAt: true,
      durationMinutes: true,
      skinId: true,
      currentTurnTeamId: true,
      currentTurnStartedAt: true,
      activeDiceValueOne: true,
      activeDiceValueTwo: true,
      activeDiceRemainingMoves: true,
      currentTurnHasMoved: true,
      activeSuggestionEventId: true,
      winnerTeam: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
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
          eliminatedAt: true,
          eliminationReason: true,
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
  const finishedAt = session.finishedAt?.toISOString() ?? null;
  const activeSuggestion = session.activeSuggestionEventId
    ? await loadActiveSuggestionSummaryById(client, session.activeSuggestionEventId)
    : null;

  const rawPublicCards = await client.cartaPublica.findMany({
    where: { partidaId: session.id },
    include: {
      element: { select: { id: true, kind: true, name: true, imageUrl: true } },
    },
  });
  const skinItems = buildSkinItemLookup(skin);

  const mapPublicCard = (pc: (typeof rawPublicCards)[number]): TeamHandCard => {
    const skinItem = skinItems.get(pc.elementId);
    return {
      id: pc.elementId,
      kind: pc.element.kind,
      name: pc.element.name,
      desc: skinItem?.desc ?? '',
      imageUrl: pc.element.imageUrl ?? skinItem?.imageUrl,
      motif: skinItem?.motif,
    } satisfies TeamHandCard;
  };

  const publicCards: TeamHandCard[] = rawPublicCards
    .filter((pc) => !pc.hidden)
    .map(mapPublicCard)
    .sort(sortHandCards);

  return {
    id: session.id,
    accessCode: session.accessCode,
    status: session.status ?? EstadoPartida.LOBBY,
    startedAt,
    finishedAt,
    durationSeconds,
    remainingSeconds: calculateRemainingSeconds(
      durationSeconds,
      session.status ?? EstadoPartida.LOBBY,
      session.startedAt,
      session.pausedAt,
      session.finishedAt
    ),
    skin,
    teams: session.teams.map(mapTeamSnapshot).sort(sortTeamsByColor),
    turn: buildTurnSnapshot(session),
    activeSuggestion,
    winnerTeam: session.winnerTeam
      ? {
          id: session.winnerTeam.id,
          name: session.winnerTeam.name,
          color: session.winnerTeam.color,
        }
      : null,
    resolution: getSessionResolutionSnapshot(session.id),
    publicCards,
  };
}

function buildTurnSnapshot(session: {
  currentTurnTeamId: string | null;
  currentTurnStartedAt: Date | null;
  activeDiceValueOne: number | null;
  activeDiceValueTwo: number | null;
  activeDiceRemainingMoves: number | null;
  currentTurnHasMoved: boolean;
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
    hasMoved: session.currentTurnHasMoved,
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
  pausedAt: Date | null,
  finishedAt: Date | null
) {
  if (!startedAt) {
    return durationSeconds;
  }

  if (status === EstadoPartida.FINALIZADA && finishedAt) {
    const elapsedSecondsWhenFinished = Math.max(0, Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000));
    return Math.max(0, durationSeconds - elapsedSecondsWhenFinished);
  }

  if (status === EstadoPartida.PAUSADA && pausedAt) {
    const elapsedSecondsWhenPaused = Math.max(0, Math.floor((pausedAt.getTime() - startedAt.getTime()) / 1000));
    return Math.max(0, durationSeconds - elapsedSecondsWhenPaused);
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
  return Math.max(0, durationSeconds - elapsedSeconds);
}