import { isAxiosError } from 'axios';
import api from './api';
import type { GameConfig } from './skinApi';

export type SessionStatus = 'LOBBY' | 'REPARTO' | 'EN_CURSO' | 'PAUSADA' | 'FINALIZADA';
export type TeamColor = 'ROJO' | 'AZUL' | 'VERDE' | 'AMARILLO' | 'MORADO' | 'BLANCO';

export interface LobbyTeam {
  id: string;
  name: string;
  color: TeamColor;
  positionX: number;
  positionY: number;
  falseAccusation: boolean;
}

export type TeamElementKind = 'SUJETO' | 'OBJETO' | 'ESPACIO';

export interface TeamHandCard {
  id: string;
  kind: TeamElementKind;
  name: string;
  desc: string;
  imageUrl?: string;
  motif?: string;
}

export interface LobbySession {
  id: string;
  accessCode: string;
  status: SessionStatus;
  startedAt: string | null;
  durationSeconds: number;
  remainingSeconds: number;
  skin: GameConfig;
  teams: LobbyTeam[];
}

export interface JoinedLobbySession {
  session: LobbySession;
  team: LobbyTeam;
}

export interface TeamTerminalState {
  session: LobbySession;
  team: LobbyTeam;
  hand: TeamHandCard[];
}

interface SessionResponse {
  item: LobbySession;
}

interface JoinSessionResponse {
  item: JoinedLobbySession;
}

interface TeamTerminalStateResponse {
  item: TeamTerminalState;
}

interface SessionErrorResponse {
  error?: string;
  details?: string[];
}

export async function createGameSession(skinId: string) {
  const response = await api.post<SessionResponse>('/game/sessions', { skinId });
  return response.data.item;
}

export async function getGameSession(accessCode: string) {
  const response = await api.get<SessionResponse>(`/game/sessions/${accessCode}`);
  return response.data.item;
}

export async function joinGameSession(accessCode: string, color: TeamColor) {
  const response = await api.post<JoinSessionResponse>(`/game/sessions/${accessCode}/join`, { color });
  return response.data.item;
}

export async function startGameSession(accessCode: string) {
  const response = await api.post<SessionResponse>(`/game/sessions/${accessCode}/start`);
  return response.data.item;
}

export async function getTeamTerminalState(accessCode: string, teamId: string) {
  const response = await api.get<TeamTerminalStateResponse>(`/game/sessions/${accessCode}/teams/${teamId}/state`);
  return response.data.item;
}

export function getSessionErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError<SessionErrorResponse>(error)) {
    const apiError = error.response?.data;

    if (apiError?.details && apiError.details.length > 0) {
      return apiError.details.join(' ');
    }

    if (apiError?.error) {
      return apiError.error;
    }
  }

  return fallback;
}