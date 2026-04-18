import { ColorEquipo } from '@prisma/client';
import { z } from 'zod';

const accessCodeSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z.string().regex(/^[A-Z0-9]{6}$/, 'El código de acceso debe tener 6 caracteres alfanuméricos.')
);

export const createSessionSchema = z.object({
  skinId: z.string().uuid('La configuración seleccionada debe ser un UUID válido.'),
});

export const joinSessionSchema = z.object({
  color: z.nativeEnum(ColorEquipo),
});

export const sessionAccessCodeParamsSchema = z.object({
  accessCode: accessCodeSchema,
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type JoinSessionInput = z.infer<typeof joinSessionSchema>;