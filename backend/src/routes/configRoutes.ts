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

type SkinElementOverride = {
  name?: string;
  imageUrl?: string;
  motif?: string;
};

type SkinContextMetadata = {
  version: 1;
  gameTitle: string;
  duration: string;
  cat1Name: string;
  cat2Name: string;
  cat3Name: string;
  hasMotifs: boolean;
  createdAt: number;
  updatedAt: number;
  legacyContext?: string;
  elementOverrides: Record<string, SkinElementOverride>;
};

const DEFAULT_METADATA = {
  gameTitle: 'Cluedo Online',
  duration: '60',
  cat1Name: 'Sujetos',
  cat2Name: 'Objetos',
  cat3Name: 'Espacios',
  hasMotifs: false,
} as const;

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
      prisma.cluedoSkin.findMany(),
      prisma.elemento.groupBy({ by: ['kind'], _count: { _all: true } }),
    ]);

    const countByKind = new Map<TipoElemento, number>(
      counts.map((entry) => [entry.kind, entry._count._all])
    );

    const items = skins
      .map((skin) => {
        const metadata = parseSkinContext(skin.context, skin.name);

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
          subjectCount: countByKind.get(TipoElemento.SUJETO) ?? 0,
          objectCount: countByKind.get(TipoElemento.OBJETO) ?? 0,
          spaceCount: countByKind.get(TipoElemento.ESPACIO) ?? 0,
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
      const initialMetadata = createSkinMetadata(payload, Date.now());
      const skin = await tx.cluedoSkin.create({
        data: mapCreateSkinFields(payload, initialMetadata),
      });

      const nextMetadata = await replaceSkinDescriptions(
        tx,
        skin.id,
        extractDescriptionsPayload(payload),
        initialMetadata
      );

      if (serializeSkinContext(nextMetadata) !== skin.context) {
        await tx.cluedoSkin.update({
          where: { id: skin.id },
          data: { context: serializeSkinContext(nextMetadata) },
        });
      }

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

      const metadata = mergeSkinMetadata(parseSkinContext(existingSkin.context, existingSkin.name), payload);
      const nextMetadata = await replaceSkinDescriptions(
        tx,
        skinId,
        extractDescriptionsPayload(payload),
        metadata
      );

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

      const metadata = touchSkinMetadata(parseSkinContext(existingSkin.context, existingSkin.name));
      const nextMetadata = await replaceSkinDescriptions(
        tx,
        skinId,
        extractDescriptionsPayload(payload),
        metadata
      );

      await tx.cluedoSkin.update({
        where: { id: skinId },
        data: { context: serializeSkinContext(nextMetadata) },
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
  const data: Prisma.CluedoSkinUpdateInput = {};

  if (payload.name !== undefined) {
    data.name = payload.name;
  }

  if (payload.objective !== undefined) {
    data.objective = payload.objective;
  }

  if (payload.centerImage !== undefined) {
    data.imageUrl = payload.centerImage ?? null;
  }

  data.context = serializeSkinContext(metadata);

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

function createSkinMetadata(payload: CreateSkinConfigInput, timestamp: number): SkinContextMetadata {
  return {
    version: 1,
    gameTitle: payload.gameTitle,
    duration: String(payload.duration),
    cat1Name: payload.cat1Name,
    cat2Name: payload.cat2Name,
    cat3Name: payload.cat3Name,
    hasMotifs: payload.hasMotifs ?? DEFAULT_METADATA.hasMotifs,
    createdAt: timestamp,
    updatedAt: timestamp,
    elementOverrides: {},
  };
}

function parseSkinContext(rawContext: string | null, fallbackName: string): SkinContextMetadata {
  const fallback = createFallbackMetadata(fallbackName);

  if (!rawContext || !rawContext.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawContext) as Record<string, unknown>;

    if (parsed && typeof parsed === 'object') {
      const metadata: SkinContextMetadata = {
        version: 1,
        gameTitle: getStringValue(parsed.gameTitle, fallbackName || DEFAULT_METADATA.gameTitle),
        duration: getDurationValue(parsed.duration, DEFAULT_METADATA.duration),
        cat1Name: getStringValue(parsed.cat1Name, DEFAULT_METADATA.cat1Name),
        cat2Name: getStringValue(parsed.cat2Name, DEFAULT_METADATA.cat2Name),
        cat3Name: getStringValue(parsed.cat3Name, DEFAULT_METADATA.cat3Name),
        hasMotifs: typeof parsed.hasMotifs === 'boolean' ? parsed.hasMotifs : DEFAULT_METADATA.hasMotifs,
        createdAt: getTimestampValue(parsed.createdAt),
        updatedAt: getTimestampValue(parsed.updatedAt, getTimestampValue(parsed.createdAt)),
        elementOverrides: parseElementOverrides(parsed.elementOverrides),
      };

      const legacyContext = getOptionalStringValue(parsed.legacyContext);
      return legacyContext ? { ...metadata, legacyContext } : metadata;
    }
  } catch {
    return {
      ...fallback,
      gameTitle: rawContext.trim() || fallback.gameTitle,
      legacyContext: rawContext,
    };
  }

  return fallback;
}

function mergeSkinMetadata(
  current: SkinContextMetadata,
  payload: UpdateSkinConfigInput
): SkinContextMetadata {
  const timestamp = Date.now();
  const nextMetadataBase: SkinContextMetadata = {
    version: 1,
    gameTitle: payload.gameTitle ?? current.gameTitle,
    duration: payload.duration !== undefined ? String(payload.duration) : current.duration,
    cat1Name: payload.cat1Name ?? current.cat1Name,
    cat2Name: payload.cat2Name ?? current.cat2Name,
    cat3Name: payload.cat3Name ?? current.cat3Name,
    hasMotifs: payload.hasMotifs ?? current.hasMotifs,
    createdAt: current.createdAt > 0 ? current.createdAt : timestamp,
    updatedAt: timestamp,
    elementOverrides: { ...current.elementOverrides },
  };

  const nextMetadata = current.legacyContext
    ? { ...nextMetadataBase, legacyContext: current.legacyContext }
    : nextMetadataBase;

  if (!nextMetadata.hasMotifs) {
    removeMotifsFromOverrides(nextMetadata.elementOverrides);
  }

  return nextMetadata;
}

function touchSkinMetadata(current: SkinContextMetadata): SkinContextMetadata {
  const timestamp = Date.now();

  return {
    ...current,
    createdAt: current.createdAt > 0 ? current.createdAt : timestamp,
    updatedAt: timestamp,
    elementOverrides: { ...current.elementOverrides },
  };
}

function createFallbackMetadata(fallbackName: string): SkinContextMetadata {
  return {
    version: 1,
    gameTitle: fallbackName || DEFAULT_METADATA.gameTitle,
    duration: DEFAULT_METADATA.duration,
    cat1Name: DEFAULT_METADATA.cat1Name,
    cat2Name: DEFAULT_METADATA.cat2Name,
    cat3Name: DEFAULT_METADATA.cat3Name,
    hasMotifs: DEFAULT_METADATA.hasMotifs,
    createdAt: 0,
    updatedAt: 0,
    elementOverrides: {},
  };
}

function serializeSkinContext(metadata: SkinContextMetadata) {
  const sanitizedOverrides: Record<string, SkinElementOverride> = {};

  for (const [elementId, override] of Object.entries(metadata.elementOverrides)) {
    const normalizedOverride: SkinElementOverride = {
      ...(override.name ? { name: override.name } : {}),
      ...(override.imageUrl ? { imageUrl: override.imageUrl } : {}),
      ...(metadata.hasMotifs && override.motif ? { motif: override.motif } : {}),
    };

    if (Object.keys(normalizedOverride).length > 0) {
      sanitizedOverrides[elementId] = normalizedOverride;
    }
  }

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
    elementOverrides: sanitizedOverrides,
  });
}

function parseElementOverrides(value: unknown): Record<string, SkinElementOverride> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const parsedOverrides: Record<string, SkinElementOverride> = {};

  for (const [elementId, override] of Object.entries(value)) {
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      continue;
    }

    const overrideRecord = override as Record<string, unknown>;
    const name = getOptionalStringValue(overrideRecord.name);
    const imageUrl = getOptionalStringValue(overrideRecord.imageUrl);
    const motif = getOptionalStringValue(overrideRecord.motif);
    const parsedOverride: SkinElementOverride = {
      ...(name ? { name } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(motif ? { motif } : {}),
    };

    if (Object.keys(parsedOverride).length > 0) {
      parsedOverrides[elementId] = parsedOverride;
    }
  }

  return parsedOverrides;
}

function getStringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getOptionalStringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getDurationValue(value: unknown, fallback: string) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function getTimestampValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function removeMotifsFromOverrides(overrides: Record<string, SkinElementOverride>) {
  for (const override of Object.values(overrides)) {
    delete override.motif;
  }
}

async function loadSkinConfiguration(client: PrismaReader, skinId: string) {
  const [skin, elements, descriptions] = await Promise.all([
    client.cluedoSkin.findUnique({ where: { id: skinId } }),
    client.elemento.findMany({
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
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

  const metadata = parseSkinContext(skin.context, skin.name);

  return {
    id: skin.id,
    name: skin.name,
    gameTitle: metadata.gameTitle,
    objective: skin.objective ?? '',
    duration: metadata.duration,
    centerImage: skin.imageUrl ?? '',
    cat1Name: metadata.cat1Name,
    cat2Name: metadata.cat2Name,
    cat3Name: metadata.cat3Name,
    hasMotifs: metadata.hasMotifs,
    subjects: buildConfigItems(elements, descriptionsByElementId, metadata, TipoElemento.SUJETO),
    objects: buildConfigItems(elements, descriptionsByElementId, metadata, TipoElemento.OBJETO),
    spaces: buildConfigItems(elements, descriptionsByElementId, metadata, TipoElemento.ESPACIO),
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
  };
}

function buildConfigItems(
  elements: Elemento[],
  descriptionsByElementId: Map<string, SkinDescriptionRecord>,
  metadata: SkinContextMetadata,
  kind: TipoElemento
) {
  return elements
    .filter((element) => element.kind === kind)
    .map((element) => {
      const description = descriptionsByElementId.get(element.id);
      const override = metadata.elementOverrides[element.id];

      return {
        id: element.id,
        name: override?.name ?? element.name,
        desc: description?.description ?? '',
        imageUrl: override?.imageUrl ?? element.imageUrl ?? undefined,
        motif: metadata.hasMotifs ? override?.motif ?? undefined : undefined,
      };
    });
}

async function replaceSkinDescriptions(
  client: PrismaWriter,
  skinId: string,
  payload: DescriptionsPayload,
  metadata: SkinContextMetadata
) {
  const collectionsToReplace = CONFIG_COLLECTIONS.filter(({ key }) => payload[key] !== undefined);
  const nextMetadata: SkinContextMetadata = {
    ...metadata,
    elementOverrides: { ...metadata.elementOverrides },
  };

  if (collectionsToReplace.length === 0) {
    if (!nextMetadata.hasMotifs) {
      removeMotifsFromOverrides(nextMetadata.elementOverrides);
    }

    return nextMetadata;
  }

  const { elementsById, elementsByKind, errors } = await validateElementsForDescriptions(
    client,
    payload,
    collectionsToReplace
  );

  if (errors.length > 0) {
    throw new HttpError(400, 'La configuración contiene elementos inválidos.', errors);
  }

  if (!nextMetadata.hasMotifs) {
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

      for (const elementId of descriptionIdsToDelete) {
        delete nextMetadata.elementOverrides[elementId];
      }
    }

    for (const item of items) {
      const element = elementsById.get(item.id);

      if (!element) {
        continue;
      }

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
          description: item.desc,
        },
        update: {
          description: item.desc,
        },
      });

      const override = buildElementOverride(item, element, nextMetadata.hasMotifs);
      if (override) {
        nextMetadata.elementOverrides[item.id] = override;
      } else {
        delete nextMetadata.elementOverrides[item.id];
      }
    }
  }

  if (!nextMetadata.hasMotifs) {
    removeMotifsFromOverrides(nextMetadata.elementOverrides);
  }

  nextMetadata.updatedAt = Date.now();
  if (nextMetadata.createdAt <= 0) {
    nextMetadata.createdAt = nextMetadata.updatedAt;
  }

  return nextMetadata;
}

function buildElementOverride(
  item: ConfigItemInput,
  element: Elemento,
  hasMotifs: boolean
) {
  const override: SkinElementOverride = {};

  if (item.name !== element.name) {
    override.name = item.name;
  }

  if (item.imageUrl !== undefined && item.imageUrl !== (element.imageUrl ?? undefined)) {
    override.imageUrl = item.imageUrl;
  }

  if (hasMotifs && item.motif) {
    override.motif = item.motif;
  }

  return Object.keys(override).length > 0 ? override : null;
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