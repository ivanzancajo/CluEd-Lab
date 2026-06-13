import {
  EstadoPartida,
  RazonEliminacionEquipo,
  TipoEvento,
  type ColorEquipo,
} from '@prisma/client';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';
import { loadSessionSnapshotById, type SessionSnapshot } from './sessionSnapshots.js';
import { loadSkinConfiguration } from './skinConfigs.js';
import {
  buildNextTurnUpdate,
  ensureCurrentTurnBelongsToTeam,
  isTeamEliminated,
} from './sessionTurn.js';

type SessionAccusationClient = Pick<typeof prisma, 'partida' | 'equipo' | 'evento' | 'cluEdSkin' | 'elemento' | 'cartaPublica'>;

export type FinalAccusationInput = {
  subjectElementId: string;
  objectElementId: string;
  spaceElementId: string;
};

type FinalAccusationCard = {
  id: string;
  name: string;
};

export type FinalAccusationVerdict = {
  eventId: string;
  occurredAt: string;
  accuserTeamId: string;
  accuserTeamName: string;
  accuserTeamColor: ColorEquipo;
  accusation: {
    subject: FinalAccusationCard;
    object: FinalAccusationCard;
    space: FinalAccusationCard;
  };
  outcome: 'CORRECTA' | 'INCORRECTA';
  sessionFinished: boolean;
  winnerTeamId: string | null;
  eliminatedTeamId: string | null;
};

export type FinalAccusationResult = {
  session: SessionSnapshot;
  verdict: FinalAccusationVerdict;
};

export async function resolveFinalAccusationByAccessCode(
  client: SessionAccusationClient,
  accessCode: string,
  teamId: string,
  payload: FinalAccusationInput
): Promise<FinalAccusationResult> {
  const session = await client.partida.findUnique({
    where: { accessCode },
    select: {
      id: true,
      status: true,
      skinId: true,
      currentTurnTeamId: true,
      activeSuggestionEventId: true,
      solution: {
        select: {
          id: true,
          subjectElementId: true,
          objectElementId: true,
          spaceElementId: true,
        },
      },
      teams: {
        select: {
          id: true,
          name: true,
          color: true,
          falseAccusation: true,
          eliminatedAt: true,
        },
      },
    },
  });

  if (!session) {
    throw new HttpError(404, 'La sesión solicitada no existe.');
  }

  if ((session.status ?? EstadoPartida.LOBBY) !== EstadoPartida.EN_CURSO) {
    throw new HttpError(409, 'La acusación final solo está disponible cuando la partida está en curso.');
  }

  if (!session.skinId) {
    throw new HttpError(409, 'La sesión no tiene una configuración válida asociada.');
  }

  if (!session.solution) {
    throw new HttpError(409, 'La sesión no tiene un sobre válido configurado para resolver la acusación.');
  }

  if (session.activeSuggestionEventId) {
    throw new HttpError(409, 'Hay una sugerencia pendiente de refutación y la partida está temporalmente bloqueada.');
  }

  ensureCurrentTurnBelongsToTeam(session, teamId);

  const accuser = session.teams.find((team) => team.id === teamId);
  if (!accuser) {
    throw new HttpError(404, 'El equipo indicado no pertenece a la sesión seleccionada.');
  }

  if (isTeamEliminated(accuser)) {
    throw new HttpError(409, `${accuser.name} ya ha quedado eliminado y no puede realizar una acusación final.`);
  }

  const skin = await loadSkinConfiguration(client, session.skinId);
  const accusation = {
    subject: getConfiguredCard(skin.subjects, payload.subjectElementId, 'sujeto'),
    object: getConfiguredCard(skin.objects, payload.objectElementId, 'objeto'),
    space: getConfiguredCard(skin.spaces, payload.spaceElementId, 'espacio'),
  };

  const isCorrect =
    payload.subjectElementId === session.solution.subjectElementId &&
    payload.objectElementId === session.solution.objectElementId &&
    payload.spaceElementId === session.solution.spaceElementId;

  const occurredAt = new Date();
  let winnerTeamId: string | null = null;
  let eliminatedTeamId: string | null = null;
  let sessionFinished = false;

  if (isCorrect) {
    winnerTeamId = accuser.id;
    sessionFinished = true;

    await client.partida.update({
      where: { id: session.id },
      data: {
        status: EstadoPartida.FINALIZADA,
        finishedAt: occurredAt,
        pausedAt: null,
        winnerTeamId,
        currentTurnTeamId: null,
        currentTurnStartedAt: null,
        activeDiceValueOne: null,
        activeDiceValueTwo: null,
        activeDiceRemainingMoves: null,
      },
    });
  } else {
    eliminatedTeamId = accuser.id;

    await client.equipo.update({
      where: { id: accuser.id },
      data: {
        falseAccusation: true,
        eliminatedAt: occurredAt,
        eliminationReason: RazonEliminacionEquipo.ACUSACION_FALSA,
      },
    });

    const nextTurnUpdate = buildNextTurnUpdate(
      {
        currentTurnTeamId: session.currentTurnTeamId,
        teams: session.teams.map((team) =>
          team.id === accuser.id
            ? {
                ...team,
                falseAccusation: true,
                eliminatedAt: occurredAt,
              }
            : team
        ),
      },
      occurredAt
    );

    sessionFinished = nextTurnUpdate.currentTurnTeamId === null;

    await client.partida.update({
      where: { id: session.id },
      data: sessionFinished
        ? {
            ...nextTurnUpdate,
            status: EstadoPartida.FINALIZADA,
            finishedAt: occurredAt,
            pausedAt: null,
            winnerTeamId: null,
          }
        : {
            ...nextTurnUpdate,
            winnerTeamId: null,
          },
    });
  }

  const event = await client.evento.create({
    data: {
      partidaId: session.id,
      emitterId: accuser.id,
      eventType: TipoEvento.ACUSACION,
      occurredAt,
      detail: {
        version: 1,
        kind: 'FINAL_ACCUSATION',
        outcome: isCorrect ? 'CORRECTA' : 'INCORRECTA',
        subjectElementId: accusation.subject.id,
        objectElementId: accusation.object.id,
        spaceElementId: accusation.space.id,
        winnerTeamId,
        eliminatedTeamId,
        sessionFinished,
      },
    },
    select: {
      id: true,
    },
  });

  return {
    session: await loadSessionSnapshotById(client, session.id),
    verdict: {
      eventId: event.id,
      occurredAt: occurredAt.toISOString(),
      accuserTeamId: accuser.id,
      accuserTeamName: accuser.name,
      accuserTeamColor: accuser.color,
      accusation,
      outcome: isCorrect ? 'CORRECTA' : 'INCORRECTA',
      sessionFinished,
      winnerTeamId,
      eliminatedTeamId,
    },
  };
}

function getConfiguredCard(
  cards: Array<{ id: string; name: string }>,
  elementId: string,
  label: 'sujeto' | 'objeto' | 'espacio'
) {
  const card = cards.find((currentCard) => currentCard.id === elementId);

  if (!card) {
    throw new HttpError(409, `La acusación final contiene un ${label} que no pertenece a la configuración activa.`);
  }

  return card;
}