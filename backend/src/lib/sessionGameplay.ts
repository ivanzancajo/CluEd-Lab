import { randomInt } from 'node:crypto';
import { EstadoPartida, type ColorEquipo } from '@prisma/client';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';
import { loadSkinConfiguration, type LoadedSkinConfiguration } from './skinConfigs.js';
import {
  loadPendingTeamSuggestionStateByAccessCode,
  type TeamPendingSuggestionState,
} from './sessionSuggestion.js';
import {
  COLOR_SORT_ORDER,
  loadSessionSnapshotById,
  loadSessionSnapshotByAccessCode,
  type SessionSnapshot,
  type SessionTeamSnapshot,
} from './sessionSnapshots.js';
import {
  buildSkinItemLookup,
  sortHandCards,
  type TeamHandCard,
} from './sessionCards.js';

export type { TeamHandCard };

type SessionGameplayClient = Pick<
  typeof prisma,
  'partida' | 'solucion' | 'tablaRazonamiento' | 'celdaRazonamiento' | 'cartaEquipo' | 'cartaPublica' | 'cluedoSkin' | 'evento'
>;

type TeamTerminalStateClient = Pick<typeof prisma, 'partida' | 'cartaEquipo' | 'cartaPublica' | 'cluedoSkin' | 'evento'>;

type SessionTeamRecord = {
  id: string;
  color: ColorEquipo;
};

type TeamCardAssignment = {
  teamId: string;
  elementIds: string[];
};

type DistributedGameSetup = {
  solution: {
    subjectElementId: string;
    objectElementId: string;
    spaceElementId: string;
  };
  allElementIds: string[];
  cardsByTeam: TeamCardAssignment[];
  sobrantes: string[];
};

export const MINIMUM_TEAMS_TO_START = 2;

export type TeamTerminalState = {
  session: SessionSnapshot;
  team: SessionTeamSnapshot;
  hand: TeamHandCard[];
  pendingSuggestion: TeamPendingSuggestionState | null;
};

export async function initializeStartedSession(client: SessionGameplayClient, sessionId: string) {
  const session = await client.partida.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      skinId: true,
      teams: {
        select: {
          id: true,
          color: true,
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
  const teams = [...session.teams].sort(sortTeamsByColor);

  if (teams.length < MINIMUM_TEAMS_TO_START) {
    throw new HttpError(
      409,
      `La partida necesita al menos ${MINIMUM_TEAMS_TO_START} equipos unidos para poder iniciarse.`
    );
  }

  const setup = buildDistributedGameSetup(skin, teams.map((team) => team.id));
  const startedAt = new Date();
  const initialTurnTeamId = teams[0]?.id ?? null;

  const solution = await client.solucion.create({
    data: setup.solution,
  });

  if (teams.length > 0) {
    await client.tablaRazonamiento.createMany({
      data: teams.map((team) => ({ equipoId: team.id })),
    });

    const tables = await client.tablaRazonamiento.findMany({
      where: {
        equipoId: {
          in: teams.map((team) => team.id),
        },
      },
      select: {
        id: true,
        equipoId: true,
      },
    });

    await client.celdaRazonamiento.createMany({
      data: tables.flatMap((table) =>
        setup.allElementIds.map((elementId) => ({
          tablaId: table.id,
          elementId,
        }))
      ),
    });

    const cards = setup.cardsByTeam.flatMap((assignment) =>
      assignment.elementIds.map((elementId) => ({
        equipoId: assignment.teamId,
        elementId,
      }))
    );

    if (cards.length > 0) {
      await client.cartaEquipo.createMany({
        data: cards,
      });
    }

    if (setup.sobrantes.length > 0) {
      await client.cartaPublica.createMany({
        data: setup.sobrantes.map((elementId) => ({
          partidaId: session.id,
          elementId,
          hidden: false,
        })),
      });
    }

  }

  await client.partida.update({
    where: { id: session.id },
    data: {
      status: EstadoPartida.EN_CURSO,
      startedAt,
      pausedAt: null,
      currentTurnTeamId: initialTurnTeamId,
      currentTurnStartedAt: initialTurnTeamId ? startedAt : null,
      activeDiceValueOne: null,
      activeDiceValueTwo: null,
      activeSuggestionEventId: null,
      solutionId: solution.id,
    },
  });
}

export async function startSessionByAccessCode(client: SessionGameplayClient, accessCode: string) {
  const currentSession = await client.partida.findUnique({
    where: { accessCode },
    select: {
      id: true,
      status: true,
    },
  });

  if (!currentSession) {
    throw new HttpError(404, 'La sesión solicitada no existe.');
  }

  if ((currentSession.status ?? EstadoPartida.LOBBY) !== EstadoPartida.LOBBY) {
    throw new HttpError(409, 'La partida ya ha sido iniciada o no admite esta transición.');
  }

  await initializeStartedSession(client, currentSession.id);

  return loadSessionSnapshotByAccessCode(client, accessCode);
}

export async function pauseSession(client: SessionGameplayClient, sessionId: string) {
  const session = await client.partida.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      startedAt: true,
    },
  });

  if (!session) {
    throw new HttpError(404, 'La sesión solicitada no existe.');
  }

  if ((session.status ?? EstadoPartida.LOBBY) !== EstadoPartida.EN_CURSO) {
    throw new HttpError(409, 'La sesión no está en un estado válido para pausarla.');
  }

  if (!session.startedAt) {
    throw new HttpError(409, 'La sesión no tiene una hora de inicio válida para pausar el cronómetro.');
  }

  await client.partida.update({
    where: { id: sessionId },
    data: {
      status: EstadoPartida.PAUSADA,
      pausedAt: new Date(),
    },
  });

  return loadSessionSnapshotById(client, sessionId);
}

export async function resumeSession(client: SessionGameplayClient, sessionId: string) {
  const session = await client.partida.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      pausedAt: true,
      currentTurnStartedAt: true,
    },
  });

  if (!session) {
    throw new HttpError(404, 'La sesión solicitada no existe.');
  }

  if ((session.status ?? EstadoPartida.LOBBY) !== EstadoPartida.PAUSADA) {
    throw new HttpError(409, 'La sesión no está en un estado válido para reanudarla.');
  }

  if (!session.startedAt || !session.pausedAt) {
    throw new HttpError(409, 'La sesión no tiene una marca de pausa válida para reanudar el cronómetro.');
  }

  const resumedAt = new Date();
  const pauseDurationMs = Math.max(0, resumedAt.getTime() - session.pausedAt.getTime());

  await client.partida.update({
    where: { id: sessionId },
    data: {
      status: EstadoPartida.EN_CURSO,
      pausedAt: null,
      startedAt: shiftDateByMilliseconds(session.startedAt, pauseDurationMs),
      currentTurnStartedAt: session.currentTurnStartedAt
        ? shiftDateByMilliseconds(session.currentTurnStartedAt, pauseDurationMs)
        : null,
    },
  });

  return loadSessionSnapshotById(client, sessionId);
}

export async function loadTeamTerminalStateByAccessCode(
  client: TeamTerminalStateClient,
  accessCode: string,
  teamId: string
): Promise<TeamTerminalState> {
  const session = await loadSessionSnapshotByAccessCode(client, accessCode);
  const team = session.teams.find((currentTeam) => currentTeam.id === teamId);

  if (!team) {
    throw new HttpError(404, 'El equipo indicado no pertenece a la sesión seleccionada.');
  }

  if (session.status === EstadoPartida.LOBBY) {
    throw new HttpError(409, 'La partida todavía no ha comenzado y no hay cartas repartidas.');
  }

  const skinItems = buildSkinItemLookup(session.skin);
  const cards = await client.cartaEquipo.findMany({
    where: {
      equipoId: teamId,
    },
    include: {
      element: {
        select: {
          id: true,
          kind: true,
          name: true,
          imageUrl: true,
        },
      },
    },
  });

  if (cards.length === 0) {
    throw new HttpError(409, 'Las cartas de este equipo todavía no están disponibles.');
  }

  return {
    session,
    team,
    hand: cards
      .map((card) => {
        const skinItem = skinItems.get(card.elementId);

        return {
          id: card.elementId,
          kind: card.element.kind,
          name: card.element.name,
          desc: skinItem?.desc ?? '',
          imageUrl: card.element.imageUrl ?? skinItem?.imageUrl,
          motif: skinItem?.motif,
        } satisfies TeamHandCard;
      })
      .sort(sortHandCards),
    pendingSuggestion: await loadPendingTeamSuggestionStateByAccessCode(client, accessCode, teamId),
  };
}

function shiftDateByMilliseconds(sourceDate: Date, deltaMs: number) {
  return new Date(sourceDate.getTime() + deltaMs);
}

export function cyclicDeal(
  deck: string[],
  teamCount: number
): { cardsByTeam: string[][]; sobrantes: string[] } {
  const completeRounds = teamCount > 0 ? Math.floor(deck.length / teamCount) : 0;
  const dealCount = completeRounds * teamCount;
  const cardsByTeam: string[][] = Array.from({ length: teamCount }, () => []);

  for (let i = 0; i < dealCount; i++) {
    cardsByTeam[i % teamCount]!.push(deck[i]!);
  }

  return { cardsByTeam, sobrantes: deck.slice(dealCount) };
}

function buildDistributedGameSetup(skin: LoadedSkinConfiguration, teamIds: string[]): DistributedGameSetup {
  ensurePlayableCollections(skin);

  const subject = pickRandomItem(skin.subjects);
  const object = pickRandomItem(skin.objects);
  const space = pickRandomItem(skin.spaces);
  const allElementIds = [...skin.subjects, ...skin.objects, ...skin.spaces].map((item) => item.id);

  // Repartir por categoría para garantizar equilibrio entre equipos dentro de cada tipo.
  // Un reparto mezclado puede concentrar todos los objetos en un equipo y ninguno en otro.
  const subjectDeck = shuffleArray(skin.subjects.filter((s) => s.id !== subject.id).map((s) => s.id));
  const objectDeck  = shuffleArray(skin.objects.filter((o) => o.id !== object.id).map((o) => o.id));
  const spaceDeck   = shuffleArray(skin.spaces.filter((sp) => sp.id !== space.id).map((sp) => sp.id));

  const { cardsByTeam: subjectsByTeam, sobrantes: subjectSobrantes } = cyclicDeal(subjectDeck, teamIds.length);
  const { cardsByTeam: objectsByTeam,  sobrantes: objectSobrantes  } = cyclicDeal(objectDeck,  teamIds.length);
  const { cardsByTeam: spacesByTeam,   sobrantes: spaceSobrantes   } = cyclicDeal(spaceDeck,   teamIds.length);

  const cardsByTeam: TeamCardAssignment[] = teamIds.map((teamId, i) => ({
    teamId,
    elementIds: [
      ...(subjectsByTeam[i] ?? []),
      ...(objectsByTeam[i]  ?? []),
      ...(spacesByTeam[i]   ?? []),
    ],
  }));

  return {
    solution: {
      subjectElementId: subject.id,
      objectElementId: object.id,
      spaceElementId: space.id,
    },
    allElementIds,
    cardsByTeam,
    sobrantes: [...subjectSobrantes, ...objectSobrantes, ...spaceSobrantes],
  };
}

function ensurePlayableCollections(skin: LoadedSkinConfiguration) {
  if (skin.subjects.length === 0 || skin.objects.length === 0 || skin.spaces.length === 0) {
    throw new HttpError(409, 'La configuración de la sesión no contiene suficientes elementos para iniciar la partida.');
  }
}

function pickRandomItem<T>(items: T[]) {
  const selected = items[randomInt(items.length)];

  if (selected === undefined) {
    throw new HttpError(409, 'La configuración de la sesión no contiene suficientes elementos para iniciar la partida.');
  }

  return selected;
}

function shuffleArray<T>(items: T[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = randomInt(index + 1);
    const currentItem = shuffled[index];
    const targetItem = shuffled[targetIndex];

    if (currentItem === undefined || targetItem === undefined) {
      continue;
    }

    shuffled[index] = targetItem;
    shuffled[targetIndex] = currentItem;
  }

  return shuffled;
}

function sortTeamsByColor(left: SessionTeamRecord, right: SessionTeamRecord) {
  return COLOR_SORT_ORDER.indexOf(left.color) - COLOR_SORT_ORDER.indexOf(right.color);
}