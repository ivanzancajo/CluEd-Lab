import path from 'node:path';
import dotenv from 'dotenv';

const DEFAULT_TEST_SCHEMA = 'jest_prisma_integration';

export function loadBackendEnv() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

export function getTestDatabaseSchema() {
  return process.env.TEST_DATABASE_SCHEMA?.trim() || DEFAULT_TEST_SCHEMA;
}

export function buildTestDatabaseUrl(databaseUrl: string, schema = getTestDatabaseSchema()) {
  const parsed = new URL(databaseUrl);

  if (parsed.hostname === 'host.docker.internal') {
    parsed.hostname = 'localhost';
  }

  parsed.searchParams.set('schema', schema);
  return parsed.toString();
}

export function getTestDatabaseUrl() {
  loadBackendEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL no está definida para los tests de integración.');
  }

  const schema = getTestDatabaseSchema();
  const testDatabaseUrl = buildTestDatabaseUrl(databaseUrl, schema);
  process.env.TEST_DATABASE_SCHEMA = schema;
  process.env.DATABASE_URL = testDatabaseUrl;

  return testDatabaseUrl;
}