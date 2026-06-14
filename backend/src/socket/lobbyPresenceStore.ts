type TeamPresenceEntry = {
  socketIds: Set<string>;
  lastSeenAt: number | null;
};

type TeamPresenceBucket = Map<string, TeamPresenceEntry>;

const PRESENCE_RETENTION_MS = 12 * 60 * 60 * 1000;

class LobbyPresenceStore {
  private readonly sessions = new Map<string, TeamPresenceBucket>();

  connectTeam(sessionId: string, teamId: string, socketId: string) {
    const teamEntry = this.getOrCreateTeam(sessionId, teamId);
    teamEntry.socketIds.add(socketId);
    teamEntry.lastSeenAt = Date.now();
    this.pruneSession(sessionId);
  }

  disconnectTeam(sessionId: string, teamId: string, socketId: string) {
    const teamBucket = this.sessions.get(sessionId);
    if (!teamBucket) {
      return;
    }

    const teamEntry = teamBucket.get(teamId);
    if (!teamEntry) {
      return;
    }

    teamEntry.socketIds.delete(socketId);
    teamBucket.set(teamId, teamEntry);

    this.pruneSession(sessionId);
  }

  touchTeam(sessionId: string, teamId: string) {
    const teamEntry = this.getOrCreateTeam(sessionId, teamId);
    teamEntry.lastSeenAt = Date.now();
    this.pruneSession(sessionId);
  }

  getTeamLastSeen(sessionId: string, teamId: string) {
    return this.sessions.get(sessionId)?.get(teamId)?.lastSeenAt ?? null;
  }

  isTeamConnected(sessionId: string, teamId: string) {
    return (this.sessions.get(sessionId)?.get(teamId)?.socketIds.size ?? 0) > 0;
  }

  getConnectedTeamIds(sessionId: string) {
    const teamBucket = this.sessions.get(sessionId);
    if (!teamBucket) {
      return [];
    }

    return Array.from(teamBucket.entries())
      .filter(([, teamEntry]) => teamEntry.socketIds.size > 0)
      .map(([teamId]) => teamId);
  }

  clearSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  private getOrCreateSession(sessionId: string) {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const next = new Map<string, TeamPresenceEntry>();
    this.sessions.set(sessionId, next);
    return next;
  }

  private getOrCreateTeam(sessionId: string, teamId: string) {
    const teamBucket = this.getOrCreateSession(sessionId);
    const existing = teamBucket.get(teamId);

    if (existing) {
      return existing;
    }

    const next: TeamPresenceEntry = {
      socketIds: new Set<string>(),
      lastSeenAt: null,
    };

    teamBucket.set(teamId, next);
    return next;
  }

  private pruneSession(sessionId: string) {
    const teamBucket = this.sessions.get(sessionId);
    if (!teamBucket) {
      return;
    }

    const cutoff = Date.now() - PRESENCE_RETENTION_MS;

    for (const [teamId, teamEntry] of teamBucket.entries()) {
      const keepEntry = teamEntry.socketIds.size > 0 || (teamEntry.lastSeenAt !== null && teamEntry.lastSeenAt >= cutoff);

      if (!keepEntry) {
        teamBucket.delete(teamId);
      }
    }

    if (teamBucket.size === 0) {
      this.sessions.delete(sessionId);
    }
  }
}

export const lobbyPresenceStore = new LobbyPresenceStore();