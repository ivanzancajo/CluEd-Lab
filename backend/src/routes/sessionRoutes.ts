import { randomInt, randomUUID } from 'node:crypto';
import { EstadoPartida, Prisma } from '@prisma/client';
import { Router } from 'express';
import type { Response } from 'express';
import { HttpError, parseBody } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { loadSkinConfiguration } from '../lib/skinConfigs.js';
import {
  createSessionSchema,
  joinSessionSchema,
  sessionAccessCodeParamsSchema,
} from '../lib/sessionSchemas.js';
import {
  COLOR_LABELS,
  loadSessionSnapshotByAccessCode,
  type SessionSnapshot,
} from '../lib/sessionSnapshots.js';
import { verifyToken } from '../middleware/auth.js';
import { emitSessionSnapshotUpdate } from '../socket/socketServer.js';

const router = Router();

const ACCESS_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ACCESS_CODE_LENGTH = 6;
const ACCESS_CODE_GENERATION_RETRIES = 10;

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
      async (tx) => {
        const currentSession = await tx.partida.findUnique({
          where: { accessCode },
          select: {
            id: true,
            status: true,
          },
        });

        if (!currentSession) {
          throw new HttpError(404, 'La sesión solicitada no existe.');
        }

        if ((currentSession.status ?? EstadoPartida.LOBBY) !== EstadoPartida.LOBBY) {
          throw new HttpError(409, 'La partida ya ha sido iniciada o no admite esta transición.');
        }

        await tx.partida.update({
          where: { id: currentSession.id },
          data: {
            status: EstadoPartida.EN_CURSO,
            startedAt: new Date(),
          },
        });

        return loadSessionSnapshotByAccessCode(tx, accessCode);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    try {
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
  for (let attempt = 0; attempt < ACCESS_CODE_GENERATION_RETRIES; attempt += 1) {
    const accessCode = generateAccessCode();

    try {
      return await prisma.$transaction(
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
      );
    } catch (error) {
      if (isKnownPrismaError(error, 'P2002')) {
        continue;
      }

      throw error;
    }
  }

  throw new HttpError(503, 'No se ha podido generar un código de sesión único. Inténtalo de nuevo.');
}

function parseAccessCode(value: unknown, res: Response): string | null {
  const parsed = parseBody(sessionAccessCodeParamsSchema, value, res);
  return parsed?.accessCode ?? null;
}

function generateAccessCode() {
  let code = '';

  for (let index = 0; index < ACCESS_CODE_LENGTH; index += 1) {
    code += ACCESS_CODE_CHARSET[randomInt(ACCESS_CODE_CHARSET.length)];
  }

  return code;
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
  }

  res.status(500).json({ error: 'Se ha producido un error interno al gestionar la sesión.' });
}

export default router;