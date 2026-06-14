import { z } from 'zod';

const MAX_IMAGE_LENGTH = 5_000_000;
const MAX_TEXT_LENGTH = 4_000;
const COLLECTION_CONSTRAINTS = {
  subjects: { min: 6, max: 10 },
  objects:  { min: 6, max: 10 },
  spaces:   { min: 9, max: 9 },
} as const;

const uuidSchema = z.string().uuid('El identificador debe ser un UUID válido.');

function requiredText(label: string, maxLength: number) {
  return z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, `${label} es obligatorio.`)
    .refine(
      (value) => value.length <= maxLength,
      `${label} no puede superar ${maxLength} caracteres.`
    );
}

function optionalText(maxLength: number, label: string) {
  return z.preprocess((value) => {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().max(maxLength, `${label} no puede superar ${maxLength} caracteres.`).optional());
}

const durationSchema = z.union([z.number(), z.string()]).transform((value, context) => {
  const parsedValue = typeof value === 'number' ? value : Number(value.trim());

  if (!Number.isInteger(parsedValue)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La duración debe ser un número entero.',
    });
    return z.NEVER;
  }

  if (parsedValue < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La duración debe ser mayor que 0.',
    });
    return z.NEVER;
  }

  if (parsedValue > 480) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La duración no puede superar los 480 minutos.',
    });
    return z.NEVER;
  }

  return parsedValue;
});

type MotifValidationInput = {
  hasMotifs?: boolean | undefined;
  subjects?: ConfigItemInput[] | undefined;
  objects?: ConfigItemInput[] | undefined;
  spaces?: ConfigItemInput[] | undefined;
};

export const configItemSchema = z.object({
  id: uuidSchema.optional(),
  name: requiredText('El nombre del elemento', 120),
  desc: requiredText('La descripción del elemento', MAX_TEXT_LENGTH),
  imageUrl: optionalText(MAX_IMAGE_LENGTH, 'La imagen del elemento'),
  motif: optionalText(2_000, 'El motivo del elemento'),
});

function collectionSchema(key: ConfigCollectionKey) {
  const { min, max } = COLLECTION_CONSTRAINTS[key];
  const label = getCollectionLabel(key);
  const arr = z.array(configItemSchema);
  if (min === max) {
    return arr.length(min, `La configuración debe tener exactamente ${min} ${label}.`);
  }
  return arr
    .min(min, `La configuración debe tener al menos ${min} ${label}.`)
    .max(max, `La configuración no puede tener más de ${max} ${label}.`);
}

const fullConfigCollections = z.object({
  subjects: collectionSchema('subjects'),
  objects: collectionSchema('objects'),
  spaces: collectionSchema('spaces'),
});

const partialConfigCollections = z.object({
  subjects: collectionSchema('subjects').optional(),
  objects: collectionSchema('objects').optional(),
  spaces: collectionSchema('spaces').optional(),
});

const skinBaseSchema = z.object({
  name: requiredText('El nombre de la configuración', 100),
  gameTitle: requiredText('El título público de la partida', 120),
  objective: requiredText('El objetivo de la partida', MAX_TEXT_LENGTH),
  duration: durationSchema,
  centerImage: optionalText(MAX_IMAGE_LENGTH, 'La imagen central'),
  cat1Name: requiredText('El nombre de la categoría 1', 80),
  cat2Name: requiredText('El nombre de la categoría 2', 80),
  cat3Name: requiredText('El nombre de la categoría 3', 80),
  hasMotifs: z.boolean().optional(),
});

export const createSkinConfigSchema = skinBaseSchema
  .merge(fullConfigCollections)
  .superRefine((value, context) => {
    validateCollectionUniqueness(value.subjects, 'subjects', context);
    validateCollectionUniqueness(value.objects, 'objects', context);
    validateCollectionUniqueness(value.spaces, 'spaces', context);
    validateMotifRules(value, context);
  });

export const updateSkinConfigSchema = skinBaseSchema
  .partial()
  .merge(partialConfigCollections)
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debes indicar al menos un campo a actualizar.',
      });
      return;
    }

    const includesCollections =
      value.subjects !== undefined || value.objects !== undefined || value.spaces !== undefined;

    if (includesCollections) {
      if (value.subjects === undefined || value.objects === undefined || value.spaces === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Debes enviar sujetos, objetos y espacios cuando actualices las ternas.',
        });
        return;
      }

      validateCollectionUniqueness(value.subjects, 'subjects', context);
      validateCollectionUniqueness(value.objects, 'objects', context);
      validateCollectionUniqueness(value.spaces, 'spaces', context);
      validateMotifRules(
        {
          hasMotifs: value.hasMotifs,
          subjects: value.subjects,
          objects: value.objects,
          spaces: value.spaces,
        },
        context
      );
    }
  });

export const updateSkinDescriptionsSchema = partialConfigCollections.superRefine((value, context) => {
  if (value.subjects === undefined && value.objects === undefined && value.spaces === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Debes indicar al menos una colección de descripciones a actualizar.',
    });
    return;
  }

  if (value.subjects) {
    validateCollectionUniqueness(value.subjects, 'subjects', context);
  }

  if (value.objects) {
    validateCollectionUniqueness(value.objects, 'objects', context);
  }

  if (value.spaces) {
    validateCollectionUniqueness(value.spaces, 'spaces', context);
  }

  validateMotifRules(value, context);
});

export const skinParamsSchema = z.object({
  id: uuidSchema,
});

export type ConfigCollectionKey = 'subjects' | 'objects' | 'spaces';

function getCollectionLabel(key: ConfigCollectionKey) {
  switch (key) {
    case 'subjects':
      return 'sujetos';
    case 'objects':
      return 'objetos';
    case 'spaces':
      return 'espacios';
  }
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase('es');
}

function addIssueForCollection(
  context: z.RefinementCtx,
  collection: ConfigCollectionKey,
  index: number,
  field: keyof ConfigItemInput,
  message: string
) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [collection, index, field],
    message,
  });
}

function validateCollectionUniqueness(
  items: ConfigItemInput[],
  collection: ConfigCollectionKey,
  context: z.RefinementCtx
) {
  const ids = new Map<string, number>();
  const names = new Map<string, number>();

  items.forEach((item, index) => {
    if (item.id) {
      const previousIndex = ids.get(item.id);
      if (previousIndex !== undefined) {
        addIssueForCollection(
          context,
          collection,
          index,
          'id',
          `No se puede repetir el identificador del elemento en ${getCollectionLabel(collection)}.`
        );
      } else {
        ids.set(item.id, index);
      }
    }

    const normalized = normalizeName(item.name);
    const previousNameIndex = names.get(normalized);
    if (previousNameIndex !== undefined) {
      addIssueForCollection(
        context,
        collection,
        index,
        'name',
        `No se puede repetir el nombre del elemento en ${getCollectionLabel(collection)}.`
      );
    } else {
      names.set(normalized, index);
    }
  });
}

function validateMotifRules(
  value: MotifValidationInput,
  context: z.RefinementCtx
) {
  value.subjects?.forEach((item, index) => {
    if (item.motif) {
      addIssueForCollection(context, 'subjects', index, 'motif', 'Los sujetos no pueden tener motivos asociados.');
    }
  });

  value.objects?.forEach((item, index) => {
    if (item.motif) {
      addIssueForCollection(context, 'objects', index, 'motif', 'Los objetos no pueden tener motivos asociados.');
    }
  });

  if (value.hasMotifs) {
    value.spaces?.forEach((item, index) => {
      if (!item.motif) {
        addIssueForCollection(
          context,
          'spaces',
          index,
          'motif',
          'Debes indicar un motivo para cada espacio cuando la configuración tiene motivos habilitados.'
        );
      }
    });
  }

  const seenMotifs = new Map<string, number>();
  value.spaces?.forEach((item, index) => {
    if (!item.motif) return;
    const normalized = item.motif.trim().toLocaleLowerCase('es');
    const previousIndex = seenMotifs.get(normalized);
    if (previousIndex !== undefined) {
      addIssueForCollection(
        context,
        'spaces',
        index,
        'motif',
        'No se pueden repetir los motivos de los espacios dentro de la misma skin.'
      );
    } else {
      seenMotifs.set(normalized, index);
    }
  });
}

export type ConfigItemInput = z.infer<typeof configItemSchema>;
export type CreateSkinConfigInput = z.infer<typeof createSkinConfigSchema>;
export type UpdateSkinConfigInput = z.infer<typeof updateSkinConfigSchema>;
export type UpdateSkinDescriptionsInput = z.infer<typeof updateSkinDescriptionsSchema>;