import { z } from 'zod';

export const hostLobbySubscriptionSchema = z.object({
  sessionId: z.string().uuid('La sesión indicada no es válida.'),
});

export const teamLobbySubscriptionSchema = z.object({
  sessionId: z.string().uuid('La sesión indicada no es válida.'),
  teamId: z.string().uuid('El equipo indicado no es válido.'),
});

export type HostLobbySubscriptionInput = z.infer<typeof hostLobbySubscriptionSchema>;
export type TeamLobbySubscriptionInput = z.infer<typeof teamLobbySubscriptionSchema>;