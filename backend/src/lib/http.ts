import type { Response } from 'express';
import type { ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string[] | undefined
  ) {
    super(message);
  }
}

export function parseBody<T>(schema: ZodType<T>, value: unknown, res: Response): T | null {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    res.status(400).json({
      error: 'La solicitud contiene datos inválidos.',
      details: parsed.error.issues.map((issue) => issue.message),
    });
    return null;
  }

  return parsed.data;
}