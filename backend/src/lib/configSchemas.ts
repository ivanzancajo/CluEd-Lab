import { z } from 'zod';

const MAX_IMAGE_LENGTH = 5_000_000;
const MAX_TEXT_LENGTH = 4_000;

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

export const configItemSchema = z.object({
  id: uuidSchema,
  name: requiredText('El nombre del elemento', 120),
  desc: requiredText('La descripción del elemento', MAX_TEXT_LENGTH),
  imageUrl: optionalText(MAX_IMAGE_LENGTH, 'La imagen del elemento'),
  motif: optionalText(2_000, 'El motivo del elemento'),
});

const configCollections = z.object({
  subjects: z.array(configItemSchema).optional(),
  objects: z.array(configItemSchema).optional(),
  spaces: z.array(configItemSchema).optional(),
});

const skinBaseSchema = z.object({
  name: requiredText('El nombre de la configuración', 120),
  gameTitle: requiredText('El título público de la partida', 120),
  objective: requiredText('El objetivo de la partida', MAX_TEXT_LENGTH),
  duration: durationSchema,
  centerImage: optionalText(MAX_IMAGE_LENGTH, 'La imagen central'),
  cat1Name: requiredText('El nombre de la categoría 1', 80),
  cat2Name: requiredText('El nombre de la categoría 2', 80),
  cat3Name: requiredText('El nombre de la categoría 3', 80),
  hasMotifs: z.boolean().optional(),
});

export const createSkinConfigSchema = skinBaseSchema.merge(configCollections);

export const updateSkinConfigSchema = skinBaseSchema
  .partial()
  .merge(configCollections)
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debes indicar al menos un campo a actualizar.',
  });

export const updateSkinDescriptionsSchema = configCollections.refine(
  (value) => value.subjects !== undefined || value.objects !== undefined || value.spaces !== undefined,
  { message: 'Debes indicar al menos una colección de descripciones a actualizar.' }
);

export const skinParamsSchema = z.object({
  id: uuidSchema,
});

export type ConfigCollectionKey = 'subjects' | 'objects' | 'spaces';
export type ConfigItemInput = z.infer<typeof configItemSchema>;
export type CreateSkinConfigInput = z.infer<typeof createSkinConfigSchema>;
export type UpdateSkinConfigInput = z.infer<typeof updateSkinConfigSchema>;
export type UpdateSkinDescriptionsInput = z.infer<typeof updateSkinDescriptionsSchema>;