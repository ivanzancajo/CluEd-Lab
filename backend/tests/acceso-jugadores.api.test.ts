import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ColorEquipo, EstadoPartida, PrismaClient, TipoElemento } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import { registerSocketServer, type GameStartedPayload, type LobbyPresenceState } from '../src/socket/socketServer.js';
import sessionRoutes from '../src/routes/sessionRoutes.js';
import { getTestDatabaseUrl } from './helpers/testDatabase';

type ErrorResponse = {
  error: string;
  details?: string[];
};

type SessionResponse = {
  item: {
    id: string;
    accessCode: string;
    status: string;
    startedAt: string | null;
    teams: Array<{
      id: string;
      name: string;
      color: string;
    }>;
    skin: {
      id: string;
      name: string;
      gameTitle: string;
    };
  };
};

type JoinResponse = {
  item: {
    session: SessionResponse['item'];
    team: {
      id: string;
      name: string;
      color: string;
    };
  };
};

type TeamTerminalStateResponse = {
  item: {
    session: SessionResponse['item'];
    team: {
      id: string;
      name: string;
      color: string;
    };
    hand: Array<{
      id: string;
      kind: string;
      name: string;
      desc: string;
    }>;
  };
};

type LobbySubscribeResponse =
  | {
      ok: true;
      state: LobbyPresenceState;
    }
  | {
      ok: false;
      error: string;
    };

type StartGameSocketResponse =
  | {
      ok: true;
      payload: GameStartedPayload;
    }
  | {
      ok: false;
      error: string;
    };

const ACCESS_CODE_FORMAT_ERROR = 'El código de acceso debe tener 6 caracteres alfanuméricos.';
const INVALID_ACCESS_CODES = ['A', 'AB', 'ABC', 'ABCD', 'ABCDE', 'ABC-12'];
const PLAYABLE_TEAM_COLORS: readonly ColorEquipo[] = ['ROJO', 'AZUL', 'VERDE', 'BLANCO'];
const FIVE_TEAM_COLORS: readonly ColorEquipo[] = ['ROJO', 'AMARILLO', 'AZUL', 'VERDE', 'MORADO'];
const SIX_TEAM_COLORS: readonly ColorEquipo[] = ['ROJO', 'AMARILLO', 'AZUL', 'VERDE', 'MORADO', 'BLANCO'];

type TeamCardDistribution = {
  teamId: string;
  total: number;
} & Record<TipoElemento, number>;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getTestDatabaseUrl(),
    },
  },
});

describe('SCRUM-35 API de acceso de jugadores', () => {
  let server: Server;
  let baseUrl = '';
  let socketUrl = '';

  function signAdminToken(payload: object, expiresIn: SignOptions['expiresIn'] = '8h') {
    return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn });
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/game', sessionRoutes);

    server = createServer(app);
    registerSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('No se pudo resolver el puerto del servidor de pruebas de acceso de jugadores.');
    }

    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    socketUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await prisma.partida.deleteMany();
    await prisma.solucion.deleteMany();
    await prisma.cluedoSkin.deleteMany();
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

  it('verifica correctamente un código existente de 6 caracteres', async () => {
    const { skin } = await seedSkinAndSession('ABC123');

    const response = await request('/api/game/sessions/abc123');
    const body = (await response.json()) as SessionResponse;

    expect(response.status).toBe(200);
    expect(body.item).toMatchObject({
      accessCode: 'ABC123',
      status: EstadoPartida.LOBBY,
      teams: [],
      skin: {
        id: skin.id,
        name: skin.name,
        gameTitle: 'Laboratorio de Acceso',
      },
    });
  });

  it('reconoce un código existente aunque la partida ya haya empezado', async () => {
    await seedSkinAndSession('START1', {
      status: EstadoPartida.EN_CURSO,
      startedAt: new Date('2026-04-23T10:00:00.000Z'),
    });

    const response = await request('/api/game/sessions/START1');
    const body = (await response.json()) as SessionResponse;

    expect(response.status).toBe(200);
    expect(body.item.status).toBe(EstadoPartida.EN_CURSO);
    expect(body.item.accessCode).toBe('START1');
  });

  it('devuelve 404 cuando el código de 6 caracteres no existe', async () => {
    const response = await request('/api/game/sessions/ZZZZZZ');
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'La sesión solicitada no existe.' });
  });

  it.each(INVALID_ACCESS_CODES)(
    'rechaza la verificación de códigos no válidos con longitud o formato incorrectos: %s',
    async (accessCode) => {
      const response = await request(`/api/game/sessions/${accessCode}`);
      const body = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(body.error).toBe('La solicitud contiene datos inválidos.');
      expect(body.details).toContain(ACCESS_CODE_FORMAT_ERROR);
    }
  );

  it('permite unir un jugador cuando el código es correcto y el color está libre', async () => {
    const { session } = await seedSkinAndSession('JOIN01');

    const response = await request('/api/game/sessions/join01/join', {
      method: 'POST',
      body: JSON.stringify({ color: 'ROJO' }),
    });

    const body = (await response.json()) as JoinResponse;

    expect(response.status).toBe(201);
    expect(body.item.team).toMatchObject({
      name: 'Equipo Rojo',
      color: 'ROJO',
    });
    expect(body.item.session).toMatchObject({
      id: session.id,
      accessCode: 'JOIN01',
    });
    expect(body.item.session.teams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: body.item.team.id,
          name: 'Equipo Rojo',
          color: 'ROJO',
        }),
      ])
    );
  });

  it('rechaza unirse cuando el código no existe', async () => {
    const response = await request('/api/game/sessions/UNKN01/join', {
      method: 'POST',
      body: JSON.stringify({ color: 'ROJO' }),
    });
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'La sesión solicitada no existe.' });
  });

  it('rechaza unirse cuando la partida ya ha empezado', async () => {
    await seedSkinAndSession('PLAY01', { status: EstadoPartida.EN_CURSO });

    const response = await request('/api/game/sessions/PLAY01/join', {
      method: 'POST',
      body: JSON.stringify({ color: 'ROJO' }),
    });
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: 'La sesión ya no admite la conexión de nuevos equipos.', details: undefined });
  });

  it('rechaza unirse cuando el color seleccionado ya está ocupado', async () => {
    const { session } = await seedSkinAndSession('COLOR1');

    await prisma.equipo.create({
      data: {
        partidaId: session.id,
        color: 'ROJO',
        name: 'Equipo Rojo',
      },
    });

    const response = await request('/api/game/sessions/COLOR1/join', {
      method: 'POST',
      body: JSON.stringify({ color: 'ROJO' }),
    });
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: 'El color seleccionado ya está ocupado en esta sesión.', details: undefined });
  });

  it.each(INVALID_ACCESS_CODES)(
    'rechaza el join con códigos inválidos de %s',
    async (accessCode) => {
      const response = await request(`/api/game/sessions/${accessCode}/join`, {
        method: 'POST',
        body: JSON.stringify({ color: 'ROJO' }),
      });
      const body = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(body.error).toBe('La solicitud contiene datos inválidos.');
      expect(body.details).toContain(ACCESS_CODE_FORMAT_ERROR);
    }
  );

  it('rechaza el join cuando el color enviado no es válido', async () => {
    await seedSkinAndSession('COLOR2');

    const response = await request('/api/game/sessions/COLOR2/join', {
      method: 'POST',
      body: JSON.stringify({ color: 'NARANJA' }),
    });
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe('La solicitud contiene datos inválidos.');
    expect(body.details?.[0]).toContain('Invalid option');
  });

  it('inicia la partida creando una solución y una tabla de razonamiento por equipo unido', async () => {
    const seeded = await seedPlayableSession('START9', PLAYABLE_TEAM_COLORS);

    const response = await request('/api/game/sessions/START9/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signAdminToken({ role: 'admin', username: 'admin', sub: 'test-admin' })}`,
      },
    });

    const body = (await response.json()) as SessionResponse;
    const startedSession = await prisma.partida.findUnique({
      where: { id: seeded.session.id },
      include: {
        solution: true,
        teams: {
          include: {
            reasoningTables: {
              include: {
                cells: true,
              },
            },
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(body.item.status).toBe(EstadoPartida.EN_CURSO);
    expect(body.item.startedAt).toEqual(expect.any(String));
    expect(startedSession?.status).toBe(EstadoPartida.EN_CURSO);
    expect(startedSession?.startedAt).toEqual(expect.any(Date));
    expect(startedSession?.solution).not.toBeNull();

    const solution = startedSession?.solution;
    const solutionIds = [solution?.subjectElementId, solution?.objectElementId, solution?.spaceElementId];

    expect(solutionIds).not.toContain(undefined);
    expect(solutionIds).not.toContain(null);
    expect(seeded.subjectIds).toContain(solution?.subjectElementId ?? '');
    expect(seeded.objectIds).toContain(solution?.objectElementId ?? '');
    expect(seeded.spaceIds).toContain(solution?.spaceElementId ?? '');

    const reasoningTables = startedSession?.teams.flatMap((team) => team.reasoningTables) ?? [];
    const expectedCellCount = seeded.subjectIds.length + seeded.objectIds.length + seeded.spaceIds.length;

    expect(reasoningTables).toHaveLength(PLAYABLE_TEAM_COLORS.length);
    reasoningTables.forEach((table) => {
      const elementIds = table.cells.map((cell) => cell.elementId).filter((elementId): elementId is string => Boolean(elementId));

      expect(table.cells).toHaveLength(expectedCellCount);
      expect(new Set(elementIds).size).toBe(expectedCellCount);
    });
  });

  it('rechaza iniciar la partida cuando hay menos de dos equipos unidos', async () => {
    await seedPlayableSession('START2', ['ROJO']);

    const response = await request('/api/game/sessions/START2/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signAdminToken({ role: 'admin', username: 'admin', sub: 'test-admin' })}`,
      },
    });
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: 'La partida necesita al menos 2 equipos unidos para poder iniciarse.',
      details: undefined,
    });
  });

  it('devuelve la mano repartida del equipo cuando la partida ya está iniciada', async () => {
    const seeded = await seedPlayableSession('HAND01', PLAYABLE_TEAM_COLORS);

    await request('/api/game/sessions/HAND01/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signAdminToken({ role: 'admin', username: 'admin', sub: 'test-admin' })}`,
      },
    });

    const response = await request(`/api/game/sessions/HAND01/teams/${seeded.teamIds[0]}/state`);
    const body = (await response.json()) as TeamTerminalStateResponse;
    const assignedCards = await prisma.cartaEquipo.findMany({
      where: {
        equipoId: seeded.teamIds[0],
      },
    });
    const cardCounts = await Promise.all(
      seeded.teamIds.map((teamId) =>
        prisma.cartaEquipo.count({
          where: {
            equipoId: teamId,
          },
        })
      )
    );

    expect(response.status).toBe(200);
    expect(body.item.session.status).toBe(EstadoPartida.EN_CURSO);
    expect(body.item.team.id).toBe(seeded.teamIds[0]);
    expect(body.item.hand).toHaveLength(assignedCards.length);
    expect(new Set(body.item.hand.map((card) => card.id)).size).toBe(body.item.hand.length);
    expect(cardCounts.reduce((sum, current) => sum + current, 0)).toBe(18);
    expect(Math.max(...cardCounts) - Math.min(...cardCounts)).toBeLessThanOrEqual(1);
  });

  it('rechaza solicitar la mano de un equipo antes de que la partida haya comenzado', async () => {
    const seeded = await seedPlayableSession('WAIT01', PLAYABLE_TEAM_COLORS);

    const response = await request(`/api/game/sessions/WAIT01/teams/${seeded.teamIds[0]}/state`);
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: 'La partida todavía no ha comenzado y no hay cartas repartidas.',
      details: undefined,
    });
  });

  it('devuelve 404 cuando el equipo solicitado no pertenece a la sesión', async () => {
    await seedPlayableSession('MISS01', PLAYABLE_TEAM_COLORS);

    await request('/api/game/sessions/MISS01/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signAdminToken({ role: 'admin', username: 'admin', sub: 'test-admin' })}`,
      },
    });

    const response = await request('/api/game/sessions/MISS01/teams/00000000-0000-4000-8000-000000000000/state');
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: 'El equipo indicado no pertenece a la sesión seleccionada.',
      details: undefined,
    });
  });

  it('equilibra el reparto por colección cuando participan cuatro equipos', async () => {
    const seeded = await seedPlayableSession('BAL404', PLAYABLE_TEAM_COLORS);

    await request('/api/game/sessions/BAL404/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signAdminToken({ role: 'admin', username: 'admin', sub: 'test-admin' })}`,
      },
    });

    const distributions = await getTeamCardDistributions(seeded.teamIds);

    expect(distributions).toHaveLength(PLAYABLE_TEAM_COLORS.length);
    expect(distributions.every((distribution) => distribution.total >= 4 && distribution.total <= 5)).toBe(true);
    expect(distributions.every((distribution) => distribution[TipoElemento.SUJETO] >= 1)).toBe(true);
    expect(distributions.every((distribution) => distribution[TipoElemento.OBJETO] >= 1)).toBe(true);
    expect(distributions.every((distribution) => distribution[TipoElemento.ESPACIO] === 2)).toBe(true);
    expect(getDistributionSpread(distributions.map((distribution) => distribution.total))).toBeLessThanOrEqual(1);
    expect(
      getDistributionSpread(distributions.map((distribution) => distribution[TipoElemento.SUJETO]))
    ).toBeLessThanOrEqual(1);
    expect(
      getDistributionSpread(distributions.map((distribution) => distribution[TipoElemento.OBJETO]))
    ).toBeLessThanOrEqual(1);
    expect(
      getDistributionSpread(distributions.map((distribution) => distribution[TipoElemento.ESPACIO]))
    ).toBeLessThanOrEqual(1);
  });

  it('mantiene el reparto equilibrado cuando participan cinco equipos', async () => {
    const seeded = await seedPlayableSession('BAL505', FIVE_TEAM_COLORS);

    await request('/api/game/sessions/BAL505/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signAdminToken({ role: 'admin', username: 'admin', sub: 'test-admin' })}`,
      },
    });

    const distributions = await getTeamCardDistributions(seeded.teamIds);

    expect(distributions).toHaveLength(FIVE_TEAM_COLORS.length);
    expect(distributions.every((distribution) => distribution.total >= 3 && distribution.total <= 4)).toBe(true);
    expect(distributions.every((distribution) => distribution[TipoElemento.SUJETO] === 1)).toBe(true);
    expect(distributions.every((distribution) => distribution[TipoElemento.OBJETO] === 1)).toBe(true);
    expect(distributions.every((distribution) => distribution[TipoElemento.ESPACIO] >= 1)).toBe(true);
    expect(distributions.every((distribution) => distribution[TipoElemento.ESPACIO] <= 2)).toBe(true);
    expect(getDistributionSpread(distributions.map((distribution) => distribution.total))).toBeLessThanOrEqual(1);
    expect(
      getDistributionSpread(distributions.map((distribution) => distribution[TipoElemento.ESPACIO]))
    ).toBeLessThanOrEqual(1);
  });

  it('mantiene tres cartas por equipo cuando se inicia una partida con seis equipos', async () => {
    const seeded = await seedPlayableSession('BAL606', SIX_TEAM_COLORS);

    await request('/api/game/sessions/BAL606/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signAdminToken({ role: 'admin', username: 'admin', sub: 'test-admin' })}`,
      },
    });

    const distributions = await getTeamCardDistributions(seeded.teamIds);

    expect(distributions).toHaveLength(SIX_TEAM_COLORS.length);
    expect(distributions.every((distribution) => distribution.total === 3)).toBe(true);
    expect(
      getDistributionSpread(distributions.map((distribution) => distribution[TipoElemento.SUJETO]))
    ).toBeLessThanOrEqual(1);
    expect(
      getDistributionSpread(distributions.map((distribution) => distribution[TipoElemento.OBJETO]))
    ).toBeLessThanOrEqual(1);
    expect(
      getDistributionSpread(distributions.map((distribution) => distribution[TipoElemento.ESPACIO]))
    ).toBeLessThanOrEqual(1);
  });

  it('emite gameStarted cuando el admin inicia la partida por socket', async () => {
    const seeded = await seedPlayableSession('SOCK01', ['ROJO', 'AZUL']);
    const hostSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', username: 'admin', sub: 'socket-admin' }));
    const teamSocket = await connectSocketClient(socketUrl);

    try {
      const hostSubscription = await emitSocketAck<LobbySubscribeResponse>(hostSocket, 'lobby:host-subscribe', {
        sessionId: seeded.session.id,
      });
      const teamSubscription = await emitSocketAck<LobbySubscribeResponse>(teamSocket, 'lobby:team-subscribe', {
        sessionId: seeded.session.id,
        teamId: seeded.teamIds[0],
      });

      expect(hostSubscription.ok).toBe(true);
      expect(teamSubscription.ok).toBe(true);

      const hostGameStartedPromise = waitForSocketEvent<GameStartedPayload>(hostSocket, 'gameStarted');
      const teamGameStartedPromise = waitForSocketEvent<GameStartedPayload>(teamSocket, 'gameStarted');
      const startResponse = await emitSocketAck<StartGameSocketResponse>(hostSocket, 'startGame', {
        accessCode: 'SOCK01',
      });
      const [hostGameStarted, teamGameStarted] = await Promise.all([
        hostGameStartedPromise,
        teamGameStartedPromise,
      ]);

      expect(startResponse.ok).toBe(true);
      if (!startResponse.ok) {
        return;
      }

      expect(startResponse.payload.session.status).toBe(EstadoPartida.EN_CURSO);
      expect(startResponse.payload.session.accessCode).toBe('SOCK01');
      expect(startResponse.payload.session.startedAt).toEqual(expect.any(String));
      expect(hostGameStarted.session.id).toBe(seeded.session.id);
      expect(teamGameStarted.session.id).toBe(seeded.session.id);
      expect(hostGameStarted.session.status).toBe(EstadoPartida.EN_CURSO);
      expect(teamGameStarted.session.status).toBe(EstadoPartida.EN_CURSO);
      expect(await prisma.cartaEquipo.count()).toBe(18);
    } finally {
      hostSocket.disconnect();
      teamSocket.disconnect();
    }
  });
});

async function seedSkinAndSession(
  accessCode: string,
  options?: {
    status?: EstadoPartida;
    startedAt?: Date | null;
  }
) {
  const timestamp = Date.now();
  const skin = await prisma.cluedoSkin.create({
    data: {
      name: `Skin ${accessCode}`,
      objective: 'Validar el acceso de jugadores.',
      imageUrl: '',
      context: JSON.stringify({
        version: 1,
        gameTitle: 'Laboratorio de Acceso',
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

  const session = await prisma.partida.create({
    data: {
      accessCode,
      status: options?.status ?? EstadoPartida.LOBBY,
      startedAt: options?.startedAt ?? null,
      durationMinutes: 45,
      skinId: skin.id,
    },
  });

  return { skin, session };
}

async function seedPlayableSession(accessCode: string, teamColors: readonly ColorEquipo[]) {
  const timestamp = Date.now();
  const skin = await prisma.cluedoSkin.create({
    data: {
      name: `Skin ${accessCode}`,
      objective: 'Validar inicio de partida y reparto inicial.',
      imageUrl: '',
      context: JSON.stringify({
        version: 1,
        gameTitle: 'Laboratorio de Inicio',
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

  const subjects = await createCollectionItems(skin.id, TipoElemento.SUJETO, 'Sujeto', 6);
  const objects = await createCollectionItems(skin.id, TipoElemento.OBJETO, 'Objeto', 6);
  const spaces = await createCollectionItems(skin.id, TipoElemento.ESPACIO, 'Espacio', 9);

  const session = await prisma.partida.create({
    data: {
      accessCode,
      status: EstadoPartida.LOBBY,
      durationMinutes: 45,
      skinId: skin.id,
    },
  });

  for (const [index, color] of teamColors.entries()) {
    await prisma.equipo.create({
      data: {
        partidaId: session.id,
        color,
        name: `Equipo ${index + 1}`,
      },
    });
  }

  return {
    session,
    teamIds: (
      await prisma.equipo.findMany({
        where: {
          partidaId: session.id,
        },
        orderBy: {
          color: 'asc',
        },
        select: {
          id: true,
        },
      })
    ).map((team) => team.id),
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
        description: `Descripción de ${prefix} ${index + 1}`,
        motif: kind === TipoElemento.ESPACIO ? `Motivo ${index + 1}` : null,
      },
    });

    createdElements.push({ id: element.id });
  }

  return createdElements;
}

async function getTeamCardDistributions(teamIds: string[]) {
  return Promise.all(
    teamIds.map(async (teamId) => {
      const cards = await prisma.cartaEquipo.findMany({
        where: {
          equipoId: teamId,
        },
        include: {
          element: {
            select: {
              kind: true,
            },
          },
        },
      });

      const distribution = {
        teamId,
        total: 0,
        [TipoElemento.SUJETO]: 0,
        [TipoElemento.OBJETO]: 0,
        [TipoElemento.ESPACIO]: 0,
      } satisfies TeamCardDistribution;

      cards.forEach((card) => {
        distribution.total += 1;
        distribution[card.element.kind] += 1;
      });

      return distribution;
    })
  );
}

function getDistributionSpread(values: number[]) {
  return Math.max(...values) - Math.min(...values);
}

async function connectSocketClient(socketUrl: string, token?: string) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = createSocketClient(socketUrl, {
      autoConnect: false,
      auth: token ? { token } : {},
      transports: ['websocket'],
    });

    const handleConnect = () => {
      socket.off('connect_error', handleError);
      resolve(socket);
    };
    const handleError = (error: Error) => {
      socket.off('connect', handleConnect);
      reject(error);
    };

    socket.once('connect', handleConnect);
    socket.once('connect_error', handleError);
    socket.connect();
  });
}

async function emitSocketAck<T>(socket: Socket, eventName: string, payload: unknown) {
  return new Promise<T>((resolve) => {
    socket.emit(eventName, payload, resolve);
  });
}

async function waitForSocketEvent<T>(socket: Socket, eventName: string) {
  return new Promise<T>((resolve) => {
    socket.once(eventName, resolve);
  });
}