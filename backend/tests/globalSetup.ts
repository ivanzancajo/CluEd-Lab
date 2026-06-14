import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { getTestDatabaseSchema, getTestDatabaseUrl } from './helpers/testDatabase';

export default async function globalSetup() {
  const schema = getTestDatabaseSchema();
  const databaseUrl = getTestDatabaseUrl();
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await prisma.$disconnect();
  }

  execFileSync('npx', ['prisma', 'db', 'push'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'inherit',
  });
}