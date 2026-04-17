import { Prisma, TipoElemento, type Elemento } from '@prisma/client';
import { Router } from 'express';
import type { Response } from 'express';
import type { ZodType } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  createSkinConfigSchema,
  skinParamsSchema,
  type ConfigCollectionKey,
  type ConfigItemInput,
  type CreateSkinConfigInput,
  type UpdateSkinConfigInput,
  type UpdateSkinDescriptionsInput,
  updateSkinConfigSchema,
  updateSkinDescriptionsSchema,
} from '../lib/configSchemas.js';
import type { AuthRequest } from '../middleware/auth.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

const CONFIG_COLLECTIONS: Array<{
  key: ConfigCollectionKey;
  kind: TipoElemento;
}> = [
  { key: 'subjects', kind: TipoElemento.SUJETO },
  { key: 'objects', kind: TipoElemento.OBJETO },
  { key: 'spaces', kind: TipoElemento.ESPACIO },
];

type PrismaReader = Pick<typeof prisma, 'cluedoSkin' | 'elemento' | 'descripcionElemento'>;
type PrismaWriter = Pick<typeof prisma, 'cluedoSkin' | 'elemento' | 'descripcionElemento' | 'partida'>;
type SkinDescriptionRecord = Prisma.DescripcionElementoGetPayload<{ include: { element: true } }>;
type DescriptionsPayload = Partial<Record<ConfigCollectionKey, ConfigItemInput[]>>;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string[]
  ) {
    super(message);
  }
}

router.use(verifyToken);

router.get('/skins', async (_req, res) => {
  try {
    const [skins, counts] = await Promise.all([
      prisma.cluedoSkin.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.elemento.groupBy({ by: ['kind'], _count: { _all: true } }),
    ]);

    const countByKind = new Map<TipoElemento, number>(
      counts.map((entry) => [entry.kind, entry._count._all])
    );

    res.json({
      items: skins.map((skin) => ({
        id: skin.id,
        name: skin.name,
        gameTitle: skin.publicTitle,
        duration: String(skin.durationMinutes),
        centerImage: skin.centerImageUrl ?? '',
        cat1Name: skin.subjectCategoryName,
        cat2Name: skin.objectCategoryName,
        cat3Name: skin.spaceCategoryName,
        hasMotifs: skin.hasMotifs,
        createdAt: skin.createdAt.getTime(),
        updatedAt: skin.updatedAt.getTime(),
        subjectCount: countByKind.get(TipoElemento.SUJETO) ?? 0,
        objectCount: countByKind.get(TipoElemento.OBJETO) ?? 0,
        spaceCount: countByKind.get(TipoElemento.ESPACIO) ?? 0,
      })),
    });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.get('/skins/:id', async (req, res) => {
  const skinId = parseSkinId(req, res);
  if (!skinId) {
    return;
  }

  try {
    const skinConfig = await loadSkinConfiguration(prisma, skinId);
    res.json({ item: skinConfig });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.get('/skins/:id/descriptions', async (req, res) => {
  const skinId = parseSkinId(req, res);
  if (!skinId) {
    return;
  }

  try {
    const skinConfig = await loadSkinConfiguration(prisma, skinId);
    res.json({
      hasMotifs: skinConfig.hasMotifs,
      subjects: skinConfig.subjects,
      objects: skinConfig.objects,
      spaces: skinConfig.spaces,
    });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.post('/skins', async (req, res) => {
  const payload = parseBody(createSkinConfigSchema, req.body, res);
  if (!payload) {
    return;
  }

  try {
    const skinConfig = await prisma.$transaction(async (tx) => {
      const skin = await tx.cluedoSkin.create({
        data: mapCreateSkinFields(payload),
      });

      await replaceSkinDescriptions(tx, skin.id, extractDescriptionsPayload(payload), skin.hasMotifs);
      return loadSkinConfiguration(tx, skin.id);
    });

    res.status(201).json({ item: skinConfig });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.put('/skins/:id', async (req, res) => {
  const skinId = parseSkinId(req, res);
  if (!skinId) {
    return;
  }

  const payload = parseBody(updateSkinConfigSchema, req.body, res);
  if (!payload) {
    return;
  }

  try {
    const skinConfig = await prisma.$transaction(async (tx) => {
      const existingSkin = await tx.cluedoSkin.findUnique({ where: { id: skinId } });

      if (!existingSkin) {
        throw new HttpError(404, 'La configuración solicitada no existe.');
      }

      const updatedSkin = await tx.cluedoSkin.update({
        where: { id: skinId },
        data: mapUpdateSkinFields(payload),
      });

      await replaceSkinDescriptions(tx, skinId, extractDescriptionsPayload(payload), updatedSkin.hasMotifs);
      return loadSkinConfiguration(tx, skinId);
    });

    res.json({ item: skinConfig });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.put('/skins/:id/descriptions', async (req, res) => {
  const skinId = parseSkinId(req, res);
  if (!skinId) {
    return;
  }

  const payload = parseBody(updateSkinDescriptionsSchema, req.body, res);
  if (!payload) {
    return;
  }

  try {
    const skinConfig = await prisma.$transaction(async (tx) => {
      const existingSkin = await tx.cluedoSkin.findUnique({ where: { id: skinId } });

      if (!existingSkin) {
        throw new HttpError(404, 'La configuración solicitada no existe.');
      }

      await replaceSkinDescriptions(tx, skinId, extractDescriptionsPayload(payload), existingSkin.hasMotifs);
      return loadSkinConfiguration(tx, skinId);
    });

    res.json({ item: skinConfig });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.delete('/skins/:id', async (req, res) => {
  const skinId = parseSkinId(req, res);
  if (!skinId) {
    return;
  }

  try {
    const existingSkin = await prisma.cluedoSkin.findUnique({ where: { id: skinId } });

    if (!existingSkin) {
      res.status(404).json({ error: 'La configuración solicitada no existe.' });
      return;
    }

    const linkedMatches = await prisma.partida.count({ where: { skinId } });

    if (linkedMatches > 0) {
      res.status(409).json({
        error: 'No se puede eliminar la configuración porque está asociada a una partida.',
      });
      return;
    }

    await prisma.cluedoSkin.delete({ where: { id: skinId } });
    res.status(204).send();
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

function parseSkinId(req: AuthRequest, res: Response): string | null {
  const parsed = skinParamsSchema.safeParse(req.params);

  if (!parsed.success) {
    res.status(400).json({
      error: 'El identificador de la configuración no es válido.',
      details: parsed.error.issues.map((issue) => issue.message),
    });
    return null;
  }

  return parsed.data.id;
}

function parseBody<T>(
  schema: ZodType<T>,
  value: unknown,
  res: Response
): T | null {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    res.status(400).json({
      error: 'El cuerpo de la petición no es válido.',
      details: parsed.error.issues.map((issue) => issue.message),
    });
    return null;
  }

  return parsed.data;
}

function mapCreateSkinFields(payload: CreateSkinConfigInput): Prisma.CluedoSkinCreateInput {
  return {
    name: payload.name,
    publicTitle: payload.gameTitle,
    objective: payload.objective,
    durationMinutes: payload.duration,
    centerImageUrl: payload.centerImage ?? null,
    subjectCategoryName: payload.cat1Name,
    objectCategoryName: payload.cat2Name,
    spaceCategoryName: payload.cat3Name,
    hasMotifs: payload.hasMotifs ?? false,
  };
}

function mapUpdateSkinFields(payload: UpdateSkinConfigInput): Prisma.CluedoSkinUpdateInput {
  const data: Prisma.CluedoSkinUpdateInput = {};

  if (payload.name !== undefined) {
    data.name = payload.name;
  }

  if (payload.gameTitle !== undefined) {
    data.publicTitle = payload.gameTitle;
  }

  if (payload.objective !== undefined) {
    data.objective = payload.objective;
  }

  if (payload.duration !== undefined) {
    data.durationMinutes = payload.duration;
  }

  if (payload.centerImage !== undefined) {
    data.centerImageUrl = payload.centerImage ?? null;
  }

  if (payload.cat1Name !== undefined) {
    data.subjectCategoryName = payload.cat1Name;
  }

  if (payload.cat2Name !== undefined) {
    data.objectCategoryName = payload.cat2Name;
  }

  if (payload.cat3Name !== undefined) {
    data.spaceCategoryName = payload.cat3Name;
  }

  if (payload.hasMotifs !== undefined) {
    data.hasMotifs = payload.hasMotifs;
  }

  return data;
}

function extractDescriptionsPayload(
  payload: Pick<Partial<CreateSkinConfigInput & UpdateSkinConfigInput & UpdateSkinDescriptionsInput>, ConfigCollectionKey>
): DescriptionsPayload {
  const descriptions: DescriptionsPayload = {};

  if (payload.subjects !== undefined) {
    descriptions.subjects = payload.subjects;
  }

  if (payload.objects !== undefined) {
    descriptions.objects = payload.objects;
  }

  if (payload.spaces !== undefined) {
    descriptions.spaces = payload.spaces;
  }

  return descriptions;
}

async function loadSkinConfiguration(client: PrismaReader, skinId: string) {
  const [skin, elements, descriptions] = await Promise.all([
    client.cluedoSkin.findUnique({ where: { id: skinId } }),
    client.elemento.findMany({
      orderBy: [{ kind: 'asc' }, { baseName: 'asc' }],
    }),
    client.descripcionElemento.findMany({
      where: { skinId },
      include: { element: true },
    }),
  ]);

  if (!skin) {
    throw new HttpError(404, 'La configuración solicitada no existe.');
  }

  const descriptionsByElementId = new Map<string, SkinDescriptionRecord>(
    descriptions.map((description) => [description.elementId, description])
  );

  return {
    id: skin.id,
    name: skin.name,
    gameTitle: skin.publicTitle,
    objective: skin.objective,
    duration: String(skin.durationMinutes),
    centerImage: skin.centerImageUrl ?? '',
    cat1Name: skin.subjectCategoryName,
    cat2Name: skin.objectCategoryName,
    cat3Name: skin.spaceCategoryName,
    hasMotifs: skin.hasMotifs,
    subjects: buildConfigItems(elements, descriptionsByElementId, TipoElemento.SUJETO),
    objects: buildConfigItems(elements, descriptionsByElementId, TipoElemento.OBJETO),
    spaces: buildConfigItems(elements, descriptionsByElementId, TipoElemento.ESPACIO),
    createdAt: skin.createdAt.getTime(),
    updatedAt: skin.updatedAt.getTime(),
  };
}

function buildConfigItems(
  elements: Elemento[],
  descriptionsByElementId: Map<string, SkinDescriptionRecord>,
  kind: TipoElemento
) {
  return elements
    .filter((element) => element.kind === kind)
    .map((element) => {
      const description = descriptionsByElementId.get(element.id);

      return {
        id: element.id,
        name: description?.displayName ?? element.baseName,
        desc: description?.description ?? '',
        imageUrl: description?.imageUrl ?? undefined,
        motif: description?.motif ?? undefined,
      };
    });
}

async function replaceSkinDescriptions(
  client: PrismaWriter,
  skinId: string,
  payload: DescriptionsPayload,
  effectiveHasMotifs: boolean
) {
  const collectionsToReplace = CONFIG_COLLECTIONS.filter(({ key }) => payload[key] !== undefined);

  if (collectionsToReplace.length === 0) {
    if (!effectiveHasMotifs) {
      await client.descripcionElemento.updateMany({
        where: { skinId },
        data: { motif: null },
      });
    }
    return;
  }

  const { elementsByKind, errors } = await validateElementsForDescriptions(
    client,
    payload,
    collectionsToReplace
  );

  if (errors.length > 0) {
    throw new HttpError(400, 'La configuración contiene elementos inválidos.', errors);
  }

  if (!effectiveHasMotifs) {
    const itemsWithMotif = collectionsToReplace.flatMap(({ key }) => (payload[key] ?? []).filter((item) => Boolean(item.motif)));
    if (itemsWithMotif.length > 0) {
      throw new HttpError(400, 'No se pueden guardar motivos cuando la configuración no los tiene habilitados.');
    }
  }

  for (const { key, kind } of collectionsToReplace) {
    const items = payload[key] ?? [];
    const elementIdsForKind = (elementsByKind.get(kind) ?? []).map((element) => element.id);
    const providedIds = new Set(items.map((item) => item.id));
    const descriptionIdsToDelete = elementIdsForKind.filter((elementId) => !providedIds.has(elementId));

    if (descriptionIdsToDelete.length > 0) {
      await client.descripcionElemento.deleteMany({
        where: {
          skinId,
          elementId: { in: descriptionIdsToDelete },
        },
      });
    }

    for (const item of items) {
      await client.descripcionElemento.upsert({
        where: {
          skinId_elementId: {
            skinId,
            elementId: item.id,
          },
        },
        create: {
          skinId,
          elementId: item.id,
          displayName: item.name,
          description: item.desc,
          imageUrl: item.imageUrl ?? null,
          motif: effectiveHasMotifs ? item.motif ?? null : null,
        },
        update: {
          displayName: item.name,
          description: item.desc,
          imageUrl: item.imageUrl ?? null,
          motif: effectiveHasMotifs ? item.motif ?? null : null,
        },
      });
    }
  }

  if (!effectiveHasMotifs) {
    await client.descripcionElemento.updateMany({
      where: { skinId },
      data: { motif: null },
    });
  }
}

async function validateElementsForDescriptions(
  client: PrismaWriter,
  payload: DescriptionsPayload,
  collections: Array<{ key: ConfigCollectionKey; kind: TipoElemento }>
) {
  const referencedItems = collections.flatMap(({ key, kind }) =>
    (payload[key] ?? []).map((item) => ({
      item,
      kind,
      collection: key,
    }))
  );

  const uniqueIds = Array.from(new Set(referencedItems.map(({ item }) => item.id)));
  const kinds = Array.from(new Set(collections.map(({ kind }) => kind)));
  const elements = await client.elemento.findMany({
    where: {
      OR: [
        { kind: { in: kinds } },
        ...(uniqueIds.length > 0 ? [{ id: { in: uniqueIds } }] : []),
      ],
    },
  });

  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const elementsByKind = new Map<TipoElemento, Elemento[]>();
  const errors: string[] = [];

  for (const kind of kinds) {
    elementsByKind.set(
      kind,
      elements.filter((element) => element.kind === kind)
    );
  }

  for (const { key } of collections) {
    const seenIds = new Set<string>();
    for (const item of payload[key] ?? []) {
      if (seenIds.has(item.id)) {
        errors.push(`No se puede repetir el elemento ${item.id} en la colección ${key}.`);
      }
      seenIds.add(item.id);
    }
  }

  for (const { item, kind } of referencedItems) {
    const element = elementsById.get(item.id);

    if (!element) {
      errors.push(`El elemento ${item.id} no existe en la base de datos.`);
      continue;
    }

    if (element.kind !== kind) {
      errors.push(`El elemento ${item.id} no pertenece a la categoría esperada.`);
    }
  }

  return { elementsById, elementsByKind, errors };
}

function respondUnexpectedError(res: Response, error: unknown) {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.message,
      details: error.details,
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Ya existe un recurso con los datos proporcionados.' });
      return;
    }

    if (error.code === 'P2003') {
      res.status(409).json({ error: 'No se puede completar la operación por una relación existente en la base de datos.' });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({ error: 'El recurso solicitado no existe.' });
      return;
    }
  }

  res.status(500).json({ error: 'Se ha producido un error interno al procesar la configuración.' });
}

export default router;