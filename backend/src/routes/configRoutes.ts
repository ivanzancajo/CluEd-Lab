import { Prisma, TipoElemento, type DescripcionElemento, type Elemento } from '@prisma/client';
import { Router } from 'express';
import type { Response } from 'express';
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
import { HttpError, parseBody } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import {
  DEFAULT_SKIN_METADATA,
  countCollectionsByKind,
  loadSkinConfiguration,
  parseSkinContext,
  type SkinContextMetadata,
} from '../lib/skinConfigs.js';
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

type PrismaWriter = Pick<typeof prisma, 'cluedoSkin' | 'elemento' | 'descripcionElemento' | 'partida'>;
type SkinDescriptionRecord = DescripcionElemento & {
  motif?: string | null;
  element: Elemento;
};
type DescriptionsPayload = {
  subjects?: ConfigItemInput[] | undefined;
  objects?: ConfigItemInput[] | undefined;
  spaces?: ConfigItemInput[] | undefined;
};

router.use(verifyToken);

router.get('/skins', async (_req, res) => {
  try {
    const skins = await prisma.cluedoSkin.findMany({
      include: {
        elementDescriptions: {
          select: {
            elementId: true,
          },
        },
      },
    });

    const elementIds = [...new Set(skins.flatMap((skin) => skin.elementDescriptions.map((description) => description.elementId)))];
    const elements = elementIds.length > 0
      ? await prisma.elemento.findMany({
          where: {
            id: {
              in: elementIds,
            },
          },
          select: {
            id: true,
            kind: true,
          },
        })
      : [];
    const elementsById = new Map(elements.map((element) => [element.id, element]));

    const items = skins
      .map((skin) => {
        const metadata = parseSkinContext(skin.context, skin.name);
        const counts = countCollectionsByKind(
          skin.elementDescriptions.map((description) => ({
            element: elementsById.get(description.elementId) ?? null,
          }))
        );

        return {
          id: skin.id,
          name: skin.name,
          gameTitle: metadata.gameTitle,
          duration: metadata.duration,
          centerImage: skin.imageUrl ?? '',
          cat1Name: metadata.cat1Name,
          cat2Name: metadata.cat2Name,
          cat3Name: metadata.cat3Name,
          hasMotifs: metadata.hasMotifs,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
          subjectCount: counts.subjects,
          objectCount: counts.objects,
          spaceCount: counts.spaces,
        };
      })
      .sort((left, right) => {
        const byUpdated = right.updatedAt - left.updatedAt;
        if (byUpdated !== 0) {
          return byUpdated;
        }

        const byCreated = right.createdAt - left.createdAt;
        if (byCreated !== 0) {
          return byCreated;
        }

        return left.name.localeCompare(right.name, 'es');
      });

    res.json({ items });
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
      const metadata = createSkinMetadata(payload, Date.now());
      const skin = await tx.cluedoSkin.create({
        data: mapCreateSkinFields(payload, metadata),
      });

      await syncSkinCollections(tx, skin.id, extractDescriptionsPayload(payload), metadata.hasMotifs);

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

      const currentMetadata = parseSkinContext(existingSkin.context, existingSkin.name);
      const nextMetadata = mergeSkinMetadata(currentMetadata, payload);
      const descriptionsPayload = extractDescriptionsPayload(payload);
      const hasCollectionChanges = hasDescriptionsPayload(descriptionsPayload);

      if (hasCollectionChanges) {
        await ensureSkinNotLinkedToMatches(tx, skinId);
        await syncSkinCollections(tx, skinId, descriptionsPayload, nextMetadata.hasMotifs);
      } else if (!currentMetadata.hasMotifs && nextMetadata.hasMotifs) {
        await ensureSkinSpacesHaveMotifs(tx, skinId);
      }

      await tx.cluedoSkin.update({
        where: { id: skinId },
        data: mapUpdateSkinFields(payload, nextMetadata),
      });

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

      await ensureSkinNotLinkedToMatches(tx, skinId);

      const metadata = touchSkinMetadata(parseSkinContext(existingSkin.context, existingSkin.name));
      await syncSkinCollections(tx, skinId, extractDescriptionsPayload(payload), metadata.hasMotifs);

      await tx.cluedoSkin.update({
        where: { id: skinId },
        data: { context: serializeSkinContext(metadata) },
      });

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
    await prisma.$transaction(async (tx) => {
      const existingSkin = await tx.cluedoSkin.findUnique({
        where: { id: skinId },
        include: {
          elementDescriptions: {
            select: {
              elementId: true,
            },
          },
        },
      });

      if (!existingSkin) {
        throw new HttpError(404, 'La configuración solicitada no existe.');
      }

      await ensureSkinNotLinkedToMatches(tx, skinId, 'No se puede eliminar la configuración porque está asociada a una partida.');

      const elementIds = existingSkin.elementDescriptions.map((description) => description.elementId);
      await tx.cluedoSkin.delete({ where: { id: skinId } });

      for (const elementId of elementIds) {
        await deleteElementIfOrphaned(tx, elementId);
      }
    });

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

function mapCreateSkinFields(
  payload: CreateSkinConfigInput,
  metadata: SkinContextMetadata
): Prisma.CluedoSkinCreateInput {
  return {
    name: payload.name,
    objective: payload.objective,
    imageUrl: payload.centerImage ?? null,
    context: serializeSkinContext(metadata),
  };
}

function mapUpdateSkinFields(
  payload: UpdateSkinConfigInput,
  metadata: SkinContextMetadata
): Prisma.CluedoSkinUpdateInput {
  const data: Prisma.CluedoSkinUpdateInput = {
    context: serializeSkinContext(metadata),
  };

  if (payload.name !== undefined) {
    data.name = payload.name;
  }

  if (payload.objective !== undefined) {
    data.objective = payload.objective;
  }

  if (payload.centerImage !== undefined) {
    data.imageUrl = payload.centerImage ?? null;
  }

  return data;
}

function extractDescriptionsPayload(
  payload: {
    subjects?: ConfigItemInput[] | undefined;
    objects?: ConfigItemInput[] | undefined;
    spaces?: ConfigItemInput[] | undefined;
  }
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

function hasDescriptionsPayload(payload: DescriptionsPayload) {
  return payload.subjects !== undefined || payload.objects !== undefined || payload.spaces !== undefined;
}

function createSkinMetadata(payload: CreateSkinConfigInput, timestamp: number): SkinContextMetadata {
  return {
    version: 1,
    gameTitle: payload.gameTitle,
    duration: String(payload.duration),
    cat1Name: payload.cat1Name,
    cat2Name: payload.cat2Name,
    cat3Name: payload.cat3Name,
    hasMotifs: payload.hasMotifs ?? DEFAULT_SKIN_METADATA.hasMotifs,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function mergeSkinMetadata(
  current: SkinContextMetadata,
  payload: UpdateSkinConfigInput
): SkinContextMetadata {
  const timestamp = Date.now();
  const baseMetadata: SkinContextMetadata = {
    version: 1,
    gameTitle: payload.gameTitle ?? current.gameTitle,
    duration: payload.duration !== undefined ? String(payload.duration) : current.duration,
    cat1Name: payload.cat1Name ?? current.cat1Name,
    cat2Name: payload.cat2Name ?? current.cat2Name,
    cat3Name: payload.cat3Name ?? current.cat3Name,
    hasMotifs: payload.hasMotifs ?? current.hasMotifs,
    createdAt: current.createdAt > 0 ? current.createdAt : timestamp,
    updatedAt: timestamp,
  };

  return current.legacyContext
    ? { ...baseMetadata, legacyContext: current.legacyContext }
    : baseMetadata;
}

function touchSkinMetadata(current: SkinContextMetadata): SkinContextMetadata {
  const timestamp = Date.now();

  return {
    ...current,
    createdAt: current.createdAt > 0 ? current.createdAt : timestamp,
    updatedAt: timestamp,
  };
}

function serializeSkinContext(metadata: SkinContextMetadata) {
  return JSON.stringify({
    version: 1,
    gameTitle: metadata.gameTitle,
    duration: metadata.duration,
    cat1Name: metadata.cat1Name,
    cat2Name: metadata.cat2Name,
    cat3Name: metadata.cat3Name,
    hasMotifs: metadata.hasMotifs,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    ...(metadata.legacyContext ? { legacyContext: metadata.legacyContext } : {}),
  });
}

async function syncSkinCollections(
  client: PrismaWriter,
  skinId: string,
  payload: DescriptionsPayload,
  hasMotifs: boolean
) {
  const collectionsToReplace = CONFIG_COLLECTIONS.filter(({ key }) => payload[key] !== undefined);

  if (collectionsToReplace.length === 0) {
    return;
  }

  const existingDescriptions = await client.descripcionElemento.findMany({
    where: { skinId },
    include: { element: true },
  });

  const existingByKind = new Map<TipoElemento, Map<string, SkinDescriptionRecord>>(
    CONFIG_COLLECTIONS.map(({ kind }) => [kind, new Map<string, SkinDescriptionRecord>()])
  );

  for (const description of existingDescriptions) {
    existingByKind.get(description.element.kind)?.set(description.elementId, description);
  }

  for (const { key, kind } of collectionsToReplace) {
    const items = payload[key] ?? [];
    validateSkinOwnedItems(items, key, kind, existingByKind.get(kind) ?? new Map());
    validateSpaceMotifs(items, key, hasMotifs);

    const existingDescriptionsForKind = existingByKind.get(kind) ?? new Map<string, SkinDescriptionRecord>();
    const retainedIds = new Set<string>();

    for (const item of items) {
      if (item.id) {
        const existingDescription = existingDescriptionsForKind.get(item.id);

        if (!existingDescription) {
          throw new HttpError(400, `El elemento ${item.id} no pertenece a la skin seleccionada.`);
        }

        await updateSkinItem(client, skinId, existingDescription, item, key);
        retainedIds.add(existingDescription.elementId);
        continue;
      }

      const createdDescription = await createSkinItem(client, skinId, kind, item, key);
      retainedIds.add(createdDescription.elementId);
    }

    for (const description of existingDescriptionsForKind.values()) {
      if (retainedIds.has(description.elementId)) {
        continue;
      }

      await client.descripcionElemento.delete({
        where: {
          skinId_elementId: {
            skinId,
            elementId: description.elementId,
          },
        },
      });

      await deleteElementIfOrphaned(client, description.elementId);
    }
  }
}

function validateSkinOwnedItems(
  items: ConfigItemInput[],
  key: ConfigCollectionKey,
  kind: TipoElemento,
  existingDescriptions: Map<string, SkinDescriptionRecord>
) {
  for (const item of items) {
    if (!item.id) {
      continue;
    }

    const existingDescription = existingDescriptions.get(item.id);
    if (!existingDescription) {
      throw new HttpError(400, `El elemento ${item.id} no pertenece a la colección ${key} de esta skin.`);
    }

    if (existingDescription.element.kind !== kind) {
      throw new HttpError(400, `El elemento ${item.id} no pertenece a la categoría esperada.`);
    }
  }
}

function validateSpaceMotifs(items: ConfigItemInput[], key: ConfigCollectionKey, hasMotifs: boolean) {
  if (key !== 'spaces' || !hasMotifs) {
    return;
  }

  const itemsWithoutMotif = items.filter((item) => !item.motif);
  if (itemsWithoutMotif.length > 0) {
    throw new HttpError(
      400,
      'Debes indicar un motivo para cada espacio cuando la configuración tiene motivos habilitados.'
    );
  }
}

async function createSkinItem(
  client: PrismaWriter,
  skinId: string,
  kind: TipoElemento,
  item: ConfigItemInput,
  key: ConfigCollectionKey
) {
  const element = await client.elemento.create({
    data: {
      kind,
      name: item.name,
      imageUrl: item.imageUrl ?? null,
    },
  });

  return client.descripcionElemento.create({
    data: {
      skinId,
      elementId: element.id,
      description: item.desc,
      motif: key === 'spaces' ? item.motif ?? null : null,
    },
    include: {
      element: true,
    },
  });
}

async function updateSkinItem(
  client: PrismaWriter,
  skinId: string,
  description: SkinDescriptionRecord,
  item: ConfigItemInput,
  key: ConfigCollectionKey
) {
  await client.elemento.update({
    where: { id: description.elementId },
    data: {
      name: item.name,
      imageUrl: item.imageUrl ?? null,
    },
  });

  await client.descripcionElemento.update({
    where: {
      skinId_elementId: {
        skinId,
        elementId: description.elementId,
      },
    },
    data: {
      description: item.desc,
      motif: key === 'spaces' ? item.motif ?? null : null,
    },
  });
}

async function ensureSkinNotLinkedToMatches(
  client: PrismaWriter,
  skinId: string,
  message = 'No se puede modificar la configuración porque está asociada a una partida.'
) {
  const linkedMatches = await client.partida.count({ where: { skinId } });

  if (linkedMatches > 0) {
    throw new HttpError(409, message);
  }
}

async function ensureSkinSpacesHaveMotifs(client: PrismaWriter, skinId: string) {
  const spaceDescriptions = (await client.descripcionElemento.findMany({
    where: {
      skinId,
      element: {
        kind: TipoElemento.ESPACIO,
      },
    },
  })) as Array<{ motif?: string | null }>;

  const hasSpacesWithoutMotif = spaceDescriptions.some((description) => !description.motif?.trim());
  if (hasSpacesWithoutMotif) {
    throw new HttpError(
      400,
      'No se pueden habilitar los motivos mientras existan espacios sin motivo asociado.'
    );
  }
}

async function deleteElementIfOrphaned(client: PrismaWriter, elementId: string) {
  const element = await client.elemento.findUnique({
    where: { id: elementId },
    include: {
      _count: {
        select: {
          skinDescriptions: true,
          reasoningCells: true,
          subjectSolutions: true,
          objectSolutions: true,
          spaceSolutions: true,
        },
      },
    },
  });

  if (!element) {
    return;
  }

  if (
    element._count.skinDescriptions > 0 ||
    element._count.reasoningCells > 0 ||
    element._count.subjectSolutions > 0 ||
    element._count.objectSolutions > 0 ||
    element._count.spaceSolutions > 0
  ) {
    return;
  }

  await client.elemento.delete({ where: { id: elementId } });
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