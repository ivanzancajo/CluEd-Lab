import { ColorEquipo } from '@prisma/client';

type TeamSpawnPosition = {
  positionX: number;
  positionY: number;
};

export const TEAM_SPAWN_POSITIONS: Record<ColorEquipo, TeamSpawnPosition> = {
  [ColorEquipo.ROJO]: { positionX: 64.97, positionY: 10.03 },
  [ColorEquipo.AMARILLO]: { positionX: 88.02, positionY: 32.94 },
  [ColorEquipo.AZUL]: { positionX: 10.03, positionY: 70.05 },
  [ColorEquipo.VERDE]: { positionX: 42.06, positionY: 91.93 },
  [ColorEquipo.MORADO]: { positionX: 10.03, positionY: 29.04 },
  [ColorEquipo.BLANCO]: { positionX: 57.94, positionY: 91.93 },
};

export function getTeamSpawnPosition(color: ColorEquipo): TeamSpawnPosition {
  return TEAM_SPAWN_POSITIONS[color];
}