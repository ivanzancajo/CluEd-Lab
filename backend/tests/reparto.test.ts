import { describe, expect, it } from '@jest/globals';
import { cyclicDeal } from '../src/lib/sessionGameplay.js';

describe('cyclicDeal', () => {
  it('reparte equitativamente sin sobrantes cuando el reparto es exacto', () => {
    const deck = ['a', 'b', 'c', 'd', 'e', 'f'];
    const { cardsByTeam, sobrantes } = cyclicDeal(deck, 3);

    expect(cardsByTeam).toHaveLength(3);
    expect(cardsByTeam[0]).toHaveLength(2);
    expect(cardsByTeam[1]).toHaveLength(2);
    expect(cardsByTeam[2]).toHaveLength(2);
    expect(sobrantes).toHaveLength(0);
  });

  it('identifica correctamente los sobrantes cuando no hay division exacta', () => {
    const deck = ['a', 'b', 'c', 'd', 'e'];
    const { cardsByTeam, sobrantes } = cyclicDeal(deck, 2);

    expect(cardsByTeam[0]).toHaveLength(2);
    expect(cardsByTeam[1]).toHaveLength(2);
    expect(sobrantes).toHaveLength(1);
    expect(sobrantes[0]).toBe('e');
  });

  it('reparte en orden ciclico correcto equipo[i % N]', () => {
    const deck = ['a', 'b', 'c', 'd'];
    const { cardsByTeam, sobrantes } = cyclicDeal(deck, 2);

    expect(cardsByTeam[0]).toEqual(['a', 'c']);
    expect(cardsByTeam[1]).toEqual(['b', 'd']);
    expect(sobrantes).toHaveLength(0);
  });

  it('con un solo equipo todas las cartas van a ese equipo sin sobrantes', () => {
    const deck = ['a', 'b', 'c', 'd', 'e'];
    const { cardsByTeam, sobrantes } = cyclicDeal(deck, 1);

    expect(cardsByTeam).toHaveLength(1);
    expect(cardsByTeam[0]).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(sobrantes).toHaveLength(0);
  });

  it('con mas equipos que cartas todas las cartas son sobrantes (0 rondas completas)', () => {
    const deck = ['a', 'b'];
    const { cardsByTeam, sobrantes } = cyclicDeal(deck, 4);

    expect(cardsByTeam).toHaveLength(4);
    expect(cardsByTeam.every((hand) => hand.length === 0)).toBe(true);
    expect(sobrantes).toEqual(['a', 'b']);
  });

  it('con mazo vacio todos los equipos tienen mano vacia y sobrantes vacio', () => {
    const { cardsByTeam, sobrantes } = cyclicDeal([], 3);

    expect(cardsByTeam).toHaveLength(3);
    expect(cardsByTeam.every((hand) => hand.length === 0)).toBe(true);
    expect(sobrantes).toHaveLength(0);
  });

  it('los sobrantes son exactamente las ultimas (total mod N) cartas del mazo', () => {
    const deck = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const N = 3;
    const { sobrantes } = cyclicDeal(deck, N);

    expect(sobrantes).toHaveLength(deck.length % N);
    expect(sobrantes).toEqual(['g']);
  });

  it('cada carta aparece exactamente una vez entre manos y sobrantes', () => {
    const deck = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8', 'x9'];
    const { cardsByTeam, sobrantes } = cyclicDeal(deck, 4);

    const allDealt = [...cardsByTeam.flat(), ...sobrantes];
    expect(allDealt.sort()).toEqual([...deck].sort());
  });

  it('reparte 1 carta por equipo con 1 sobrante para 5 equipos y 6 cartas', () => {
    const deck = ['a', 'b', 'c', 'd', 'e', 'f'];
    const { cardsByTeam, sobrantes } = cyclicDeal(deck, 5);

    expect(cardsByTeam).toHaveLength(5);
    expect(cardsByTeam.every((hand) => hand.length === 1)).toBe(true);
    expect(sobrantes).toHaveLength(1);
    expect(sobrantes[0]).toBe('f');
  });

  it('reparte 1 carta por equipo sin sobrantes para 6 equipos y 6 cartas', () => {
    const deck = ['a', 'b', 'c', 'd', 'e', 'f'];
    const { cardsByTeam, sobrantes } = cyclicDeal(deck, 6);

    expect(cardsByTeam).toHaveLength(6);
    expect(cardsByTeam.every((hand) => hand.length === 1)).toBe(true);
    expect(sobrantes).toHaveLength(0);
  });

  it('todos los equipos reciben exactamente el mismo numero de cartas para cualquier N entre 2 y 6', () => {
    const deck = ['a', 'b', 'c', 'd', 'e', 'f'];

    for (let n = 2; n <= 6; n++) {
      const { cardsByTeam } = cyclicDeal(deck, n);
      const expectedCount = Math.floor(deck.length / n);
      expect(cardsByTeam.every((hand) => hand.length === expectedCount)).toBe(true);
    }
  });

  it('caso 2 jugadores: 18 cartas → 9 por equipo sin sobrantes (reparto estándar)', () => {
    const deck = Array.from({ length: 18 }, (_, i) => `card-${i}`);
    const { cardsByTeam, sobrantes } = cyclicDeal(deck, 2);

    expect(cardsByTeam[0]).toHaveLength(9);
    expect(cardsByTeam[1]).toHaveLength(9);
    expect(sobrantes).toHaveLength(0);
  });
});

describe('reparto por categoría (equilibrio entre tipos)', () => {
  function dealByCategory(
    subjects: string[],
    objects: string[],
    spaces: string[],
    teamCount: number
  ) {
    const { cardsByTeam: sbt, sobrantes: ss } = cyclicDeal(subjects, teamCount);
    const { cardsByTeam: obt, sobrantes: os } = cyclicDeal(objects,  teamCount);
    const { cardsByTeam: spbt, sobrantes: sps } = cyclicDeal(spaces, teamCount);

    const cardsByTeam = Array.from({ length: teamCount }, (_, i) => ({
      subjects: sbt[i] ?? [],
      objects:  obt[i]  ?? [],
      spaces:   spbt[i] ?? [],
      all: [...(sbt[i] ?? []), ...(obt[i] ?? []), ...(spbt[i] ?? [])],
    }));

    return { cardsByTeam, sobrantes: [...ss, ...os, ...sps] };
  }

  it('2 equipos: cada uno recibe sujetos de ambas categorías de forma balanceada', () => {
    // 5 sujetos, 5 objetos, 5 espacios (solución ya retirada): diferencia máxima de 1 por categoría
    const subjects = ['s1', 's2', 's3', 's4', 's5'];
    const objects  = ['o1', 'o2', 'o3', 'o4', 'o5'];
    const spaces   = ['sp1', 'sp2', 'sp3', 'sp4', 'sp5'];

    const { cardsByTeam, sobrantes } = dealByCategory(subjects, objects, spaces, 2);

    for (const team of cardsByTeam) {
      expect(team.subjects.length).toBeGreaterThanOrEqual(2);
      expect(team.objects.length).toBeGreaterThanOrEqual(2);
      expect(team.spaces.length).toBeGreaterThanOrEqual(2);
    }
    expect(sobrantes).toHaveLength(3); // 1 sobrante por categoría impar
  });

  it('2 equipos: ningún equipo acapara todos los elementos de una categoría', () => {
    const subjects = ['s1', 's2', 's3', 's4'];
    const objects  = ['o1', 'o2', 'o3', 'o4'];
    const spaces   = ['sp1', 'sp2', 'sp3', 'sp4'];

    const { cardsByTeam } = dealByCategory(subjects, objects, spaces, 2);

    for (const team of cardsByTeam) {
      // Con 4 elementos por categoría y 2 equipos cada uno recibe exactamente 2
      expect(team.subjects).toHaveLength(2);
      expect(team.objects).toHaveLength(2);
      expect(team.spaces).toHaveLength(2);
    }
  });

  it('todas las cartas aparecen exactamente una vez entre manos y sobrantes', () => {
    const subjects = ['s1', 's2', 's3', 's4', 's5'];
    const objects  = ['o1', 'o2', 'o3'];
    const spaces   = ['sp1', 'sp2', 'sp3', 'sp4'];

    const { cardsByTeam, sobrantes } = dealByCategory(subjects, objects, spaces, 3);

    const allDealt = [...cardsByTeam.flatMap((t) => t.all), ...sobrantes].sort();
    const allCards = [...subjects, ...objects, ...spaces].sort();
    expect(allDealt).toEqual(allCards);
  });

  it('con 6 equipos y pocas cartas por categoría los sobrantes se minimizan', () => {
    const subjects = ['s1', 's2', 's3', 's4', 's5'];
    const objects  = ['o1', 'o2', 'o3', 'o4', 'o5'];
    const spaces   = ['sp1', 'sp2', 'sp3', 'sp4', 'sp5'];

    const { cardsByTeam } = dealByCategory(subjects, objects, spaces, 6);

    // Con 5 cartas por categoría y 6 equipos: 5 reciben 1 y 1 recibe 0 por categoría
    for (const team of cardsByTeam) {
      expect(team.all.length).toBeLessThanOrEqual(3);
    }
  });
});
