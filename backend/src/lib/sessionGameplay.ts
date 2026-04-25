import { randomInt } from 'node:crypto';
import { EstadoPartida, TipoElemento, type ColorEquipo } from '@prisma/client';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';
import { loadSkinConfiguration, type LoadedSkinConfiguration } from './skinConfigs.js';
import {
  COLOR_SORT_ORDER,
  loadSessionSnapshotByAccessCode,
  type SessionSnapshot,
  type SessionTeamSnapshot,
} from './sessionSnapshots.js';

type SessionGameplayClient = Pick<
  typeof prisma,
  'partida' | 'solucion' | 'tablaRazonamiento' | 'celdaRazonamiento' | 'cartaEquipo' | 'cluedoSkin'
>;

type TeamTerminalStateClient = Pick<typeof prisma, 'partida' | 'cartaEquipo' | 'cluedoSkin'>;

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
};

type SkinConfigItem = LoadedSkinConfiguration['subjects'][number];

export type TeamHandCard = {
  id: string;
  kind: TipoElemento;
  name: string;
  desc: string;
  imageUrl?: string | undefined;
  motif?: string | undefined;
};

export type TeamTerminalState = {
  session: SessionSnapshot;
  team: SessionTeamSnapshot;
  hand: TeamHandCard[];
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
  const setup = buildDistributedGameSetup(skin, teams.map((team) => team.id));

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
  }

  await client.partida.update({
    where: { id: session.id },
    data: {
      status: EstadoPartida.EN_CURSO,
      startedAt: new Date(),
      solutionId: solution.id,
    },
  });
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
  };
}

function buildDistributedGameSetup(skin: LoadedSkinConfiguration, teamIds: string[]): DistributedGameSetup {
  ensurePlayableCollections(skin);

  const subject = pickRandomItem(skin.subjects);
  const object = pickRandomItem(skin.objects);
  const space = pickRandomItem(skin.spaces);
  const allElementIds = [...skin.subjects, ...skin.objects, ...skin.spaces].map((item) => item.id);
  const cardsByTeam = teamIds.map((teamId) => ({ teamId, elementIds: [] as string[] }));

  distributeDeckByCurrentLoad(
    cardsByTeam,
    shuffleArray(skin.subjects.filter((item) => item.id !== subject.id).map((item) => item.id))
  );
  distributeDeckByCurrentLoad(
    cardsByTeam,
    shuffleArray(skin.objects.filter((item) => item.id !== object.id).map((item) => item.id))
  );
  distributeDeckByCurrentLoad(
    cardsByTeam,
    shuffleArray(skin.spaces.filter((item) => item.id !== space.id).map((item) => item.id))
  );

  return {
    solution: {
      subjectElementId: subject.id,
      objectElementId: object.id,
      spaceElementId: space.id,
    },
    allElementIds,
    cardsByTeam,
  };
}

function ensurePlayableCollections(skin: LoadedSkinConfiguration) {
  if (skin.subjects.length === 0 || skin.objects.length === 0 || skin.spaces.length === 0) {
    throw new HttpError(409, 'La configuración de la sesión no contiene suficientes elementos para iniciar la partida.');
  }
}

function buildSkinItemLookup(skin: LoadedSkinConfiguration) {
  return new Map<string, SkinConfigItem>(
    [...skin.subjects, ...skin.objects, ...skin.spaces].map((item) => [item.id, item])
  );
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

function distributeDeckByCurrentLoad(cardsByTeam: TeamCardAssignment[], deckElementIds: string[]) {
  if (cardsByTeam.length === 0 || deckElementIds.length === 0) {
    return;
  }

  const distributionOrder = [...cardsByTeam]
    .map((assignment, index) => ({
      assignment,
      index,
      cardCount: assignment.elementIds.length,
    }))
    .sort((left, right) => {
      const cardCountDifference = left.cardCount - right.cardCount;

      if (cardCountDifference !== 0) {
        return cardCountDifference;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.assignment);

  deckElementIds.forEach((elementId, index) => {
    distributionOrder[index % distributionOrder.length]?.elementIds.push(elementId);
  });
}

function sortTeamsByColor(left: SessionTeamRecord, right: SessionTeamRecord) {
  return COLOR_SORT_ORDER.indexOf(left.color) - COLOR_SORT_ORDER.indexOf(right.color);
}

function sortHandCards(left: TeamHandCard, right: TeamHandCard) {
  const kindOrder = [TipoElemento.SUJETO, TipoElemento.OBJETO, TipoElemento.ESPACIO];
  const kindDifference = kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind);

  if (kindDifference !== 0) {
    return kindDifference;
  }

  return left.name.localeCompare(right.name, 'es');
}