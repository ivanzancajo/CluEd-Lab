import { ColorEquipo } from '@prisma/client';
import { BOARD_MOVEMENT_NODES } from './boardGraph.js';

type TeamSpawnPosition = {
  positionX: number;
  positionY: number;
};

function getSpawnPositionByNodeId(nodeId: string): TeamSpawnPosition {
  const node = BOARD_MOVEMENT_NODES[nodeId];
  if (!node) {
    throw new Error(`No se encontró el nodo de spawn ${nodeId}.`);
  }

  return {
    positionX: node.positionX,
    positionY: node.positionY,
  };
}

export const TEAM_SPAWN_POSITIONS: Record<ColorEquipo, TeamSpawnPosition> = {
  [ColorEquipo.ROJO]: getSpawnPositionByNodeId('spawn-rojo'),
  [ColorEquipo.AMARILLO]: getSpawnPositionByNodeId('spawn-amarillo'),
  [ColorEquipo.AZUL]: getSpawnPositionByNodeId('spawn-azul'),
  [ColorEquipo.VERDE]: getSpawnPositionByNodeId('spawn-verde'),
  [ColorEquipo.MORADO]: getSpawnPositionByNodeId('spawn-morado'),
  [ColorEquipo.BLANCO]: getSpawnPositionByNodeId('spawn-blanco'),
};

export function getTeamSpawnPosition(color: ColorEquipo): TeamSpawnPosition {
  return TEAM_SPAWN_POSITIONS[color];
}