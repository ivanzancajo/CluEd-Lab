import { describe, it, expect } from '@jest/globals';
import { cyclicDeal } from '../src/lib/sessionGameplay.js';

describe('reparto de cartas combinado (nuevo algoritmo)', () => {
  // Skin estándar: 5 sujetos + 8 objetos + 8 salas = 21 cartas restantes
  const makeCards = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  const allCards = [
    ...makeCards('s', 5),
    ...makeCards('o', 8),
    ...makeCards('p', 8),
  ]; // 21 cartas

  const expected: Record<number, { perTeam: number; sobrantes: number }> = {
    3: { perTeam: 7, sobrantes: 0 },
    4: { perTeam: 5, sobrantes: 1 },
    5: { perTeam: 4, sobrantes: 1 },
    6: { perTeam: 3, sobrantes: 3 },
  };

  [3, 4, 5, 6].forEach((teams) => {
    it(`${teams} equipos: floor(21/${teams}) cartas por equipo`, () => {
      const { cardsByTeam, sobrantes } = cyclicDeal(allCards, teams);

      const perTeam = cardsByTeam.map((c) => c.length);
      const sobraCount = sobrantes.length;
      console.log(`${teams} equipos: [${perTeam}] sobrantes=${sobraCount}`);

      expect(perTeam.every((c) => c === expected[teams]!.perTeam)).toBe(true);
      expect(sobraCount).toBe(expected[teams]!.sobrantes);
      expect(perTeam.reduce((a, b) => a + b, 0) + sobraCount).toBe(21);
    });
  });
});
