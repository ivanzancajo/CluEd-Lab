import { randomInt } from 'node:crypto';
import { Prisma, type ColorEquipo } from '@prisma/client';
import { HttpError } from './http.js';
import { COLOR_SORT_ORDER } from './teamOrder.js';

export type SessionTurnManagedTeam = {
  id: string;
  name: string;
  color: ColorEquipo;
  falseAccusation?: boolean | null;
  eliminatedAt?: Date | null;
};

type SessionTurnManagedState = {
  currentTurnTeamId: string | null;
  activeDiceValueOne: number | null;
  activeDiceValueTwo: number | null;
  activeDiceRemainingMoves: number | null;
  teams: SessionTurnManagedTeam[];
};

export type SessionTurnDice = {
  valueOne: number;
  valueTwo: number;
  total: number;
};

export function sortTeamsByTurnOrder<T extends { color: ColorEquipo }>(teams: readonly T[]) {
  return [...teams].sort((left, right) => getTeamSortIndex(left.color) - getTeamSortIndex(right.color));
}

export function ensureCurrentTurnBelongsToTeam(
  session: Pick<SessionTurnManagedState, 'teams' | 'currentTurnTeamId'>,
  teamId: string
) {
  if (session.currentTurnTeamId === teamId) {
    return;
  }

  const currentTeam = getTeamById(session.teams, session.currentTurnTeamId);
  if (currentTeam) {
    throw new HttpError(409, `Ahora mismo es el turno de ${currentTeam.name}.`);
  }

  throw new HttpError(409, 'La partida no tiene un turno activo válido.');
}

export function ensureTurnHasNoActiveDice(
  session: Pick<SessionTurnManagedState, 'activeDiceValueOne' | 'activeDiceValueTwo'>
) {
  if (hasActiveDiceRoll(session)) {
    throw new HttpError(409, 'La tirada de este turno ya ha sido registrada.');
  }
}

export function hasActiveDiceRoll(
  session: Pick<SessionTurnManagedState, 'activeDiceValueOne' | 'activeDiceValueTwo'>
): session is { activeDiceValueOne: number; activeDiceValueTwo: number } {
  return typeof session.activeDiceValueOne === 'number' && typeof session.activeDiceValueTwo === 'number';
}

export function getActiveDice(session: Pick<SessionTurnManagedState, 'activeDiceValueOne' | 'activeDiceValueTwo'>) {
  if (!hasActiveDiceRoll(session)) {
    return null;
  }

  const { activeDiceValueOne, activeDiceValueTwo } = session;

  return createDiceSnapshot(activeDiceValueOne, activeDiceValueTwo);
}

export function getActiveDiceRemainingMoves(
  session: Pick<SessionTurnManagedState, 'activeDiceValueOne' | 'activeDiceValueTwo' | 'activeDiceRemainingMoves'>
) {
  const dice = getActiveDice(session);
  if (!dice) {
    return null;
  }

  if (
    typeof session.activeDiceRemainingMoves === 'number' &&
    Number.isInteger(session.activeDiceRemainingMoves) &&
    session.activeDiceRemainingMoves >= 0
  ) {
    return Math.min(session.activeDiceRemainingMoves, dice.total);
  }

  return dice.total;
}

export function getNextTurnTeam<T extends SessionTurnManagedTeam>(
  teams: readonly T[],
  currentTurnTeamId: string | null
) {
  const orderedTeams = sortTeamsByTurnOrder(teams);
  const activeTeams = orderedTeams.filter((team) => !isTeamEliminated(team));

  if (activeTeams.length === 0) {
    return null;
  }

  if (!currentTurnTeamId) {
    return activeTeams[0];
  }

  const currentTeamIndex = orderedTeams.findIndex((team) => team.id === currentTurnTeamId);
  if (currentTeamIndex === -1) {
    return activeTeams[0];
  }

  for (let offset = 1; offset <= orderedTeams.length; offset += 1) {
    const candidate = orderedTeams[(currentTeamIndex + offset) % orderedTeams.length];

    if (candidate && !isTeamEliminated(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function isTeamEliminated(team: Pick<SessionTurnManagedTeam, 'falseAccusation' | 'eliminatedAt'>) {
  return team.falseAccusation === true || team.eliminatedAt instanceof Date;
}

export function ensureTeamCanTakeTurn(team: Pick<SessionTurnManagedTeam, 'name' | 'falseAccusation' | 'eliminatedAt'>) {
  if (!isTeamEliminated(team)) {
    return;
  }

  throw new HttpError(409, `${team.name} ya ha quedado eliminado y no puede realizar acciones de turno.`);
}

export function buildNextTurnUpdate(
  session: Pick<SessionTurnManagedState, 'teams' | 'currentTurnTeamId'>,
  now = new Date()
): Prisma.PartidaUncheckedUpdateInput {
  const nextTeam = getNextTurnTeam(session.teams, session.currentTurnTeamId);

  return {
    currentTurnTeamId: nextTeam?.id ?? null,
    currentTurnStartedAt: nextTeam ? now : null,
    activeDiceValueOne: null,
    activeDiceValueTwo: null,
    activeDiceRemainingMoves: null,
  };
}

export function rollTurnDice(): SessionTurnDice {
  return createDiceSnapshot(randomInt(1, 7), randomInt(1, 7));
}

export function rollTurnDiceForced(total: number): SessionTurnDice {
  return createDiceSnapshot(Math.ceil(total / 2), Math.floor(total / 2));
}

function createDiceSnapshot(valueOne: number, valueTwo: number): SessionTurnDice {
  return {
    valueOne,
    valueTwo,
    total: valueOne + valueTwo,
  };
}

function getTeamById<T extends { id: string }>(teams: readonly T[], teamId: string | null) {
  if (!teamId) {
    return null;
  }

  return teams.find((team) => team.id === teamId) ?? null;
}

function getTeamSortIndex(color: ColorEquipo) {
  const colorIndex = COLOR_SORT_ORDER.indexOf(color);
  return colorIndex === -1 ? Number.MAX_SAFE_INTEGER : colorIndex;
}
