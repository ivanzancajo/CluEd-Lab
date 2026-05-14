import { EstadoPartida, TipoElemento, TipoEvento, type ColorEquipo, type Prisma } from '@prisma/client';
import { findBoardMovementNodeByPosition, getBoardRoomSpaceSlotIndex } from './boardGraph.js';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';
import { loadSkinConfiguration, type LoadedSkinConfiguration } from './skinConfigs.js';
import {
  buildNextTurnUpdate,
  ensureCurrentTurnBelongsToTeam,
  hasActiveDiceRoll,
  sortTeamsByTurnOrder,
} from './sessionTurn.js';

type SessionSuggestionBaseClient = Pick<typeof prisma, 'partida' | 'evento' | 'cluedoSkin'> &
  Partial<Pick<typeof prisma, 'elemento'>>;

type SessionSuggestionClient = SessionSuggestionBaseClient & Pick<typeof prisma, 'cartaEquipo'>;

type SuggestionManagedTeam = {
  id: string;
  name: string;
  color: ColorEquipo;
  positionX: number | null;
  positionY: number | null;
  falseAccusation?: boolean | null;
  eliminatedAt?: Date | null;
};

type SuggestionManagedSession = {
  id: string;
  accessCode: string;
  status: EstadoPartida;
  skinId: string | null;
  currentTurnTeamId: string | null;
  activeDiceValueOne: number | null;
  activeDiceValueTwo: number | null;
  activeDiceRemainingMoves: number | null;
  activeSuggestionEventId: string | null;
  teams: SuggestionManagedTeam[];
};

type SuggestionEventDetail = {
  version: 1;
  kind: 'SUGGESTION';
  subjectElementId: string;
  objectElementId: string;
  spaceElementId: string;
};

type RefutationEventDetail = {
  version: 1;
  kind: 'REFUTATION';
  suggestionEventId: string;
  shownElementId: string;
};

type SuggestionEventRecord = {
  id: string;
  detail: Prisma.JsonValue | null;
  occurredAt: Date | null;
  emitter: {
    id: string;
    name: string;
    color: ColorEquipo;
  } | null;
  receiver: {
    id: string;
    name: string;
    color: ColorEquipo;
  } | null;
  partida: {
    skinId: string | null;
  } | null;
};

export type SuggestionElementSnapshot = {
  id: string;
  kind: TipoElemento;
  name: string;
  desc: string;
  imageUrl?: string | undefined;
  motif?: string | undefined;
};

export type SuggestionSummary = {
  eventId: string;
  emitterTeamId: string;
  emitterTeamName: string;
  emitterTeamColor: ColorEquipo;
  receiverTeamId: string | null;
  receiverTeamName: string | null;
  receiverTeamColor: ColorEquipo | null;
  occurredAt: string;
  subject: SuggestionElementSnapshot;
  object: SuggestionElementSnapshot;
  space: SuggestionElementSnapshot;
};

export type TeamPendingSuggestionState =
  | {
      type: 'AWAITING_REFUTATION';
      suggestion: SuggestionSummary;
    }
  | {
      type: 'REFUTE_REQUEST';
      suggestion: SuggestionSummary;
      matchingCards: SuggestionElementSnapshot[];
    };

export type SuggestionCreationResult = {
  sessionId: string;
  suggestion: SuggestionSummary;
  matchingCards: SuggestionElementSnapshot[];
  refutationRequired: boolean;
  turnAdvanced: boolean;
  nextTurnTeamName: string | null;
};

export type SuggestionRefutationResult = {
  sessionId: string;
  suggestion: SuggestionSummary;
  shownCard: SuggestionElementSnapshot;
  refutingTeamId: string;
  refutingTeamName: string;
  refutingTeamColor: ColorEquipo;
  nextTurnTeamName: string | null;
};

export type TeamTurnEndResult = {
  sessionId: string;
  teamId: string;
  teamName: string;
  teamColor: ColorEquipo;
  currentRoomLabel: string;
  nextTurnTeamName: string | null;
};

export async function loadActiveSuggestionSummaryById(
  client: SessionSuggestionBaseClient,
  suggestionEventId: string
): Promise<SuggestionSummary> {
  const suggestionRecord = await loadSuggestionEventRecord(client, suggestionEventId);
  const skin = await loadSuggestionSkin(client, suggestionRecord.partida?.skinId ?? null);
  const suggestionCards = buildSuggestionCardLookup(skin);

  return buildSuggestionSummaryFromRecord(suggestionRecord, suggestionCards);
}

export async function createSuggestionBySessionId(
  client: SessionSuggestionClient,
  sessionId: string,
  teamId: string,
  input: {
    subjectElementId: string;
    objectElementId: string;
    spaceElementId: string;
  }
): Promise<SuggestionCreationResult> {
  const session = await loadSuggestionSession(client, { id: sessionId });
  const skin = await loadSuggestionSkin(client, session.skinId);
  const roomContext = resolveRoomSuggestionContext(session, skin, teamId, input.spaceElementId);
  const suggestionElementIds = [input.subjectElementId, input.objectElementId, input.spaceElementId];
  const suggestionCards = buildSuggestionCardLookup(skin);

  const subject = getSuggestionCardById(suggestionCards, input.subjectElementId, TipoElemento.SUJETO);
  const object = getSuggestionCardById(suggestionCards, input.objectElementId, TipoElemento.OBJETO);
  const space = getSuggestionCardById(suggestionCards, input.spaceElementId, TipoElemento.ESPACIO);

  const refutationCards = await client.cartaEquipo.findMany({
    where: {
      equipoId: {
        in: roomContext.refuterOrder.map((team) => team.id),
      },
      elementId: {
        in: suggestionElementIds,
      },
    },
    select: {
      equipoId: true,
      elementId: true,
    },
  });

  const matchingCardIdsByTeam = groupMatchingCardIdsByTeam(refutationCards);
  const refuter = roomContext.refuterOrder.find((candidate) => (matchingCardIdsByTeam.get(candidate.id)?.length ?? 0) > 0) ?? null;
  const suggestionEvent = await client.evento.create({
    data: {
      partidaId: session.id,
      emitterId: roomContext.currentTeam.id,
      receiverId: refuter?.id ?? null,
      eventType: TipoEvento.SUGERENCIA,
      detail: buildSuggestionEventDetail(input),
    },
    select: {
      id: true,
      occurredAt: true,
    },
  });

  const suggestion = buildSuggestionSummary(
    {
      id: suggestionEvent.id,
      occurredAt: suggestionEvent.occurredAt,
      emitter: roomContext.currentTeam,
      receiver: refuter,
    },
    {
      subject,
      object,
      space,
    }
  );

  if (!refuter) {
    const nextTurnUpdate = buildNextTurnUpdate(session);
    await client.partida.update({
      where: { id: session.id },
      data: {
        ...nextTurnUpdate,
        activeSuggestionEventId: null,
      },
    });

    return {
      sessionId: session.id,
      suggestion,
      matchingCards: [],
      refutationRequired: false,
      turnAdvanced: true,
      nextTurnTeamName: session.teams.find((team) => team.id === nextTurnUpdate.currentTurnTeamId)?.name ?? null,
    };
  }

  await client.partida.update({
    where: { id: session.id },
    data: {
      activeSuggestionEventId: suggestionEvent.id,
    },
  });

  return {
    sessionId: session.id,
    suggestion,
    matchingCards: buildCardsFromIds(suggestionCards, matchingCardIdsByTeam.get(refuter.id) ?? []),
    refutationRequired: true,
    turnAdvanced: false,
    nextTurnTeamName: null,
  };
}

export async function refuteActiveSuggestionBySessionId(
  client: SessionSuggestionClient,
  sessionId: string,
  teamId: string,
  shownElementId: string
): Promise<SuggestionRefutationResult> {
  const session = await loadSuggestionSession(client, { id: sessionId });

  if (!session.activeSuggestionEventId) {
    throw new HttpError(409, 'No hay ninguna sugerencia pendiente de refutación.');
  }

  const suggestionRecord = await loadSuggestionEventRecord(client, session.activeSuggestionEventId);
  const suggestionDetail = parseSuggestionEventDetail(suggestionRecord.detail);
  const skin = await loadSuggestionSkin(client, suggestionRecord.partida?.skinId ?? null);
  const suggestionCards = buildSuggestionCardLookup(skin);

  if (!suggestionRecord.receiver || suggestionRecord.receiver.id !== teamId) {
    throw new HttpError(409, 'Solo el equipo designado para refutar puede mostrar una carta.');
  }

  const allowedCardIds = new Set([
    suggestionDetail.subjectElementId,
    suggestionDetail.objectElementId,
    suggestionDetail.spaceElementId,
  ]);

  if (!allowedCardIds.has(shownElementId)) {
    throw new HttpError(409, 'La carta mostrada no forma parte de la sugerencia activa.');
  }

  const matchingCard = await client.cartaEquipo.findUnique({
    where: {
      equipoId_elementId: {
        equipoId: teamId,
        elementId: shownElementId,
      },
    },
    select: {
      equipoId: true,
      elementId: true,
    },
  });

  if (!matchingCard) {
    throw new HttpError(409, 'El equipo actual no puede mostrar la carta indicada para refutar la sugerencia.');
  }

  await client.evento.create({
    data: {
      partidaId: session.id,
      emitterId: teamId,
      receiverId: suggestionRecord.emitter?.id ?? null,
      eventType: TipoEvento.REFUTACION,
      detail: buildRefutationEventDetail(session.activeSuggestionEventId, shownElementId),
    },
  });

  const nextTurnUpdate = buildNextTurnUpdate(session);
  await client.partida.update({
    where: { id: session.id },
    data: {
      ...nextTurnUpdate,
      activeSuggestionEventId: null,
    },
  });

  const suggestion = buildSuggestionSummaryFromRecord(suggestionRecord, suggestionCards);
  const shownCard = getSuggestionCardById(suggestionCards, shownElementId);

  return {
    sessionId: session.id,
    suggestion,
    shownCard,
    refutingTeamId: suggestionRecord.receiver.id,
    refutingTeamName: suggestionRecord.receiver.name,
    refutingTeamColor: suggestionRecord.receiver.color,
    nextTurnTeamName: session.teams.find((team) => team.id === nextTurnUpdate.currentTurnTeamId)?.name ?? null,
  };
}

export async function endTeamTurnWithoutSuggestionByAccessCode(
  client: SessionSuggestionClient,
  accessCode: string,
  teamId: string
): Promise<TeamTurnEndResult> {
  const session = await loadSuggestionSession(client, { accessCode });
  const roomContext = resolveRoomTurnContext(session, teamId);
  const nextTurnUpdate = buildNextTurnUpdate(session);

  await client.partida.update({
    where: { id: session.id },
    data: {
      ...nextTurnUpdate,
      activeSuggestionEventId: null,
    },
  });

  return {
    sessionId: session.id,
    teamId: roomContext.currentTeam.id,
    teamName: roomContext.currentTeam.name,
    teamColor: roomContext.currentTeam.color,
    currentRoomLabel: roomContext.currentRoom.label,
    nextTurnTeamName: session.teams.find((team) => team.id === nextTurnUpdate.currentTurnTeamId)?.name ?? null,
  };
}

export async function loadPendingTeamSuggestionStateByAccessCode(
  client: SessionSuggestionClient,
  accessCode: string,
  teamId: string
): Promise<TeamPendingSuggestionState | null> {
  const session = await client.partida.findUnique({
    where: { accessCode },
    select: {
      id: true,
      activeSuggestionEventId: true,
    },
  });

  if (!session?.activeSuggestionEventId) {
    return null;
  }

  const suggestionRecord = await loadSuggestionEventRecord(client, session.activeSuggestionEventId);
  const skin = await loadSuggestionSkin(client, suggestionRecord.partida?.skinId ?? null);
  const suggestionCards = buildSuggestionCardLookup(skin);
  const suggestion = buildSuggestionSummaryFromRecord(suggestionRecord, suggestionCards);

  if (suggestion.emitterTeamId === teamId) {
    return {
      type: 'AWAITING_REFUTATION',
      suggestion,
    };
  }

  if (suggestion.receiverTeamId !== teamId) {
    return null;
  }

  const matchingCards = await client.cartaEquipo.findMany({
    where: {
      equipoId: teamId,
      elementId: {
        in: [suggestion.subject.id, suggestion.object.id, suggestion.space.id],
      },
    },
    select: {
      elementId: true,
    },
  });

  return {
    type: 'REFUTE_REQUEST',
    suggestion,
    matchingCards: buildCardsFromIds(
      suggestionCards,
      matchingCards.map((card) => card.elementId)
    ),
  };
}

function buildSuggestionEventDetail(input: {
  subjectElementId: string;
  objectElementId: string;
  spaceElementId: string;
}): SuggestionEventDetail {
  return {
    version: 1,
    kind: 'SUGGESTION',
    subjectElementId: input.subjectElementId,
    objectElementId: input.objectElementId,
    spaceElementId: input.spaceElementId,
  };
}

function buildRefutationEventDetail(suggestionEventId: string, shownElementId: string): RefutationEventDetail {
  return {
    version: 1,
    kind: 'REFUTATION',
    suggestionEventId,
    shownElementId,
  };
}

function buildSuggestionCardLookup(skin: LoadedSkinConfiguration) {
  return new Map<string, SuggestionElementSnapshot>([
    ...skin.subjects.map((item) => [item.id, toSuggestionElement(item, TipoElemento.SUJETO)] as const),
    ...skin.objects.map((item) => [item.id, toSuggestionElement(item, TipoElemento.OBJETO)] as const),
    ...skin.spaces.map((item) => [item.id, toSuggestionElement(item, TipoElemento.ESPACIO)] as const),
  ]);
}

function toSuggestionElement(
  item: {
    id: string;
    name: string;
    desc: string;
    imageUrl?: string | undefined;
    motif?: string | undefined;
  },
  kind: TipoElemento
): SuggestionElementSnapshot {
  return {
    id: item.id,
    kind,
    name: item.name,
    desc: item.desc,
    imageUrl: item.imageUrl,
    motif: item.motif,
  };
}

function getSuggestionCardById(
  cards: Map<string, SuggestionElementSnapshot>,
  elementId: string,
  expectedKind?: TipoElemento
) {
  const card = cards.get(elementId);

  if (!card || (expectedKind && card.kind !== expectedKind)) {
    throw new HttpError(400, 'La sugerencia contiene elementos que no pertenecen a la configuración activa de la partida.');
  }

  return card;
}

function buildCardsFromIds(cards: Map<string, SuggestionElementSnapshot>, elementIds: string[]) {
  return [...new Set(elementIds)]
    .map((elementId) => getSuggestionCardById(cards, elementId))
    .sort(sortSuggestionCards);
}

function sortSuggestionCards(left: SuggestionElementSnapshot, right: SuggestionElementSnapshot) {
  const kindOrder = [TipoElemento.SUJETO, TipoElemento.OBJETO, TipoElemento.ESPACIO];
  const kindDifference = kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind);

  if (kindDifference !== 0) {
    return kindDifference;
  }

  return left.name.localeCompare(right.name, 'es');
}

function groupMatchingCardIdsByTeam(cards: Array<{ equipoId: string; elementId: string }>) {
  return cards.reduce<Map<string, string[]>>((accumulator, card) => {
    const current = accumulator.get(card.equipoId) ?? [];
    current.push(card.elementId);
    accumulator.set(card.equipoId, current);
    return accumulator;
  }, new Map());
}

function buildSuggestionSummary(
  event: {
    id: string;
    occurredAt: Date | null;
    emitter: {
      id: string;
      name: string;
      color: ColorEquipo;
    };
    receiver: {
      id: string;
      name: string;
      color: ColorEquipo;
    } | null;
  },
  cards: {
    subject: SuggestionElementSnapshot;
    object: SuggestionElementSnapshot;
    space: SuggestionElementSnapshot;
  }
): SuggestionSummary {
  return {
    eventId: event.id,
    emitterTeamId: event.emitter.id,
    emitterTeamName: event.emitter.name,
    emitterTeamColor: event.emitter.color,
    receiverTeamId: event.receiver?.id ?? null,
    receiverTeamName: event.receiver?.name ?? null,
    receiverTeamColor: event.receiver?.color ?? null,
    occurredAt: event.occurredAt?.toISOString() ?? new Date().toISOString(),
    subject: cards.subject,
    object: cards.object,
    space: cards.space,
  };
}

function buildSuggestionSummaryFromRecord(
  suggestionRecord: SuggestionEventRecord,
  suggestionCards: Map<string, SuggestionElementSnapshot>
) {
  const detail = parseSuggestionEventDetail(suggestionRecord.detail);

  if (!suggestionRecord.emitter) {
    throw new HttpError(409, 'La sugerencia activa no tiene un emisor válido.');
  }

  return buildSuggestionSummary(
    {
      id: suggestionRecord.id,
      occurredAt: suggestionRecord.occurredAt,
      emitter: suggestionRecord.emitter,
      receiver: suggestionRecord.receiver,
    },
    {
      subject: getSuggestionCardById(suggestionCards, detail.subjectElementId, TipoElemento.SUJETO),
      object: getSuggestionCardById(suggestionCards, detail.objectElementId, TipoElemento.OBJETO),
      space: getSuggestionCardById(suggestionCards, detail.spaceElementId, TipoElemento.ESPACIO),
    }
  );
}

function resolveRoomTurnContext(session: SuggestionManagedSession, teamId: string) {
  ensureSessionCanUseRoomAction(session, teamId);

  const currentTeam = session.teams.find((team) => team.id === teamId);
  if (!currentTeam) {
    throw new HttpError(404, 'El equipo indicado no pertenece a la sesión seleccionada.');
  }

  const currentRoom = findBoardMovementNodeByPosition(currentTeam.positionX, currentTeam.positionY);

  if (!currentRoom || currentRoom.kind !== 'room') {
    throw new HttpError(409, 'Solo se puede sugerir o pasar turno desde el interior de una habitación.');
  }

  return {
    currentTeam,
    currentRoom,
    refuterOrder: sortTeamsByTurnOrder(session.teams).filter((team) => team.id !== teamId),
  };
}

function resolveRoomSuggestionContext(
  session: SuggestionManagedSession,
  skin: LoadedSkinConfiguration,
  teamId: string,
  suggestedSpaceElementId: string
) {
  const context = resolveRoomTurnContext(session, teamId);
  const roomSpaceSlotIndex = getBoardRoomSpaceSlotIndex(context.currentRoom.id);

  if (roomSpaceSlotIndex === null) {
    throw new HttpError(409, 'La sala actual no admite sugerencias válidas.');
  }

  const currentRoomSpaceCard = skin.spaces[roomSpaceSlotIndex];
  if (!currentRoomSpaceCard) {
    throw new HttpError(409, 'La configuración activa no contiene el espacio asociado a la sala actual.');
  }

  if (currentRoomSpaceCard.id !== suggestedSpaceElementId) {
    throw new HttpError(409, 'La sugerencia debe usar la habitación en la que se encuentra actualmente el equipo.');
  }

  return context;
}

function ensureSessionCanUseRoomAction(session: SuggestionManagedSession, teamId: string) {
  if (session.status !== EstadoPartida.EN_CURSO) {
    throw new HttpError(409, 'Solo se pueden realizar sugerencias cuando la partida está en curso.');
  }

  ensureCurrentTurnBelongsToTeam(session, teamId);

  if (session.activeSuggestionEventId) {
    throw new HttpError(409, 'Hay una sugerencia pendiente de refutación y la partida está temporalmente bloqueada.');
  }

  if (hasActiveDiceRoll(session)) {
    throw new HttpError(409, 'No se puede sugerir ni pasar turno mientras siga activa la tirada del turno.');
  }
}

async function loadSuggestionSession(
  client: SessionSuggestionClient,
  where: { id: string } | { accessCode: string }
): Promise<SuggestionManagedSession> {
  const session = await client.partida.findUnique({
    where,
    select: {
      id: true,
      accessCode: true,
      status: true,
      skinId: true,
      currentTurnTeamId: true,
      activeDiceValueOne: true,
      activeDiceValueTwo: true,
      activeDiceRemainingMoves: true,
      activeSuggestionEventId: true,
      teams: {
        select: {
          id: true,
          name: true,
          color: true,
          positionX: true,
          positionY: true,
          falseAccusation: true,
          eliminatedAt: true,
        },
      },
    },
  });

  if (!session) {
    throw new HttpError(404, 'La sesión solicitada no existe.');
  }

  return {
    id: session.id,
    accessCode: session.accessCode,
    status: session.status ?? EstadoPartida.LOBBY,
    skinId: session.skinId,
    currentTurnTeamId: session.currentTurnTeamId,
    activeDiceValueOne: session.activeDiceValueOne,
    activeDiceValueTwo: session.activeDiceValueTwo,
    activeDiceRemainingMoves: session.activeDiceRemainingMoves,
    activeSuggestionEventId: session.activeSuggestionEventId,
    teams: session.teams,
  };
}

async function loadSuggestionSkin(client: SessionSuggestionBaseClient, skinId: string | null) {
  if (!skinId) {
    throw new HttpError(409, 'La sesión no tiene una configuración válida asociada.');
  }

  return loadSkinConfiguration(client, skinId);
}

async function loadSuggestionEventRecord(
  client: SessionSuggestionBaseClient,
  suggestionEventId: string
): Promise<SuggestionEventRecord> {
  const suggestionEvent = await client.evento.findUnique({
    where: { id: suggestionEventId },
    select: {
      id: true,
      eventType: true,
      detail: true,
      occurredAt: true,
      emitter: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
      receiver: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
      partida: {
        select: {
          skinId: true,
        },
      },
    },
  });

  if (!suggestionEvent || suggestionEvent.eventType !== TipoEvento.SUGERENCIA) {
    throw new HttpError(409, 'La sugerencia activa ya no es válida.');
  }

  return suggestionEvent;
}

function parseSuggestionEventDetail(detail: Prisma.JsonValue | null): SuggestionEventDetail {
  const value = asJsonObject(detail);

  if (
    value.kind !== 'SUGGESTION' ||
    !isUuidLike(value.subjectElementId) ||
    !isUuidLike(value.objectElementId) ||
    !isUuidLike(value.spaceElementId)
  ) {
    throw new HttpError(409, 'La sugerencia activa tiene un formato inválido.');
  }

  return {
    version: 1,
    kind: 'SUGGESTION',
    subjectElementId: value.subjectElementId,
    objectElementId: value.objectElementId,
    spaceElementId: value.spaceElementId,
  };
}

function asJsonObject(detail: Prisma.JsonValue | null) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    throw new HttpError(409, 'La sugerencia activa tiene un formato inválido.');
  }

  return detail as Record<string, unknown>;
}

function isUuidLike(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}