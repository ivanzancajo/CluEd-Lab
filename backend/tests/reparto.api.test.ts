import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ColorEquipo, EstadoPartida, PrismaClient, TipoElemento } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import sessionRoutes from '../src/routes/sessionRoutes.js';
import { getTeamSpawnPosition } from '../src/lib/teamSpawnPositions.js';
import { lobbyPresenceStore } from '../src/socket/lobbyPresenceStore.js';
import { registerSocketServer, type LobbyPresenceState } from '../src/socket/socketServer.js';
import { getTestDatabaseUrl } from './helpers/testDatabase';

type LobbySubscribeResponse =
  | { ok: true; state: LobbyPresenceState }
  | { ok: false; error: string };

type StartGameAck =
  | { ok: true; payload: { session: { id: string; status: EstadoPartida } } }
  | { ok: false; error: string };

type GameSetupCardsPayload = {
  hand: Array<{ id: string; kind: TipoElemento; name: string; desc: string }>;
  occurredAt: number;
};

type PresenceUpdatePayload = LobbyPresenceState & { occurredAt: number };

const prisma = new PrismaClient({ datasources: { db: { url: getTestDatabaseUrl() } } });

describe('SCRUM-100 reparto cíclico y sobrantes', () => {
  let server: Server;
  let socketUrl = '';

  jest.setTimeout(15000);

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

    const address = server.address() as AddressInfo;
    socketUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    lobbyPresenceStore.clear?.();
    await prisma.partida.deleteMany();
    await prisma.solucion.deleteMany();
    await prisma.cluEdSkin.deleteMany();
    await prisma.elemento.deleteMany();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.$disconnect();
  });

  it('reparte sin sobrantes cuando las cartas se dividen exactamente entre los equipos', async () => {
    const seed = await seedLobbySession('REPT01', [ColorEquipo.ROJO, ColorEquipo.AZUL, ColorEquipo.VERDE]);
    // 9 total, 3 solución → 6 non-solution, 3 equipos → 2/equipo, 0 sobrantes
    const adminSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', sub: 'admin' }));

    try {
      await emitSocketAck<LobbySubscribeResponse>(adminSocket, 'lobby:host-subscribe', { sessionId: seed.sessionId });

      const ack = await emitSocketAck<StartGameAck>(adminSocket, 'startGame', { accessCode: seed.accessCode });
      if (!ack.ok) throw new Error(`startGame falló: ${JSON.stringify(ack)}`);
      expect(ack.payload.session.status).toBe(EstadoPartida.EN_CURSO);

      const cartasEquipo = await prisma.cartaEquipo.findMany({ where: { equipo: { partidaId: seed.sessionId } } });
      const cartasPublicas = await prisma.cartaPublica.findMany({ where: { partidaId: seed.sessionId } });

      expect(cartasEquipo).toHaveLength(6);
      expect(cartasPublicas).toHaveLength(0);

      const solucion = await prisma.solucion.findFirst({ where: { partidas: { some: { id: seed.sessionId } } } });
      const solutionIds = new Set([solucion!.subjectElementId, solucion!.objectElementId, solucion!.spaceElementId]);
      for (const carta of cartasEquipo) {
        expect(solutionIds.has(carta.elementId)).toBe(false);
      }
    } finally {
      adminSocket.disconnect();
    }
  });

  it('genera sobrantes cuando las cartas no se dividen exactamente y los persiste en CartaPublica', async () => {
    const seed = await seedLobbySession('REPT02', [ColorEquipo.ROJO, ColorEquipo.AZUL, ColorEquipo.VERDE, ColorEquipo.AMARILLO]);
    // 9 total, 3 solución → 6 non-solution, 4 equipos → floor(6/4)=1/equipo (4 dealt), 2 sobrantes
    const adminSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', sub: 'admin' }));

    try {
      await emitSocketAck<LobbySubscribeResponse>(adminSocket, 'lobby:host-subscribe', { sessionId: seed.sessionId });

      const ack = await emitSocketAck<StartGameAck>(adminSocket, 'startGame', { accessCode: seed.accessCode });
      if (!ack.ok) throw new Error(`startGame falló: ${JSON.stringify(ack)}`);

      const cartasEquipo = await prisma.cartaEquipo.findMany({
        where: { equipo: { partidaId: seed.sessionId } },
        select: { elementId: true, equipoId: true },
      });
      const cartasPublicas = await prisma.cartaPublica.findMany({
        where: { partidaId: seed.sessionId },
        select: { elementId: true },
      });

      expect(cartasEquipo).toHaveLength(4);
      expect(cartasPublicas).toHaveLength(2);

      const solucion = await prisma.solucion.findFirst({ where: { partidas: { some: { id: seed.sessionId } } } });
      const solutionIds = new Set([solucion!.subjectElementId, solucion!.objectElementId, solucion!.spaceElementId]);
      const allDealtIds = [...cartasEquipo.map((c) => c.elementId), ...cartasPublicas.map((c) => c.elementId)];

      // Todas las cartas repartidas son no-solución
      for (const id of allDealtIds) {
        expect(solutionIds.has(id)).toBe(false);
      }

      // La unión de manos + sobrantes cubre exactamente las 6 cartas no-solución sin duplicados
      const uniqueDealt = new Set(allDealtIds);
      expect(uniqueDealt.size).toBe(6);
      expect(allDealtIds).toHaveLength(6);
    } finally {
      adminSocket.disconnect();
    }
  });

  it('emite game:setup-cards a cada equipo con su mano privada exclusiva', async () => {
    const seed = await seedLobbySession('REPT03', [ColorEquipo.ROJO, ColorEquipo.AZUL, ColorEquipo.VERDE]);
    // 6 non-solution, 3 equipos → reparto estándar: 6 / 3 = 2 por equipo, sin sobrantes
    const adminToken = signAdminToken({ role: 'admin', sub: 'admin' });
    const adminSocket = await connectSocketClient(socketUrl, adminToken);
    const redSocket = await connectSocketClient(socketUrl);
    const blueSocket = await connectSocketClient(socketUrl);

    try {
      await emitSocketAck<LobbySubscribeResponse>(adminSocket, 'lobby:host-subscribe', { sessionId: seed.sessionId });
      await emitSocketAck<LobbySubscribeResponse>(redSocket, 'lobby:team-subscribe', {
        sessionId: seed.sessionId,
        teamId: seed.teamIds[0],
      });
      await emitSocketAck<LobbySubscribeResponse>(blueSocket, 'lobby:team-subscribe', {
        sessionId: seed.sessionId,
        teamId: seed.teamIds[1],
      });

      const redSetupCardsPromise = waitForSocketEvent<GameSetupCardsPayload>(redSocket, 'game:setup-cards');
      const blueSetupCardsPromise = waitForSocketEvent<GameSetupCardsPayload>(blueSocket, 'game:setup-cards');

      await emitSocketAck<StartGameAck>(adminSocket, 'startGame', { accessCode: seed.accessCode });

      const [redPayload, bluePayload] = await Promise.all([redSetupCardsPromise, blueSetupCardsPromise]);

      // Con skin 3+3+3=9: 6 no-sol, 3 equipos → 2/equipo sin sobrantes
      expect(redPayload.hand).toHaveLength(2);
      expect(bluePayload.hand).toHaveLength(2);

      // Las manos son disjuntas (sin duplicados entre equipos)
      const redIds = new Set(redPayload.hand.map((c) => c.id));
      const blueIds = new Set(bluePayload.hand.map((c) => c.id));
      for (const id of blueIds) {
        expect(redIds.has(id)).toBe(false);
      }

      // Las cartas tienen la estructura correcta
      for (const card of redPayload.hand) {
        expect(card).toMatchObject({ id: expect.any(String), kind: expect.any(String), name: expect.any(String) });
      }
    } finally {
      adminSocket.disconnect();
      redSocket.disconnect();
      blueSocket.disconnect();
    }
  });

  it('incluye publicCards en lobby:presence-updated tras startGame con sobrantes', async () => {
    const seed = await seedLobbySession('REPT04', [ColorEquipo.ROJO, ColorEquipo.AZUL, ColorEquipo.VERDE, ColorEquipo.AMARILLO]);
    // 4 equipos → 2 sobrantes
    const adminSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', sub: 'admin' }));

    try {
      await emitSocketAck<LobbySubscribeResponse>(adminSocket, 'lobby:host-subscribe', { sessionId: seed.sessionId });

      const presenceUpdatePromise = waitForSocketEvent<PresenceUpdatePayload>(adminSocket, 'lobby:presence-updated');

      await emitSocketAck<StartGameAck>(adminSocket, 'startGame', { accessCode: seed.accessCode });

      const presenceUpdate = await presenceUpdatePromise;

      expect(Array.isArray(presenceUpdate.publicCards)).toBe(true);
      expect(presenceUpdate.publicCards).toHaveLength(2);
      for (const card of presenceUpdate.publicCards) {
        expect(card).toMatchObject({ id: expect.any(String), kind: expect.any(String), name: expect.any(String) });
      }
    } finally {
      adminSocket.disconnect();
    }
  });

  it('rechaza startGame si la sesión ya está en curso', async () => {
    const seed = await seedLobbySession('REPT05', [ColorEquipo.ROJO, ColorEquipo.AZUL]);
    const adminSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', sub: 'admin' }));

    try {
      await emitSocketAck<LobbySubscribeResponse>(adminSocket, 'lobby:host-subscribe', { sessionId: seed.sessionId });
      await emitSocketAck<StartGameAck>(adminSocket, 'startGame', { accessCode: seed.accessCode });

      // Segundo intento debe fallar
      const secondAck = await emitSocketAck<StartGameAck>(adminSocket, 'startGame', { accessCode: seed.accessCode });
      expect(secondAck.ok).toBe(false);
    } finally {
      adminSocket.disconnect();
    }
  });

  it('los equipos que no están suscritos al canal no reciben game:setup-cards', async () => {
    const seed = await seedLobbySession('REPT06', [ColorEquipo.ROJO, ColorEquipo.AZUL]);
    const adminSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', sub: 'admin' }));
    const unsubscribedSocket = await connectSocketClient(socketUrl);

    let received = false;
    unsubscribedSocket.on('game:setup-cards', () => { received = true; });

    try {
      await emitSocketAck<LobbySubscribeResponse>(adminSocket, 'lobby:host-subscribe', { sessionId: seed.sessionId });
      await emitSocketAck<StartGameAck>(adminSocket, 'startGame', { accessCode: seed.accessCode });
      await wait(150);
      expect(received).toBe(false);
    } finally {
      adminSocket.disconnect();
      unsubscribedSocket.disconnect();
    }
  });

  it('reparte 1 carta por equipo con 1 sobrante para 5 equipos (REPT07)', async () => {
    const seed = await seedLobbySession('REPT07', [
      ColorEquipo.ROJO, ColorEquipo.AMARILLO, ColorEquipo.AZUL, ColorEquipo.VERDE, ColorEquipo.MORADO,
    ]);
    // 9 total, 3 solución → 6 no-solución, 5 equipos → floor(6/5)=1/equipo (5 dealt), 1 sobrante
    const adminSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', sub: 'admin' }));

    try {
      await emitSocketAck<LobbySubscribeResponse>(adminSocket, 'lobby:host-subscribe', { sessionId: seed.sessionId });

      const ack = await emitSocketAck<StartGameAck>(adminSocket, 'startGame', { accessCode: seed.accessCode });
      if (!ack.ok) throw new Error(`startGame falló: ${JSON.stringify(ack)}`);

      const cartasEquipo = await prisma.cartaEquipo.findMany({
        where: { equipo: { partidaId: seed.sessionId } },
        select: { elementId: true, equipoId: true },
      });
      const cartasPublicas = await prisma.cartaPublica.findMany({
        where: { partidaId: seed.sessionId },
        select: { elementId: true },
      });

      expect(cartasEquipo).toHaveLength(5);
      expect(cartasPublicas).toHaveLength(1);

      // Todos los equipos tienen exactamente 1 carta
      const cartasPorEquipo = new Map<string, number>();
      for (const carta of cartasEquipo) {
        cartasPorEquipo.set(carta.equipoId, (cartasPorEquipo.get(carta.equipoId) ?? 0) + 1);
      }
      for (const count of cartasPorEquipo.values()) {
        expect(count).toBe(1);
      }

      // Ninguna carta es de la solución
      const solucion = await prisma.solucion.findFirst({ where: { partidas: { some: { id: seed.sessionId } } } });
      const solutionIds = new Set([solucion!.subjectElementId, solucion!.objectElementId, solucion!.spaceElementId]);
      for (const carta of [...cartasEquipo, ...cartasPublicas]) {
        expect(solutionIds.has(carta.elementId)).toBe(false);
      }
    } finally {
      adminSocket.disconnect();
    }
  });

  it('reparte 1 carta por equipo sin sobrantes para 6 equipos (REPT08)', async () => {
    const seed = await seedLobbySession('REPT08', [
      ColorEquipo.ROJO, ColorEquipo.AMARILLO, ColorEquipo.AZUL,
      ColorEquipo.VERDE, ColorEquipo.MORADO, ColorEquipo.BLANCO,
    ]);
    // 9 total, 3 solución → 6 no-solución, 6 equipos → 1/equipo, 0 sobrantes
    const adminSocket = await connectSocketClient(socketUrl, signAdminToken({ role: 'admin', sub: 'admin' }));

    try {
      await emitSocketAck<LobbySubscribeResponse>(adminSocket, 'lobby:host-subscribe', { sessionId: seed.sessionId });

      const ack = await emitSocketAck<StartGameAck>(adminSocket, 'startGame', { accessCode: seed.accessCode });
      if (!ack.ok) throw new Error(`startGame falló: ${JSON.stringify(ack)}`);

      const cartasEquipo = await prisma.cartaEquipo.findMany({
        where: { equipo: { partidaId: seed.sessionId } },
        select: { elementId: true, equipoId: true },
      });
      const cartasPublicas = await prisma.cartaPublica.findMany({
        where: { partidaId: seed.sessionId },
        select: { elementId: true },
      });

      expect(cartasEquipo).toHaveLength(6);
      expect(cartasPublicas).toHaveLength(0);

      // Todos los equipos tienen exactamente 1 carta
      const cartasPorEquipo = new Map<string, number>();
      for (const carta of cartasEquipo) {
        cartasPorEquipo.set(carta.equipoId, (cartasPorEquipo.get(carta.equipoId) ?? 0) + 1);
      }
      expect(cartasPorEquipo.size).toBe(6);
      for (const count of cartasPorEquipo.values()) {
        expect(count).toBe(1);
      }

      // Ninguna carta es de la solución
      const solucion = await prisma.solucion.findFirst({ where: { partidas: { some: { id: seed.sessionId } } } });
      const solutionIds = new Set([solucion!.subjectElementId, solucion!.objectElementId, solucion!.spaceElementId]);
      for (const carta of cartasEquipo) {
        expect(solutionIds.has(carta.elementId)).toBe(false);
      }
    } finally {
      adminSocket.disconnect();
    }
  });
});

async function seedLobbySession(accessCode: string, colors: ColorEquipo[]) {
  const timestamp = Date.now();
  const skin = await prisma.cluEdSkin.create({
    data: {
      name: `Skin ${accessCode}`,
      objective: 'Test reparto SCRUM-100',
      imageUrl: '',
      context: JSON.stringify({
        version: 1,
        gameTitle: 'Reparto Test',
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

  // 3+3+3 = 9 elementos: 3 solución + 6 no-solución
  const subjects = await createCollectionItems(skin.id, TipoElemento.SUJETO, 'Sujeto', 3);
  const objects = await createCollectionItems(skin.id, TipoElemento.OBJETO, 'Objeto', 3);
  const spaces = await createCollectionItems(skin.id, TipoElemento.ESPACIO, 'Espacio', 3);

  const session = await prisma.partida.create({
    data: {
      accessCode,
      status: EstadoPartida.LOBBY,
      durationMinutes: 45,
      skinId: skin.id,
    },
  });

  const teamIds: string[] = [];
  for (const color of colors) {
    const team = await prisma.equipo.create({
      data: {
        partidaId: session.id,
        color,
        name: `Equipo ${color}`,
        ...getTeamSpawnPosition(color),
      },
    });
    teamIds.push(team.id);
  }

  return {
    sessionId: session.id,
    accessCode,
    teamIds,
    subjectIds: subjects.map((s) => s.id),
    objectIds: objects.map((o) => o.id),
    spaceIds: spaces.map((s) => s.id),
  };
}

async function createCollectionItems(skinId: string, kind: TipoElemento, prefix: string, count: number) {
  const created: Array<{ id: string }> = [];
  for (let i = 0; i < count; i++) {
    const element = await prisma.elemento.create({ data: { name: `${prefix} ${i + 1}`, kind, imageUrl: '' } });
    await prisma.descripcionElemento.create({
      data: {
        skinId,
        elementId: element.id,
        description: `Desc ${prefix} ${i + 1}`,
        motif: kind === TipoElemento.ESPACIO ? `Motivo ${i + 1}` : null,
      },
    });
    created.push({ id: element.id });
  }
  return created;
}

function connectSocketClient(url: string, token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createSocketClient(url, {
      autoConnect: false,
      auth: token ? { token } : {},
      transports: ['websocket'],
    });
    socket.once('connect', () => { socket.off('connect_error', reject); resolve(socket); });
    socket.once('connect_error', (error) => { socket.off('connect', resolve as never); reject(error); });
    socket.connect();
  });
}

function emitSocketAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => { socket.emit(event, payload, resolve); });
}

function waitForSocketEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => { socket.once(event, resolve); });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}
