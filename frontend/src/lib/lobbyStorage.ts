import type { JoinedLobbySession, LobbySession, SessionStatus, TeamColor } from './sessionApi';

export type StoredJoinedLobbyContext = {
  sessionId: string;
  accessCode: string;
  teamId: string;
  teamColor: TeamColor;
  teamName: string;
};

const SESSION_ID_KEY = 'sessionId';
const SESSION_CODE_KEY = 'sessionCode';
const SESSION_STATUS_KEY = 'sessionStatus';
const SESSION_STARTED_AT_KEY = 'sessionStartedAt';
const SESSION_DURATION_SECONDS_KEY = 'sessionDurationSeconds';
const TEAM_ID_KEY = 'teamId';
const TEAM_COLOR_KEY = 'teamColor';
const TEAM_NAME_KEY = 'teamName';
const ACTIVE_CONFIG_KEY = 'activeConfig';
const DURATION_KEY = 'duration';
const GAME_TITLE_KEY = 'gameTitle';
const CENTER_IMAGE_KEY = 'centerImage';

export function storeHostLobbySession(session: LobbySession) {
  clearStoredTeamContext();
  storeSessionSnapshot(session);
}

export function storeJoinedLobbySession(joinedSession: JoinedLobbySession) {
  storeSessionSnapshot(joinedSession.session);
  setStoredValue(TEAM_ID_KEY, joinedSession.team.id);
  setStoredValue(TEAM_COLOR_KEY, joinedSession.team.color);
  setStoredValue(TEAM_NAME_KEY, joinedSession.team.name);
}

export function clearStoredTeamContext() {
  removeStoredValue(TEAM_ID_KEY);
  removeStoredValue(TEAM_COLOR_KEY);
  removeStoredValue(TEAM_NAME_KEY);
}

export function getStoredSessionId() {
  return getStoredValue(SESSION_ID_KEY);
}

export function getStoredSessionCode() {
  return getStoredValue(SESSION_CODE_KEY);
}

export function getStoredSessionStatus(): SessionStatus | null {
  const value = getStoredValue(SESSION_STATUS_KEY);
  return value as SessionStatus | null;
}

export function getStoredSessionStartedAt() {
  return getStoredValue(SESSION_STARTED_AT_KEY);
}

export function getStoredSessionDurationSeconds() {
  const value = getStoredValue(SESSION_DURATION_SECONDS_KEY);
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getStoredTeamId() {
  return getStoredValue(TEAM_ID_KEY);
}

export function getStoredTeamName() {
  return getStoredValue(TEAM_NAME_KEY);
}

export function getStoredTeamColor(): TeamColor | null {
  const value = getStoredValue(TEAM_COLOR_KEY);
  return value as TeamColor | null;
}

export function getStoredJoinedLobbyContext(): StoredJoinedLobbyContext | null {
  const sessionId = getStoredSessionId();
  const accessCode = getStoredSessionCode();
  const teamId = getStoredTeamId();
  const teamColor = getStoredTeamColor();
  const teamName = getStoredTeamName();

  if (!sessionId || !accessCode || !teamId || !teamColor || !teamName) {
    return null;
  }

  return {
    sessionId,
    accessCode,
    teamId,
    teamColor,
    teamName,
  };
}

function storeSessionSnapshot(session: LobbySession) {
  setStoredValue(SESSION_ID_KEY, session.id);
  setStoredValue(SESSION_CODE_KEY, session.accessCode);
  setStoredValue(SESSION_STATUS_KEY, session.status);
  setStoredValue(DURATION_KEY, session.skin.duration);
  setStoredValue(SESSION_DURATION_SECONDS_KEY, String(session.durationSeconds));
  setStoredValue(GAME_TITLE_KEY, session.skin.gameTitle);
  setStoredValue(CENTER_IMAGE_KEY, session.skin.centerImage);
  setStoredValue(ACTIVE_CONFIG_KEY, JSON.stringify(session.skin));

  if (session.startedAt) {
    setStoredValue(SESSION_STARTED_AT_KEY, session.startedAt);
  } else {
    removeStoredValue(SESSION_STARTED_AT_KEY);
  }
}

function getStoredValue(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(key);
}

function setStoredValue(key: string, value: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
}

function removeStoredValue(key: string) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(key);
  }
}