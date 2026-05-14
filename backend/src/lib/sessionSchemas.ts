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

export const teamSessionStateParamsSchema = z.object({
  accessCode: accessCodeSchema,
  teamId: z.string().uuid('El identificador del equipo debe ser un UUID válido.'),
});

export const moveTeamSchema = z.object({
  targetNodeId: z.string().trim().min(1, 'El destino del movimiento es obligatorio.'),
});

export const finalAccusationSchema = z.object({
  subjectElementId: z.string().uuid('El sujeto de la acusación debe ser un UUID válido.'),
  objectElementId: z.string().uuid('El objeto de la acusación debe ser un UUID válido.'),
  spaceElementId: z.string().uuid('El espacio de la acusación debe ser un UUID válido.'),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type JoinSessionInput = z.infer<typeof joinSessionSchema>;
export type MoveTeamInput = z.infer<typeof moveTeamSchema>;
export type FinalAccusationInput = z.infer<typeof finalAccusationSchema>;