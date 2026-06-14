import { randomInt } from 'node:crypto';

export const ACCESS_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const ACCESS_CODE_LENGTH = 6;
export const ACCESS_CODE_GENERATION_RETRIES = 10;

type UniqueAccessCodeOptions = {
  generateCode?: () => string;
  retries?: number;
  isCollisionError?: (error: unknown) => boolean;
  onRetriesExhausted?: () => Error;
};

export function generateAccessCode(randomIndex: (max: number) => number = randomInt) {
  let code = '';

  for (let index = 0; index < ACCESS_CODE_LENGTH; index += 1) {
    code += ACCESS_CODE_CHARSET[randomIndex(ACCESS_CODE_CHARSET.length)];
  }

  return code;
}

export async function createWithUniqueAccessCode<T>(
  createWithCode: (accessCode: string) => Promise<T>,
  options: UniqueAccessCodeOptions = {}
) {
  const {
    generateCode = generateAccessCode,
    retries = ACCESS_CODE_GENERATION_RETRIES,
    isCollisionError = () => false,
    onRetriesExhausted = () => new Error('No se ha podido generar un código de sesión único.'),
  } = options;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const accessCode = generateCode();

    try {
      return await createWithCode(accessCode);
    } catch (error) {
      if (isCollisionError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw onRetriesExhausted();
}