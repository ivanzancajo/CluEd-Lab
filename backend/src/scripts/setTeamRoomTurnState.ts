import { config as loadDotenv } from 'dotenv';
import { EstadoPartida } from '@prisma/client';
import { BOARD_MOVEMENT_NODES } from '../lib/boardGraph.js';
import { prisma } from '../lib/prisma.js';

loadDotenv({ override: true });

async function main() {
  const sessionId = process.env.SESSION_ID?.trim();
  const teamId = process.env.TEAM_ID?.trim();
  const roomNodeId = process.env.ROOM_NODE_ID?.trim();

  if (!sessionId || !teamId || !roomNodeId) {
    throw new Error('SESSION_ID, TEAM_ID y ROOM_NODE_ID son obligatorios.');
  }

  const roomNode = BOARD_MOVEMENT_NODES[roomNodeId];
  if (!roomNode || roomNode.kind !== 'room') {
    throw new Error(`La sala indicada no existe en el tablero: ${roomNodeId}`);
  }

  const team = await prisma.equipo.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      partidaId: true,
    },
  });

  if (!team || team.partidaId !== sessionId) {
    throw new Error('El equipo indicado no pertenece a la sesión solicitada.');
  }

  await prisma.equipo.update({
    where: { id: teamId },
    data: {
      positionX: roomNode.positionX,
      positionY: roomNode.positionY,
    },
  });

  await prisma.partida.update({
    where: { id: sessionId },
    data: {
      status: EstadoPartida.EN_CURSO,
      currentTurnTeamId: teamId,
      currentTurnStartedAt: new Date(),
      activeDiceValueOne: null,
      activeDiceValueTwo: null,
      activeDiceRemainingMoves: null,
      activeSuggestionEventId: null,
    },
  });

  process.stdout.write(
    JSON.stringify({
      sessionId,
      teamId,
      roomNodeId: roomNode.id,
      roomLabel: roomNode.label,
      positionX: roomNode.positionX,
      positionY: roomNode.positionY,
    })
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });