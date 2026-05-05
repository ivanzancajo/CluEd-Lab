import { randomUUID } from 'node:crypto';
import { EstadoPartida, Prisma } from '@prisma/client';
import { Router } from 'express';
import type { Response } from 'express';
import { HttpError, parseBody } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { loadSkinConfiguration } from '../lib/skinConfigs.js';
import {
  ACCESS_CODE_GENERATION_RETRIES,
  createWithUniqueAccessCode,
  generateAccessCode,
} from '../lib/sessionAccessCode.js';
import {
  createSessionSchema,
  joinSessionSchema,
  moveTeamSchema,
  sessionAccessCodeParamsSchema,
  teamSessionStateParamsSchema,
  teamMovesQuerySchema,
} from '../lib/sessionSchemas.js';
import {
  COLOR_LABELS,
  loadSessionSnapshotByAccessCode,
  type SessionSnapshot,
} from '../lib/sessionSnapshots.js';
import {
  loadTeamTerminalStateByAccessCode,
  startSessionByAccessCode,
} from '../lib/sessionGameplay.js';
import {
  loadTeamMoveStateByAccessCode,
  moveTeamByAccessCode,
} from '../lib/sessionMovement.js';
import { getTeamSpawnPosition } from '../lib/teamSpawnPositions.js';
import { verifyToken } from '../middleware/auth.js';
import { emitGameStarted, emitSessionSnapshotUpdate } from '../socket/socketServer.js';

const router = Router();

router.post('/sessions', verifyToken, async (req, res) => {
  const payload = parseBody(createSessionSchema, req.body, res);
  if (!payload) {
    return;
  }

  try {
    const session = await createSessionWithUniqueCode(payload.skinId);
    res.status(201).json({ item: session });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.get('/sessions/:accessCode', async (req, res) => {
  const accessCode = parseAccessCode(req.params, res);
  if (!accessCode) {
    return;
  }

  try {
    const session = await loadSessionSnapshotByAccessCode(prisma, accessCode);
    res.json({ item: session });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.get('/sessions/:accessCode/teams/:teamId/state', async (req, res) => {
  const teamParams = parseTeamSessionStateParams(req.params, res);
  if (!teamParams) {
    return;
  }

  try {
    const teamState = await loadTeamTerminalStateByAccessCode(prisma, teamParams.accessCode, teamParams.teamId);
    res.json({ item: teamState });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.get('/sessions/:accessCode/teams/:teamId/moves', async (req, res) => {
  const teamParams = parseTeamSessionStateParams(req.params, res);
  if (!teamParams) {
    return;
  }

  const query = parseBody(teamMovesQuerySchema, req.query, res);
  if (!query) {
    return;
  }

  try {
    const moveState = await loadTeamMoveStateByAccessCode(prisma, teamParams.accessCode, teamParams.teamId, query.diceRoll);
    res.json({ item: moveState });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.post('/sessions/:accessCode/teams/:teamId/move', async (req, res) => {
  const teamParams = parseTeamSessionStateParams(req.params, res);
  if (!teamParams) {
    return;
  }

  const payload = parseBody(moveTeamSchema, req.body, res);
  if (!payload) {
    return;
  }

  try {
    const moveResult = await prisma.$transaction(
      (tx) => moveTeamByAccessCode(tx, teamParams.accessCode, teamParams.teamId, payload.targetNodeId, payload.diceRoll),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    const session = await loadSessionSnapshotByAccessCode(prisma, teamParams.accessCode);

    try {
      await emitSessionSnapshotUpdate(moveResult.sessionId, {
        id: randomUUID(),
        type: 'system',
        message: `${moveResult.teamName} se ha movido a ${moveResult.currentNode.label}.`,
        occurredAt: Date.now(),
        teamColor: moveResult.teamColor,
        teamId: moveResult.teamId,
      });
    } catch {
      // El movimiento ya quedó persistido; un fallo de broadcast no debe revertirlo.
    }

    res.json({
      item: {
        session,
        diceRoll: moveResult.diceRoll,
        currentNode: moveResult.currentNode,
      },
    });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.post('/sessions/:accessCode/join', async (req, res) => {
  const accessCode = parseAccessCode(req.params, res);
  if (!accessCode) {
    return;
  }

  const payload = parseBody(joinSessionSchema, req.body, res);
  if (!payload) {
    return;
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const session = await tx.partida.findUnique({
          where: { accessCode },
          select: {
            id: true,
            status: true,
          },
        });

        if (!session) {
          throw new HttpError(404, 'La sesión solicitada no existe.');
        }

        if ((session.status ?? EstadoPartida.LOBBY) !== EstadoPartida.LOBBY) {
          throw new HttpError(409, 'La sesión ya no admite la conexión de nuevos equipos.');
        }

        const existingTeam = await tx.equipo.findFirst({
          where: {
            partidaId: session.id,
            color: payload.color,
          },
        });

        if (existingTeam) {
          throw new HttpError(409, 'El color seleccionado ya está ocupado en esta sesión.');
        }

        const team = await tx.equipo.create({
          data: {
            partidaId: session.id,
            color: payload.color,
            name: COLOR_LABELS[payload.color],
            ...getTeamSpawnPosition(payload.color),
          },
        });

        const snapshot = await loadSessionSnapshotByAccessCode(tx, accessCode);

        return {
          session: snapshot,
          team: snapshot.teams.find((currentTeam) => currentTeam.id === team.id) ?? {
            id: team.id,
            name: team.name,
            color: team.color,
            positionX: team.positionX ?? 0,
            positionY: team.positionY ?? 0,
            falseAccusation: team.falseAccusation ?? false,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    res.status(201).json({ item: result });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

router.post('/sessions/:accessCode/start', verifyToken, async (req, res) => {
  const accessCode = parseAccessCode(req.params, res);
  if (!accessCode) {
    return;
  }

  try {
    const session = await prisma.$transaction(
      (tx) => startSessionByAccessCode(tx, accessCode),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    try {
      await emitGameStarted(session);
      await emitSessionSnapshotUpdate(session.id, {
        id: randomUUID(),
        type: 'system',
        message: 'El Game Master ha iniciado la partida.',
        occurredAt: Date.now(),
      });
    } catch {
      // El cambio de estado ya quedó persistido; un fallo de broadcast no debe revertirlo.
    }

    res.json({ item: session });
  } catch (error) {
    respondUnexpectedError(res, error);
  }
});

async function createSessionWithUniqueCode(skinId: string): Promise<SessionSnapshot> {
  return createWithUniqueAccessCode(
    (accessCode) =>
      prisma.$transaction(
        async (tx) => {
          const skin = await loadSkinConfiguration(tx, skinId);

          await tx.partida.create({
            data: {
              accessCode,
              status: EstadoPartida.LOBBY,
              skinId,
              durationMinutes: parseDurationMinutes(skin.duration),
            },
          });

          return loadSessionSnapshotByAccessCode(tx, accessCode);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      ),
    {
      retries: ACCESS_CODE_GENERATION_RETRIES,
      generateCode: generateAccessCode,
      isCollisionError: (error) => isKnownPrismaError(error, 'P2002'),
      onRetriesExhausted: () =>
        new HttpError(503, 'No se ha podido generar un código de sesión único. Inténtalo de nuevo.'),
    }
  );
}

function parseAccessCode(value: unknown, res: Response): string | null {
  const parsed = parseBody(sessionAccessCodeParamsSchema, value, res);
  return parsed?.accessCode ?? null;
}

function parseTeamSessionStateParams(value: unknown, res: Response) {
  return parseBody(teamSessionStateParamsSchema, value, res);
}

function parseDurationMinutes(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

function isKnownPrismaError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function respondUnexpectedError(res: Response, error: unknown) {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.message,
      details: error.details,
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'El color seleccionado ya está ocupado en esta sesión.' });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({ error: 'La sesión solicitada no existe.' });
      return;
    }

    if (error.code === 'P2021') {
      res.status(503).json({
        error:
          'La base de datos no tiene desplegado el esquema completo de partida. Sincroniza Prisma sobre un esquema válido antes de iniciar la sesión.',
      });
      return;
    }
  }

  res.status(500).json({ error: 'Se ha producido un error interno al gestionar la sesión.' });
}

export default router;