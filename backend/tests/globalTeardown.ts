import { PrismaClient } from '@prisma/client';
import { getTestDatabaseSchema, getTestDatabaseUrl } from './helpers/testDatabase';

export default async function globalTeardown() {
  const schema = getTestDatabaseSchema();
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: getTestDatabaseUrl(),
      },
    },
  });

  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
}