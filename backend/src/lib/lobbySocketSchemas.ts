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

export type HostLobbySubscriptionInput = z.infer<typeof hostLobbySubscriptionSchema>;
export type TeamLobbySubscriptionInput = z.infer<typeof teamLobbySubscriptionSchema>;
export type StartGameCommandInput = z.infer<typeof startGameCommandSchema>;