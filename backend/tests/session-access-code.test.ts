import { describe, expect, it, jest } from '@jest/globals';
import {
  ACCESS_CODE_CHARSET,
  ACCESS_CODE_LENGTH,
  createWithUniqueAccessCode,
  generateAccessCode,
} from '../src/lib/sessionAccessCode.js';

describe('SCRUM-33 generacion de codigos unicos de sesion', () => {
  it('genera codigos de 6 caracteres usando solo el alfabeto permitido', () => {
    const indexes = [0, 1, 2, 3, 4, 27];
    let callIndex = 0;

    const code = generateAccessCode((max) => {
      expect(max).toBe(ACCESS_CODE_CHARSET.length);
      return indexes[callIndex++] ?? 0;
    });

    expect(code).toBe('ABCDE1');
    expect(code).toHaveLength(ACCESS_CODE_LENGTH);
    expect([...code].every((character) => ACCESS_CODE_CHARSET.includes(character))).toBe(true);
  });

  it('reintenta con un codigo nuevo cuando detecta una colision', async () => {
    const generateCode = jest.fn<() => string>()
      .mockReturnValueOnce('AAAAAA')
      .mockReturnValueOnce('BBBBBB');
    const createWithCode = jest
      .fn<(accessCode: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('collision'))
      .mockResolvedValueOnce('BBBBBB');

    const result = await createWithUniqueAccessCode(createWithCode, {
      generateCode,
      isCollisionError: (error) => error instanceof Error && error.message === 'collision',
      onRetriesExhausted: () => new Error('No deberia agotarse'),
    });

    expect(result).toBe('BBBBBB');
    expect(generateCode).toHaveBeenCalledTimes(2);
    expect(createWithCode).toHaveBeenNthCalledWith(1, 'AAAAAA');
    expect(createWithCode).toHaveBeenNthCalledWith(2, 'BBBBBB');
  });

  it('propaga un error no relacionado con colisiones sin seguir reintentando', async () => {
    const generateCode = jest.fn(() => 'AAAAAA');
    const createWithCode = jest.fn(async () => {
      throw new Error('db-down');
    });

    await expect(
      createWithUniqueAccessCode(createWithCode, {
        generateCode,
        isCollisionError: (error) => error instanceof Error && error.message === 'collision',
      })
    ).rejects.toThrow('db-down');

    expect(generateCode).toHaveBeenCalledTimes(1);
    expect(createWithCode).toHaveBeenCalledTimes(1);
  });

  it('falla cuando agota el numero maximo de reintentos por colision', async () => {
    const generateCode = jest.fn(() => 'ZZZZZZ');
    const createWithCode = jest.fn(async () => {
      throw new Error('collision');
    });

    await expect(
      createWithUniqueAccessCode(createWithCode, {
        generateCode,
        retries: 3,
        isCollisionError: (error) => error instanceof Error && error.message === 'collision',
        onRetriesExhausted: () => new Error('No se ha podido generar un código de sesión único.'),
      })
    ).rejects.toThrow('No se ha podido generar un código de sesión único.');

    expect(generateCode).toHaveBeenCalledTimes(3);
    expect(createWithCode).toHaveBeenCalledTimes(3);
  });
});