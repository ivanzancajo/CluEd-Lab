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

export const teamSecretPassageCommandSchema = z.object({
  fromNodeId: z.string().trim().min(1, 'La sala origen del pasadizo es obligatoria.'),
  toNodeId: z.string().trim().min(1, 'La sala destino del pasadizo es obligatoria.'),
});

export const gameSuggestCommandSchema = z.object({
  subjectElementId: z.string().uuid('El sospechoso sugerido debe ser un UUID válido.'),
  objectElementId: z.string().uuid('El arma sugerida debe ser un UUID válido.'),
  spaceElementId: z.string().uuid('La habitación sugerida debe ser un UUID válido.'),
});

export const gameRefuteCommandSchema = z.object({
  shownElementId: z.string().uuid('La carta mostrada debe ser un UUID válido.'),
});

export type HostLobbySubscriptionInput = z.infer<typeof hostLobbySubscriptionSchema>;
export type TeamLobbySubscriptionInput = z.infer<typeof teamLobbySubscriptionSchema>;
export type StartGameCommandInput = z.infer<typeof startGameCommandSchema>;
export type GameStatusCommandInput = z.infer<typeof gameStatusCommandSchema>;
export type TeamSecretPassageCommandInput = z.infer<typeof teamSecretPassageCommandSchema>;
export type GameSuggestCommandInput = z.infer<typeof gameSuggestCommandSchema>;
export type GameRefuteCommandInput = z.infer<typeof gameRefuteCommandSchema>;