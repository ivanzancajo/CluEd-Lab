import { rollTurnDiceForced } from '../src/lib/sessionTurn.js';

describe('rollTurnDiceForced', () => {
  it.each(Array.from({ length: 11 }, (_, i) => i + 2))(
    'total=%i: valueOne + valueTwo === total',
    (total) => {
      const dice = rollTurnDiceForced(total);
      expect(dice.total).toBe(total);
      expect(dice.valueOne + dice.valueTwo).toBe(total);
    }
  );

  it.each(Array.from({ length: 11 }, (_, i) => i + 2))(
    'total=%i: ambos valores en rango [1, 6]',
    (total) => {
      const dice = rollTurnDiceForced(total);
      expect(dice.valueOne).toBeGreaterThanOrEqual(1);
      expect(dice.valueOne).toBeLessThanOrEqual(6);
      expect(dice.valueTwo).toBeGreaterThanOrEqual(1);
      expect(dice.valueTwo).toBeLessThanOrEqual(6);
    }
  );

  it('total=2 produce [1, 1]', () => {
    const dice = rollTurnDiceForced(2);
    expect(dice).toEqual({ valueOne: 1, valueTwo: 1, total: 2 });
  });

  it('total=7 produce [4, 3]', () => {
    const dice = rollTurnDiceForced(7);
    expect(dice).toEqual({ valueOne: 4, valueTwo: 3, total: 7 });
  });

  it('total=12 produce [6, 6]', () => {
    const dice = rollTurnDiceForced(12);
    expect(dice).toEqual({ valueOne: 6, valueTwo: 6, total: 12 });
  });
});
