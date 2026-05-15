import { isAxiosError } from 'axios';
import api from './api';
import type { GameConfig } from './skinApi';

export type SessionStatus = 'LOBBY' | 'REPARTO' | 'EN_CURSO' | 'PAUSADA' | 'FINALIZADA';
export type TeamColor = 'ROJO' | 'AZUL' | 'VERDE' | 'AMARILLO' | 'MORADO' | 'BLANCO';
export type TeamEliminationReason = 'ACUSACION_FALSA';
export type GameResolutionMode = 'DIRECT_REVEAL' | 'FINAL_CHANCE';
export type GameResolutionPhase = 'ESPERANDO_RESOLUCION' | 'MOSTRANDO_SOLUCION';

export interface SessionWinner {
  id: string;
  name: string;
  color: TeamColor;
}

export interface ResolutionCard {
  id: string;
  name: string;
}

export interface SessionResolutionState {
  phase: GameResolutionPhase;
  mode: GameResolutionMode;
  startedAt: string;
  deadlineAt: string | null;
  eligibleTeamIds: string[];
  submittedTeamIds: string[];
  solution: {
    subject: ResolutionCard;
    object: ResolutionCard;
    space: ResolutionCard;
  } | null;
  winningTeams: SessionWinner[];
}

export interface LobbyTeam {
  id: string;
  name: string;
  color: TeamColor;
  positionX: number;
  positionY: number;
  falseAccusation: boolean;
  eliminatedAt: string | null;
  eliminationReason: TeamEliminationReason | null;
}

export interface TeamMoveNode {
  id: string;
  label: string;
  positionX: number;
  positionY: number;
  kind: 'spawn' | 'square' | 'room';
  gridPosition?: {
    col: number;
    row: number;
  };
  stepsRequired?: number;
}

export interface SessionTurnDice {
  valueOne: number;
  valueTwo: number;
  total: number;
}

export interface SessionTurn {
  currentTeamId: string;
  currentTeamName: string;
  currentTeamColor: TeamColor;
  startedAt: string | null;
  dice: SessionTurnDice | null;
  remainingMoves: number | null;
}

export interface TeamMoveState {
  diceRoll: number | null;
  remainingMoves: number | null;
  currentNode: TeamMoveNode;
  destinationNodes: TeamMoveNode[];
}

export interface TeamRollResult {
  dice: SessionTurnDice;
  diceRoll: number;
  remainingMoves: number | null;
  currentNode: TeamMoveNode;
  destinationNodes: TeamMoveNode[];
  turnAdvanced: boolean;
  session: LobbySession;
}

export interface TeamMoveResult {
  dice: SessionTurnDice;
  diceRoll: number;
  remainingMoves: number | null;
  currentNode: TeamMoveNode;
  destinationNodes: TeamMoveNode[];
  turnAdvanced: boolean;
  session: LobbySession;
}

export type TeamElementKind = 'SUJETO' | 'OBJETO' | 'ESPACIO';

export interface SuggestionElement {
  id: string;
  kind: TeamElementKind;
  name: string;
  desc: string;
  imageUrl?: string;
  motif?: string;
}

export interface SuggestionSummary {
  eventId: string;
  emitterTeamId: string;
  emitterTeamName: string;
  emitterTeamColor: TeamColor;
  receiverTeamId: string | null;
  receiverTeamName: string | null;
  receiverTeamColor: TeamColor | null;
  occurredAt: string;
  subject: SuggestionElement;
  object: SuggestionElement;
  space: SuggestionElement;
}

export type TeamPendingSuggestionState =
  | {
      type: 'AWAITING_REFUTATION';
      suggestion: SuggestionSummary;
    }
  | {
      type: 'REFUTE_REQUEST';
      suggestion: SuggestionSummary;
      matchingCards: SuggestionElement[];
    };

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
  finishedAt: string | null;
  durationSeconds: number;
  remainingSeconds: number;
  skin: GameConfig;
  teams: LobbyTeam[];
  turn: SessionTurn | null;
  activeSuggestion: SuggestionSummary | null;
  winnerTeam: SessionWinner | null;
  resolution: SessionResolutionState | null;
}

export interface JoinedLobbySession {
  session: LobbySession;
  team: LobbyTeam;
}

export interface TeamTerminalState {
  session: LobbySession;
  team: LobbyTeam;
  hand: TeamHandCard[];
  pendingSuggestion: TeamPendingSuggestionState | null;
}

export interface FinalAccusationVerdict {
  eventId: string;
  occurredAt: string;
  accuserTeamId: string;
  accuserTeamName: string;
  accuserTeamColor: TeamColor;
  accusation: {
    subject: { id: string; name: string };
    object: { id: string; name: string };
    space: { id: string; name: string };
  };
  outcome: 'CORRECTA' | 'INCORRECTA';
  sessionFinished: boolean;
  winnerTeamId: string | null;
  eliminatedTeamId: string | null;
}

export interface FinalAccusationResult {
  session: LobbySession;
  verdict: FinalAccusationVerdict;
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

interface TeamMoveStateResponse {
  item: TeamMoveState;
}

interface TeamRollResponse {
  item: TeamRollResult;
}

interface MoveTeamResponse {
  item: TeamMoveResult;
}

interface TeamEndTurnResponse {
  item: {
    session: LobbySession;
  };
}

interface FinalAccusationResponse {
  item: FinalAccusationResult;
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

export async function getTeamMoveState(accessCode: string, teamId: string) {
  const response = await api.get<TeamMoveStateResponse>(`/game/sessions/${accessCode}/teams/${teamId}/moves`);
  return response.data.item;
}

export async function rollTeamDice(accessCode: string, teamId: string) {
  const response = await api.post<TeamRollResponse>(`/game/sessions/${accessCode}/teams/${teamId}/roll`);
  return response.data.item;
}

export async function moveTeam(accessCode: string, teamId: string, targetNodeId: string) {
  const response = await api.post<MoveTeamResponse>(`/game/sessions/${accessCode}/teams/${teamId}/move`, {
    targetNodeId,
  });
  return response.data.item;
}

export async function endTeamTurn(accessCode: string, teamId: string) {
  const response = await api.post<TeamEndTurnResponse>(`/game/sessions/${accessCode}/teams/${teamId}/end-turn`);
  return response.data.item;
}

export async function accuseFinalSession(
  accessCode: string,
  teamId: string,
  payload: {
    subjectElementId: string;
    objectElementId: string;
    spaceElementId: string;
  }
) {
  const response = await api.post<FinalAccusationResponse>(
    `/game/sessions/${accessCode}/teams/${teamId}/accuse`,
    payload
  );
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