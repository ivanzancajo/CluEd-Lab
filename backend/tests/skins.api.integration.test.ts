import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient, TipoElemento } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { LoadedSkinConfiguration } from '../src/lib/skinConfigs.js';
import configRoutes from '../src/routes/configRoutes.js';
import { getTestDatabaseUrl } from './helpers/testDatabase';

type ErrorResponse = {
  error: string;
};

type ValidationErrorResponse = ErrorResponse & {
  details: string[];
};

type SkinListResponse = {
  items: Array<{
    id: string;
    name: string;
    gameTitle: string;
    duration: string;
    centerImage: string;
    cat1Name: string;
    cat2Name: string;
    cat3Name: string;
    hasMotifs: boolean;
    createdAt: number;
    updatedAt: number;
    subjectCount: number;
    objectCount: number;
    spaceCount: number;
  }>;
};

type SkinItemResponse = {
  item: LoadedSkinConfiguration;
};

type CreateItem = {
  name: string;
  desc: string;
  imageUrl: string;
  motif?: string;
};

type CollectionKey = 'subjects' | 'objects' | 'spaces';

const COLLECTION_LENGTH_ERRORS: Array<{ key: CollectionKey; detail: string }> = [
  { key: 'subjects', detail: 'La configuración debe tener exactamente 6 sujetos.' },
  { key: 'objects', detail: 'La configuración debe tener exactamente 6 objetos.' },
  { key: 'spaces', detail: 'La configuración debe tener exactamente 9 espacios.' },
];

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getTestDatabaseUrl(),
    },
  },
});

describe('API de gestion de CluedoSkins', () => {
  let server: Server;
  let baseUrl = '';
  let adminToken = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api/config', configRoutes);

    server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('No se pudo resolver el puerto del servidor de pruebas de CluedoSkins.');
    }

    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    adminToken = signAdminToken();
  });

  beforeEach(async () => {
    await prisma.partida.deleteMany();
    await prisma.solucion.deleteMany();
    await prisma.descripcionElemento.deleteMany();
    await prisma.elemento.deleteMany();
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

    headers.set('Authorization', `Bearer ${adminToken}`);

    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
  }

  it('SCRUM-28 devuelve 200 con el listado de skins almacenadas', async () => {
    await seedSkinInDatabase('Skin Alfa');

    const response = await request('/api/config/skins');
    const body = (await response.json()) as SkinListResponse;

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      name: 'Skin Alfa',
      gameTitle: 'Laboratorio Forense',
      duration: '75',
      centerImage: 'https://example.com/skin-centro.png',
      cat1Name: 'Sujetos',
      cat2Name: 'Objetos',
      cat3Name: 'Espacios',
      hasMotifs: false,
      subjectCount: 6,
      objectCount: 6,
      spaceCount: 9,
    });
    expect(body.items[0].id).toEqual(expect.any(String));
    expect(body.items[0].createdAt).toEqual(expect.any(Number));
    expect(body.items[0].updatedAt).toEqual(expect.any(Number));
  });

  it('SCRUM-29 guarda una skin nueva y devuelve la estructura completa esperada', async () => {
    const payload = buildCreatePayload('Skin Endpoint');

    const response = await request('/api/config/skins', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as SkinItemResponse;
    const storedSkin = await prisma.cluedoSkin.findUnique({
      where: { id: body.item.id },
      include: { elementDescriptions: true },
    });

    expect(response.status).toBe(201);
    expect(body.item).toMatchObject({
      name: payload.name,
      gameTitle: payload.gameTitle,
      objective: payload.objective,
      duration: String(payload.duration),
      centerImage: payload.centerImage,
      cat1Name: payload.cat1Name,
      cat2Name: payload.cat2Name,
      cat3Name: payload.cat3Name,
      hasMotifs: payload.hasMotifs,
    });
    expect(body.item.id).toEqual(expect.any(String));
    expect(body.item.createdAt).toEqual(expect.any(Number));
    expect(body.item.updatedAt).toEqual(expect.any(Number));
    expect(body.item.subjects).toHaveLength(6);
    expect(body.item.objects).toHaveLength(6);
    expect(body.item.spaces).toHaveLength(9);
    expect(body.item.subjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Sujeto 1',
          desc: 'Descripcion de Sujeto 1',
          imageUrl: 'https://example.com/sujeto-1.png',
        }),
      ])
    );
    expect(body.item.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Objeto 1',
          desc: 'Descripcion de Objeto 1',
          imageUrl: 'https://example.com/objeto-1.png',
        }),
      ])
    );
    expect(body.item.spaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Espacio 1',
          desc: 'Descripcion de Espacio 1',
          imageUrl: 'https://example.com/espacio-1.png',
        }),
      ])
    );
    expect(storedSkin).not.toBeNull();
    expect(storedSkin?.name).toBe(payload.name);
    expect(storedSkin?.elementDescriptions).toHaveLength(21);
  });

  it.each(COLLECTION_LENGTH_ERRORS)(
    'rechaza la creacion cuando $key no cumple el minimo requerido',
    async ({ key, detail }) => {
      const payload = buildPayloadWithIncompleteCollection('Skin invalida', key);

      const response = await request('/api/config/skins', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as ValidationErrorResponse;

      expect(response.status).toBe(400);
      expect(body.error).toBe('La solicitud contiene datos inválidos.');
      expect(body.details).toContain(detail);
      expect(await prisma.cluedoSkin.count()).toBe(0);
    }
  );

  it('actualiza una skin existente y persiste los cambios de metadatos', async () => {
    const existingSkin = await seedSkinInDatabase('Skin Original');

    const response = await request(`/api/config/skins/${existingSkin.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Skin Actualizada',
        gameTitle: 'Cluedo Evolucionado',
        objective: 'Objetivo actualizado.',
        duration: 120,
        cat1Name: 'Investigadores',
        cat2Name: 'Herramientas',
        cat3Name: 'Localizaciones',
      }),
    });

    const body = (await response.json()) as SkinItemResponse;
    const storedSkin = await prisma.cluedoSkin.findUnique({
      where: { id: existingSkin.id },
    });

    expect(response.status).toBe(200);
    expect(body.item).toMatchObject({
      id: existingSkin.id,
      name: 'Skin Actualizada',
      gameTitle: 'Cluedo Evolucionado',
      objective: 'Objetivo actualizado.',
      duration: '120',
      cat1Name: 'Investigadores',
      cat2Name: 'Herramientas',
      cat3Name: 'Localizaciones',
    });
    expect(storedSkin?.name).toBe('Skin Actualizada');
  });

  it.each(COLLECTION_LENGTH_ERRORS)(
    'rechaza la actualizacion cuando $key no cumple el minimo requerido',
    async ({ key, detail }) => {
      const existingSkin = await seedSkinInDatabase('Skin Editable');
      const payload = buildPayloadWithIncompleteCollection('Skin Editable', key);

      const response = await request(`/api/config/skins/${existingSkin.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as ValidationErrorResponse;

      expect(response.status).toBe(400);
      expect(body.error).toBe('La solicitud contiene datos inválidos.');
      expect(body.details).toContain(detail);
      expect(await prisma.cluedoSkin.count()).toBe(1);
    }
  );

  it('SCRUM-116 rechaza la creacion cuando dos espacios comparten el mismo motivo', async () => {
    const payload = buildCreatePayload('Skin Motivos Duplicados');
    payload.hasMotifs = true;
    payload.spaces = payload.spaces.map((space, index) => ({
      ...space,
      motif: index < 2 ? 'Motivo Repetido' : `Motivo ${index + 1}`,
    }));

    const response = await request('/api/config/skins', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as ValidationErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe('La solicitud contiene datos inválidos.');
    expect(body.details).toContain('No se pueden repetir los motivos de los espacios dentro de la misma skin.');
    expect(await prisma.cluedoSkin.count()).toBe(0);
  });

  it('SCRUM-116 rechaza la actualizacion cuando se introducen motivos duplicados en espacios', async () => {
    const existingSkin = await seedSkinInDatabase('Skin Editable Motivos');
    const payload = buildCreatePayload('Skin Editable Motivos');
    payload.hasMotifs = true;
    payload.spaces = payload.spaces.map((space, index) => ({
      ...space,
      motif: index < 2 ? 'motivo repetido' : `motivo-${index + 1}`,
    }));

    const response = await request(`/api/config/skins/${existingSkin.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as ValidationErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe('La solicitud contiene datos inválidos.');
    expect(body.details).toContain('No se pueden repetir los motivos de los espacios dentro de la misma skin.');
    expect(await prisma.cluedoSkin.count()).toBe(1);
  });

  it('SCRUM-116 acepta motivos diferentes aunque sean similares en case', async () => {
    const payload = buildCreatePayload('Skin Motivos Validos');
    payload.hasMotifs = true;
    payload.spaces = payload.spaces.map((space, index) => ({
      ...space,
      motif: `Motivo Único ${index + 1}`,
    }));

    const response = await request('/api/config/skins', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(await prisma.cluedoSkin.count()).toBe(1);
  });

  it('elimina una skin existente y sus elementos huerfanos', async () => {
    const existingSkin = await seedSkinInDatabase('Skin Eliminable');

    const response = await request(`/api/config/skins/${existingSkin.id}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(await prisma.cluedoSkin.findUnique({ where: { id: existingSkin.id } })).toBeNull();
    expect(await prisma.descripcionElemento.count()).toBe(0);
    expect(await prisma.elemento.count()).toBe(0);
  });

  it('SCRUM-30 devuelve 404 al intentar eliminar una skin inexistente', async () => {
    const response = await request(`/api/config/skins/${randomUUID()}`, {
      method: 'DELETE',
    });

    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'La configuración solicitada no existe.' });
  });
});

function signAdminToken() {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET no está definida para los tests de CluedoSkins.');
  }

  return jwt.sign(
    {
      sub: 'admin-test',
      role: 'admin',
      username: process.env.ADMIN_USER ?? 'admin',
    },
    jwtSecret,
    { expiresIn: '8h' }
  );
}

function buildItems(prefix: string, count: number): CreateItem[] {
  return Array.from({ length: count }, (_value, index) => {
    const itemNumber = index + 1;
    const slug = `${prefix.toLocaleLowerCase('es')}-${itemNumber}`;

    return {
      name: `${prefix} ${itemNumber}`,
      desc: `Descripcion de ${prefix} ${itemNumber}`,
      imageUrl: `https://example.com/${slug}.png`,
    };
  });
}

function buildCreatePayload(name: string) {
  return {
    name,
    gameTitle: 'Laboratorio Forense',
    objective: 'Analizar relaciones entre sujetos, objetos y espacios.',
    duration: 75,
    centerImage: 'https://example.com/skin-centro.png',
    cat1Name: 'Sujetos',
    cat2Name: 'Objetos',
    cat3Name: 'Espacios',
    hasMotifs: false,
    subjects: buildItems('Sujeto', 6),
    objects: buildItems('Objeto', 6),
    spaces: buildItems('Espacio', 9),
  };
}

function buildPayloadWithIncompleteCollection(name: string, key: CollectionKey) {
  const payload = buildCreatePayload(name);
  payload[key] = payload[key].slice(0, payload[key].length - 1);
  return payload;
}

async function seedSkinInDatabase(name: string) {
  const payload = buildCreatePayload(name);
  const timestamp = Date.now();

  const skin = await prisma.cluedoSkin.create({
    data: {
      name: payload.name,
      objective: payload.objective,
      imageUrl: payload.centerImage,
      context: JSON.stringify({
        version: 1,
        gameTitle: payload.gameTitle,
        duration: String(payload.duration),
        cat1Name: payload.cat1Name,
        cat2Name: payload.cat2Name,
        cat3Name: payload.cat3Name,
        hasMotifs: payload.hasMotifs,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    },
  });

  await createCollectionItems(skin.id, TipoElemento.SUJETO, payload.subjects);
  await createCollectionItems(skin.id, TipoElemento.OBJETO, payload.objects);
  await createCollectionItems(skin.id, TipoElemento.ESPACIO, payload.spaces);

  return skin;
}

async function createCollectionItems(skinId: string, kind: TipoElemento, items: CreateItem[]) {
  for (const item of items) {
    const element = await prisma.elemento.create({
      data: {
        name: item.name,
        kind,
        imageUrl: item.imageUrl,
      },
    });

    await prisma.descripcionElemento.create({
      data: {
        skinId,
        elementId: element.id,
        description: item.desc,
        motif: kind === TipoElemento.ESPACIO ? item.motif ?? null : null,
      },
    });
  }
}