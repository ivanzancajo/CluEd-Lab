type TeamPresenceBucket = Map<string, Set<string>>;

class LobbyPresenceStore {
  private readonly sessions = new Map<string, TeamPresenceBucket>();

  connectTeam(sessionId: string, teamId: string, socketId: string) {
    const teamBucket = this.getOrCreateSession(sessionId);
    const socketIds = teamBucket.get(teamId) ?? new Set<string>();
    socketIds.add(socketId);
    teamBucket.set(teamId, socketIds);
  }

  disconnectTeam(sessionId: string, teamId: string, socketId: string) {
    const teamBucket = this.sessions.get(sessionId);
    if (!teamBucket) {
      return;
    }

    const socketIds = teamBucket.get(teamId);
    if (!socketIds) {
      return;
    }

    socketIds.delete(socketId);

    if (socketIds.size === 0) {
      teamBucket.delete(teamId);
    }

    if (teamBucket.size === 0) {
      this.sessions.delete(sessionId);
    }
  }

  isTeamConnected(sessionId: string, teamId: string) {
    return (this.sessions.get(sessionId)?.get(teamId)?.size ?? 0) > 0;
  }

  getConnectedTeamIds(sessionId: string) {
    return Array.from(this.sessions.get(sessionId)?.keys() ?? []);
  }

  private getOrCreateSession(sessionId: string) {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const next = new Map<string, Set<string>>();
    this.sessions.set(sessionId, next);
    return next;
  }
}

export const lobbyPresenceStore = new LobbyPresenceStore();