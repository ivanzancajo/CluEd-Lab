import { PrismaClient } from '@prisma/client';

declare global {
  var __prismaClient__: PrismaClient | undefined;
}

export const prisma = globalThis.__prismaClient__ ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prismaClient__ = prisma;
}