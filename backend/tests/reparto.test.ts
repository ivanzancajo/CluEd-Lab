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

  it('caso 2 jugadores con 4 cartas ocultas retiradas: 14 cartas → 7 por equipo sin sobrantes', () => {
    const deck = Array.from({ length: 14 }, (_, i) => `card-${i}`);
    const { cardsByTeam, sobrantes } = cyclicDeal(deck, 2);

    expect(cardsByTeam[0]).toHaveLength(7);
    expect(cardsByTeam[1]).toHaveLength(7);
    expect(sobrantes).toHaveLength(0);
  });
});
