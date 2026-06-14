import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ColorEquipo,
  EstadoPartida,
  PrismaClient,
  RazonEliminacionEquipo,
  TipoElemento,
  TipoEvento,
} from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import sessionRoutes from '../src/routes/sessionRoutes.js';
import { getTeamSpawnPosition } from '../src/lib/teamSpawnPositions.js';
import { getTestDatabaseUrl } from './helpers/testDatabase';

type FinalAccusationResponse = {
  item: {
    session: {
      id: string;
      status: EstadoPartida;
      finishedAt: string | null;
      turn: {
        currentTeamId: string;
      } | null;
      winnerTeam: {
        id: string;
      } | null;
      teams: Array<{
        id: string;
        falseAccusation: boolean;
        eliminatedAt: string | null;
        eliminationReason: RazonEliminacionEquipo | null;
      }>;
    };
    verdict: {
      outcome: 'CORRECTA' | 'INCORRECTA';
      accuserTeamId: string;
      winnerTeamId: string | null;
      eliminatedTeamId: string | null;
      sessionFinished: boolean;
      accusation: {
        subject: { id: string; name: string };
        object: { id: string; name: string };
        space: { id: string; name: string };
      };
    };
  };
};

type ErrorResponse = {
  error: string;
  details?: string[];
};

type SeedAccusationSessionOptions = {
  extraTeams?: Array<{
    color: ColorEquipo;
    name: string;
  }>;
  currentTurnColor?: ColorEquipo;
  eliminatedTeamColors?: ColorEquipo[];
  withPendingSuggestion?: boolean;
};

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getTestDatabaseUrl(),
    },
  },
});

describe('SCRUM-89 acusacion final', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/game', sessionRoutes);

    server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('No se pudo resolver el puerto del servidor de pruebas de acusacion final.');
    }

    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
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

  it('elimina al equipo si la acusacion final falla y pasa el turno al siguiente equipo activo', async () => {
    const seeded = await seedAccusationSession('ACUF01');

    const response = await request(`/api/game/sessions/ACUF01/teams/${seeded.redTeamId}/accuse`, {
      method: 'POST',
      body: JSON.stringify({
        subjectElementId: seeded.subjectIds[1],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      }),
    });
    const body = (await response.json()) as FinalAccusationResponse;

    expect(response.status).toBe(200);
    expect(body.item.verdict).toMatchObject({
      outcome: 'INCORRECTA',
      accuserTeamId: seeded.redTeamId,
      winnerTeamId: null,
      eliminatedTeamId: seeded.redTeamId,
      sessionFinished: false,
      accusation: {
        subject: { id: seeded.subjectIds[1], name: 'Sujeto 2' },
        object: { id: seeded.objectIds[0], name: 'Objeto 1' },
        space: { id: seeded.spaceIds[0], name: 'Espacio 1' },
      },
    });
    expect(body.item.session.status).toBe(EstadoPartida.EN_CURSO);
    expect(body.item.session.turn?.currentTeamId).toBe(seeded.blueTeamId);
    expect(body.item.session.winnerTeam).toBeNull();

    const redTeamSnapshot = body.item.session.teams.find((team) => team.id === seeded.redTeamId);
    expect(redTeamSnapshot).toMatchObject({
      falseAccusation: true,
      eliminationReason: RazonEliminacionEquipo.ACUSACION_FALSA,
    });
    expect(redTeamSnapshot?.eliminatedAt).toEqual(expect.any(String));

    const persistedSession = await prisma.partida.findUniqueOrThrow({
      where: { id: seeded.sessionId },
      select: {
        status: true,
        winnerTeamId: true,
        finishedAt: true,
        currentTurnTeamId: true,
      },
    });
    const persistedRedTeam = await prisma.equipo.findUniqueOrThrow({
      where: { id: seeded.redTeamId },
      select: {
        falseAccusation: true,
        eliminatedAt: true,
        eliminationReason: true,
      },
    });
    const accusationEvent = await prisma.evento.findFirstOrThrow({
      where: {
        partidaId: seeded.sessionId,
        emitterId: seeded.redTeamId,
        eventType: TipoEvento.ACUSACION,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });

    expect(persistedSession).toMatchObject({
      status: EstadoPartida.EN_CURSO,
      winnerTeamId: null,
      finishedAt: null,
      currentTurnTeamId: seeded.blueTeamId,
    });
    expect(persistedRedTeam).toMatchObject({
      falseAccusation: true,
      eliminationReason: RazonEliminacionEquipo.ACUSACION_FALSA,
    });
    expect(persistedRedTeam.eliminatedAt).toBeInstanceOf(Date);
    expect(accusationEvent.detail).toMatchObject({
      kind: 'FINAL_ACCUSATION',
      outcome: 'INCORRECTA',
      eliminatedTeamId: seeded.redTeamId,
      winnerTeamId: null,
      sessionFinished: false,
    });
  });

  it('finaliza la partida y registra al ganador si la acusacion final coincide con el sobre', async () => {
    const seeded = await seedAccusationSession('ACUF02');

    const response = await request(`/api/game/sessions/ACUF02/teams/${seeded.redTeamId}/accuse`, {
      method: 'POST',
      body: JSON.stringify({
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      }),
    });
    const body = (await response.json()) as FinalAccusationResponse;

    expect(response.status).toBe(200);
    expect(body.item.verdict).toMatchObject({
      outcome: 'CORRECTA',
      accuserTeamId: seeded.redTeamId,
      winnerTeamId: seeded.redTeamId,
      eliminatedTeamId: null,
      sessionFinished: true,
    });
    expect(body.item.session.status).toBe(EstadoPartida.FINALIZADA);
    expect(body.item.session.turn).toBeNull();
    expect(body.item.session.finishedAt).toEqual(expect.any(String));
    expect(body.item.session.winnerTeam).toMatchObject({
      id: seeded.redTeamId,
    });

    const persistedSession = await prisma.partida.findUniqueOrThrow({
      where: { id: seeded.sessionId },
      select: {
        status: true,
        winnerTeamId: true,
        finishedAt: true,
        currentTurnTeamId: true,
      },
    });

    expect(persistedSession.status).toBe(EstadoPartida.FINALIZADA);
    expect(persistedSession.winnerTeamId).toBe(seeded.redTeamId);
    expect(persistedSession.finishedAt).toBeInstanceOf(Date);
    expect(persistedSession.currentTurnTeamId).toBeNull();
  });

  it('mantiene el orden circular si el equipo actual queda eliminado por una acusacion final fallida', async () => {
    const seeded = await seedAccusationSession('ACUF03', {
      extraTeams: [{ color: ColorEquipo.AMARILLO, name: 'Equipo Amarillo' }],
      currentTurnColor: ColorEquipo.AMARILLO,
    });
    const yellowTeamId = seeded.teamIdsByColor[ColorEquipo.AMARILLO];

    if (!yellowTeamId) {
      throw new Error('La semilla de la prueba no ha creado el equipo amarillo.');
    }

    const response = await request(`/api/game/sessions/ACUF03/teams/${yellowTeamId}/accuse`, {
      method: 'POST',
      body: JSON.stringify({
        subjectElementId: seeded.subjectIds[1],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      }),
    });
    const body = (await response.json()) as FinalAccusationResponse;

    expect(response.status).toBe(200);
    expect(body.item.verdict).toMatchObject({
      outcome: 'INCORRECTA',
      accuserTeamId: yellowTeamId,
      eliminatedTeamId: yellowTeamId,
      sessionFinished: false,
    });
    expect(body.item.session.status).toBe(EstadoPartida.EN_CURSO);
    expect(body.item.session.turn?.currentTeamId).toBe(seeded.blueTeamId);

    const persistedSession = await prisma.partida.findUniqueOrThrow({
      where: { id: seeded.sessionId },
      select: {
        currentTurnTeamId: true,
      },
    });

    expect(persistedSession.currentTurnTeamId).toBe(seeded.blueTeamId);
  });

  it('finaliza la partida sin ganador si el ultimo equipo activo falla la acusacion final', async () => {
    const seeded = await seedAccusationSession('ACUF04', {
      eliminatedTeamColors: [ColorEquipo.AZUL],
    });

    const response = await request(`/api/game/sessions/ACUF04/teams/${seeded.redTeamId}/accuse`, {
      method: 'POST',
      body: JSON.stringify({
        subjectElementId: seeded.subjectIds[1],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      }),
    });
    const body = (await response.json()) as FinalAccusationResponse;

    expect(response.status).toBe(200);
    expect(body.item.verdict).toMatchObject({
      outcome: 'INCORRECTA',
      accuserTeamId: seeded.redTeamId,
      winnerTeamId: null,
      eliminatedTeamId: seeded.redTeamId,
      sessionFinished: true,
    });
    expect(body.item.session.status).toBe(EstadoPartida.FINALIZADA);
    expect(body.item.session.turn).toBeNull();
    expect(body.item.session.winnerTeam).toBeNull();
    expect(body.item.session.finishedAt).toEqual(expect.any(String));

    const persistedSession = await prisma.partida.findUniqueOrThrow({
      where: { id: seeded.sessionId },
      select: {
        status: true,
        winnerTeamId: true,
        finishedAt: true,
        currentTurnTeamId: true,
      },
    });

    expect(persistedSession).toMatchObject({
      status: EstadoPartida.FINALIZADA,
      winnerTeamId: null,
      currentTurnTeamId: null,
    });
    expect(persistedSession.finishedAt).toBeInstanceOf(Date);
  });

  it('rechaza la acusacion final mientras hay una sugerencia pendiente de refutacion', async () => {
    const seeded = await seedAccusationSession('ACUF05', {
      withPendingSuggestion: true,
    });

    const response = await request(`/api/game/sessions/ACUF05/teams/${seeded.redTeamId}/accuse`, {
      method: 'POST',
      body: JSON.stringify({
        subjectElementId: seeded.subjectIds[0],
        objectElementId: seeded.objectIds[0],
        spaceElementId: seeded.spaceIds[0],
      }),
    });
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(409);
    expect(body.error).toBe('Hay una sugerencia pendiente de refutación y la partida está temporalmente bloqueada.');

    const persistedSession = await prisma.partida.findUniqueOrThrow({
      where: { id: seeded.sessionId },
      select: {
        status: true,
        currentTurnTeamId: true,
        activeSuggestionEventId: true,
      },
    });
    const persistedRedTeam = await prisma.equipo.findUniqueOrThrow({
      where: { id: seeded.redTeamId },
      select: {
        falseAccusation: true,
        eliminatedAt: true,
      },
    });
    const accusationEvents = await prisma.evento.findMany({
      where: {
        partidaId: seeded.sessionId,
        eventType: TipoEvento.ACUSACION,
      },
    });

    expect(persistedSession).toMatchObject({
      status: EstadoPartida.EN_CURSO,
      currentTurnTeamId: seeded.redTeamId,
      activeSuggestionEventId: seeded.pendingSuggestionEventId,
    });
    expect(persistedRedTeam).toEqual({
      falseAccusation: false,
      eliminatedAt: null,
    });
    expect(accusationEvents).toHaveLength(0);
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

async function seedAccusationSession(accessCode: string, options: SeedAccusationSessionOptions = {}) {
  const timestamp = Date.now();
  const skin = await prisma.cluEdSkin.create({
    data: {
      name: `Skin ${accessCode}`,
      objective: 'Validar la acusación final.',
      imageUrl: '',
      context: JSON.stringify({
        version: 1,
        gameTitle: 'Laboratorio de Acusacion',
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
      startedAt: new Date(),
      durationMinutes: 45,
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

  const extraTeams = [] as Array<{ id: string; color: ColorEquipo; name: string }>;

  for (const teamConfig of options.extraTeams ?? []) {
    const extraTeam = await prisma.equipo.create({
      data: {
        partidaId: session.id,
        color: teamConfig.color,
        name: teamConfig.name,
        ...getTeamSpawnPosition(teamConfig.color),
      },
    });

    extraTeams.push({
      id: extraTeam.id,
      color: extraTeam.color,
      name: extraTeam.name,
    });
  }

  const allTeams = [
    { id: redTeam.id, color: redTeam.color, name: redTeam.name },
    { id: blueTeam.id, color: blueTeam.color, name: blueTeam.name },
    ...extraTeams,
  ];

  const teamIdsByColor = allTeams.reduce<Partial<Record<ColorEquipo, string>>>((accumulator, team) => {
    accumulator[team.color] = team.id;
    return accumulator;
  }, {});

  const eliminatedTeamColors = new Set(options.eliminatedTeamColors ?? []);

  if (eliminatedTeamColors.size > 0) {
    await prisma.equipo.updateMany({
      where: {
        id: {
          in: allTeams
            .filter((team) => eliminatedTeamColors.has(team.color))
            .map((team) => team.id),
        },
      },
      data: {
        falseAccusation: true,
        eliminatedAt: new Date('2026-05-14T08:00:00.000Z'),
        eliminationReason: RazonEliminacionEquipo.ACUSACION_FALSA,
      },
    });
  }

  const currentTurnColor = options.currentTurnColor ?? ColorEquipo.ROJO;
  const currentTurnTeamId = teamIdsByColor[currentTurnColor];

  if (!currentTurnTeamId) {
    throw new Error(`La semilla no ha podido resolver el equipo con color ${currentTurnColor}.`);
  }

  let pendingSuggestionEventId: string | null = null;

  if (options.withPendingSuggestion) {
    const refutingTeamId = allTeams.find((team) => team.id !== currentTurnTeamId)?.id ?? null;
    const suggestionEvent = await prisma.evento.create({
      data: {
        partidaId: session.id,
        emitterId: currentTurnTeamId,
        receiverId: refutingTeamId,
        eventType: TipoEvento.SUGERENCIA,
        occurredAt: new Date('2026-05-14T10:05:00.000Z'),
        detail: {
          version: 1,
          kind: 'SUGGESTION',
          subjectElementId: subjects[0].id,
          objectElementId: objects[0].id,
          spaceElementId: spaces[0].id,
        },
      },
      select: {
        id: true,
      },
    });

    pendingSuggestionEventId = suggestionEvent.id;
  }

  await prisma.partida.update({
    where: { id: session.id },
    data: {
      currentTurnTeamId,
      currentTurnStartedAt: new Date(),
      activeSuggestionEventId: pendingSuggestionEventId,
    },
  });

  return {
    sessionId: session.id,
    redTeamId: redTeam.id,
    blueTeamId: blueTeam.id,
    teamIdsByColor,
    pendingSuggestionEventId,
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