import type { LobbyPresenceTeam } from './lobbySocket';

export type TeamMonitoringStatus = 'connected' | 'inactive' | 'disconnected';

export const TEAM_HEARTBEAT_INTERVAL_MS = 10_000;
export const TEAM_INACTIVE_AFTER_MS = 15_000;
export const TEAM_DISCONNECTED_AFTER_MS = 30_000;

export function getTeamMonitoringStatus(
  team: Pick<LobbyPresenceTeam, 'connected' | 'lastSeenAt'>,
  now = Date.now()
): TeamMonitoringStatus {
  if (!team.connected) {
    return 'disconnected';
  }

  if (team.lastSeenAt === null) {
    return 'inactive';
  }

  const elapsedMs = Math.max(0, now - team.lastSeenAt);

  if (elapsedMs >= TEAM_DISCONNECTED_AFTER_MS) {
    return 'disconnected';
  }

  if (elapsedMs >= TEAM_INACTIVE_AFTER_MS) {
    return 'inactive';
  }

  return 'connected';
}

export function getTeamLastSeenSeconds(lastSeenAt: number | null, now = Date.now()) {
  if (lastSeenAt === null) {
    return null;
  }

  return Math.max(0, Math.floor((now - lastSeenAt) / 1000));
}

export function getTeamMonitoringLabel(
  team: Pick<LobbyPresenceTeam, 'connected' | 'lastSeenAt'>,
  now = Date.now()
) {
  const status = getTeamMonitoringStatus(team, now);
  const lastSeenSeconds = getTeamLastSeenSeconds(team.lastSeenAt, now);

  if (status === 'connected') {
    if (lastSeenSeconds === null || lastSeenSeconds <= 1) {
      return 'Senal al instante';
    }

    return `Senal hace ${lastSeenSeconds}s`;
  }

  if (status === 'inactive') {
    if (lastSeenSeconds === null) {
      return 'Pendiente de actividad';
    }

    return `Inactivo hace ${lastSeenSeconds}s`;
  }

  if (lastSeenSeconds === null) {
    return 'Terminal desconectado';
  }

  return `Ultima senal hace ${lastSeenSeconds}s`;
}