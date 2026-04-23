import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { EstadoPartida, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import express from 'express';
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

const ACCESS_CODE_FORMAT_ERROR = 'El código de acceso debe tener 6 caracteres alfanuméricos.';
const INVALID_ACCESS_CODES = ['A', 'AB', 'ABC', 'ABCD', 'ABCDE', 'ABC-12'];

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
      throw new Error('No se pudo resolver el puerto del servidor de pruebas de acceso de jugadores.');
    }

    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await prisma.partida.deleteMany();
    await prisma.cluedoSkin.deleteMany();
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