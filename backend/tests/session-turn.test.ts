import { ColorEquipo } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import { getNextTurnTeam } from '../src/lib/sessionTurn.js';

describe('sessionTurn', () => {
  it('omite los equipos eliminados al calcular el siguiente turno', () => {
    const nextTeam = getNextTurnTeam(
      [
        { id: 'red', name: 'Equipo Rojo', color: ColorEquipo.ROJO },
        {
          id: 'yellow',
          name: 'Equipo Amarillo',
          color: ColorEquipo.AMARILLO,
          falseAccusation: true,
          eliminatedAt: new Date('2026-05-14T09:00:00.000Z'),
        },
        { id: 'blue', name: 'Equipo Azul', color: ColorEquipo.AZUL },
      ],
      'red'
    );

    expect(nextTeam?.id).toBe('blue');
  });
});