import { z } from 'zod';

export const hostLobbySubscriptionSchema = z.object({
  sessionId: z.string().uuid('La sesión indicada no es válida.'),
});

export const teamLobbySubscriptionSchema = z.object({
  sessionId: z.string().uuid('La sesión indicada no es válida.'),
  teamId: z.string().uuid('El equipo indicado no es válido.'),
});

export const startGameCommandSchema = z.object({
  accessCode: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.string().regex(/^[A-Z0-9]{6}$/, 'El código de acceso debe tener 6 caracteres alfanuméricos.')
  ),
});

export const gameStatusCommandSchema = z.object({
  sessionId: z.string().uuid('La sesión indicada no es válida.'),
});

export const gameTriggerResolutionCommandSchema = z.object({
  sessionId: z.string().uuid('La sesión indicada no es válida.'),
  mode: z.enum(['DIRECT_REVEAL', 'FINAL_CHANCE'], 'El modo de resolución indicado no es válido.'),
});

export const teamSecretPassageCommandSchema = z.object({
  fromNodeId: z.string().trim().min(1, 'La sala origen del pasadizo es obligatoria.'),
  toNodeId: z.string().trim().min(1, 'La sala destino del pasadizo es obligatoria.'),
});

export const gameSuggestCommandSchema = z.object({
  subjectElementId: z.string().uuid('El sujeto de la sugerencia no es válido.'),
  objectElementId: z.string().uuid('El objeto de la sugerencia no es válido.'),
  spaceElementId: z.string().uuid('La sala de la sugerencia no es válida.'),
});

export const gameRefuteCommandSchema = z.object({
  shownElementId: z.string().uuid('La carta mostrada para refutar no es válida.'),
});

export const gameFinalChanceAccusationCommandSchema = z.object({
  subjectElementId: z.string().uuid('El sujeto de la acusación final no es válido.'),
  objectElementId: z.string().uuid('El objeto de la acusación final no es válido.'),
  spaceElementId: z.string().uuid('La sala de la acusación final no es válida.'),
});

export type HostLobbySubscriptionInput = z.infer<typeof hostLobbySubscriptionSchema>;
export type TeamLobbySubscriptionInput = z.infer<typeof teamLobbySubscriptionSchema>;
export type StartGameCommandInput = z.infer<typeof startGameCommandSchema>;
export type GameStatusCommandInput = z.infer<typeof gameStatusCommandSchema>;
export type GameTriggerResolutionCommandInput = z.infer<typeof gameTriggerResolutionCommandSchema>;
export type TeamSecretPassageCommandInput = z.infer<typeof teamSecretPassageCommandSchema>;
export type GameSuggestCommandInput = z.infer<typeof gameSuggestCommandSchema>;
export type GameRefuteCommandInput = z.infer<typeof gameRefuteCommandSchema>;
export type GameFinalChanceAccusationCommandInput = z.infer<typeof gameFinalChanceAccusationCommandSchema>;

export const matrixCellUpdateSchema = z.object({
  key: z.string().min(1).max(300),
  state: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

export const matrixAnnotationUpdateSchema = z.object({
  content: z.string().max(8000),
});

export type MatrixCellUpdateInput = z.infer<typeof matrixCellUpdateSchema>;
export type MatrixAnnotationUpdateInput = z.infer<typeof matrixAnnotationUpdateSchema>;