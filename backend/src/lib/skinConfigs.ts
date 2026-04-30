import { TipoElemento, type DescripcionElemento, type Elemento } from '@prisma/client';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';

type PrismaSkinReader = Pick<typeof prisma, 'cluedoSkin'> & Partial<Pick<typeof prisma, 'elemento'>>;
type SkinDescriptionRecord = DescripcionElemento & {
  element?: Elemento | null;
};
type SkinWithDescriptions = {
  id: string;
  name: string;
  objective: string | null;
  context: string | null;
  imageUrl: string | null;
  elementDescriptions: DescripcionElemento[];
};

export type SkinContextMetadata = {
  version: 1;
  gameTitle: string;
  duration: string;
  cat1Name: string;
  cat2Name: string;
  cat3Name: string;
  hasMotifs: boolean;
  createdAt: number;
  updatedAt: number;
  legacyContext?: string | undefined;
};

export interface LoadedSkinConfiguration {
  id: string;
  name: string;
  gameTitle: string;
  objective: string;
  duration: string;
  centerImage: string;
  cat1Name: string;
  cat2Name: string;
  cat3Name: string;
  hasMotifs: boolean;
  subjects: Array<{
    id: string;
    name: string;
    desc: string;
    imageUrl?: string | undefined;
    motif?: string | undefined;
  }>;
  objects: Array<{
    id: string;
    name: string;
    desc: string;
    imageUrl?: string | undefined;
    motif?: string | undefined;
  }>;
  spaces: Array<{
    id: string;
    name: string;
    desc: string;
    imageUrl?: string | undefined;
    motif?: string | undefined;
  }>;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_SKIN_METADATA = {
  gameTitle: 'Cluedo Online',
  duration: '60',
  cat1Name: 'Sujetos',
  cat2Name: 'Objetos',
  cat3Name: 'Espacios',
  hasMotifs: false,
} as const;

export function parseSkinContext(rawContext: string | null, fallbackName: string): SkinContextMetadata {
  const fallback = createFallbackMetadata(fallbackName);

  if (!rawContext || !rawContext.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawContext) as Record<string, unknown>;

    if (parsed && typeof parsed === 'object') {
      const metadata: SkinContextMetadata = {
        version: 1,
        gameTitle: getStringValue(parsed.gameTitle, fallbackName || DEFAULT_SKIN_METADATA.gameTitle),
        duration: getDurationValue(parsed.duration, DEFAULT_SKIN_METADATA.duration),
        cat1Name: getStringValue(parsed.cat1Name, DEFAULT_SKIN_METADATA.cat1Name),
        cat2Name: getStringValue(parsed.cat2Name, DEFAULT_SKIN_METADATA.cat2Name),
        cat3Name: getStringValue(parsed.cat3Name, DEFAULT_SKIN_METADATA.cat3Name),
        hasMotifs:
          typeof parsed.hasMotifs === 'boolean' ? parsed.hasMotifs : DEFAULT_SKIN_METADATA.hasMotifs,
        createdAt: getTimestampValue(parsed.createdAt),
        updatedAt: getTimestampValue(parsed.updatedAt, getTimestampValue(parsed.createdAt)),
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

export function countCollectionsByKind(
  descriptions: Array<{ element?: { kind?: TipoElemento | null } | null }>
) {
  return descriptions.reduce(
    (accumulator, description) => {
      if (description.element?.kind === TipoElemento.SUJETO) {
        accumulator.subjects += 1;
      }

      if (description.element?.kind === TipoElemento.OBJETO) {
        accumulator.objects += 1;
      }

      if (description.element?.kind === TipoElemento.ESPACIO) {
        accumulator.spaces += 1;
      }

      return accumulator;
    },
    { subjects: 0, objects: 0, spaces: 0 }
  );
}

export async function loadSkinConfiguration(client: PrismaSkinReader, skinId: string): Promise<LoadedSkinConfiguration> {
  const skin = (await client.cluedoSkin.findUnique({
    where: { id: skinId },
    include: {
      elementDescriptions: true,
    },
  })) as SkinWithDescriptions | null;

  if (!skin) {
    throw new HttpError(404, 'La configuración solicitada no existe.');
  }

  const metadata = parseSkinContext(skin.context, skin.name);
  const descriptions = await attachElementsToDescriptions(client, skin.elementDescriptions);

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
    subjects: buildConfigItems(descriptions, TipoElemento.SUJETO),
    objects: buildConfigItems(descriptions, TipoElemento.OBJETO),
    spaces: buildConfigItems(descriptions, TipoElemento.ESPACIO),
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
  };
}

async function attachElementsToDescriptions(client: PrismaSkinReader, descriptions: DescripcionElemento[]) {
  const elementReader = client.elemento ?? prisma.elemento;
  const elementIds = [...new Set(descriptions.map((description) => description.elementId))];

  if (elementIds.length === 0) {
    return descriptions.map((description) => ({ ...description, element: null }));
  }

  const elements = await elementReader.findMany({
    where: {
      id: {
        in: elementIds,
      },
    },
  });

  const elementsById = new Map(elements.map((element) => [element.id, element]));

  return descriptions.map((description) => ({
    ...description,
    element: elementsById.get(description.elementId) ?? null,
  }));
}

function createFallbackMetadata(fallbackName: string): SkinContextMetadata {
  return {
    version: 1,
    gameTitle: fallbackName || DEFAULT_SKIN_METADATA.gameTitle,
    duration: DEFAULT_SKIN_METADATA.duration,
    cat1Name: DEFAULT_SKIN_METADATA.cat1Name,
    cat2Name: DEFAULT_SKIN_METADATA.cat2Name,
    cat3Name: DEFAULT_SKIN_METADATA.cat3Name,
    hasMotifs: DEFAULT_SKIN_METADATA.hasMotifs,
    createdAt: 0,
    updatedAt: 0,
  };
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

function buildConfigItems(descriptions: SkinDescriptionRecord[], kind: TipoElemento) {
  return descriptions
    .filter(
      (description): description is SkinDescriptionRecord & { element: Elemento } =>
        description.element?.kind === kind
    )
    .sort((left, right) => left.element.name.localeCompare(right.element.name, 'es'))
    .map((description) => ({
      id: description.elementId,
      name: description.element.name,
      desc: description.description ?? '',
      imageUrl: description.element.imageUrl ?? undefined,
      motif: kind === TipoElemento.ESPACIO ? description.motif ?? undefined : undefined,
    }));
}