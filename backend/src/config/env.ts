import dotenv from 'dotenv';

dotenv.config();

const requiredEnv = ['ADMIN_USER', 'ADMIN_PASS_HASH', 'JWT_SECRET', 'DATABASE_URL'] as const;

for (const key of requiredEnv) {
  if (!process.env[key] || process.env[key]?.trim() === '') {
    throw new Error(`[Backend] Falta la variable de entorno obligatoria ${key}`);
  }
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const socketIoCorsOrigins = (process.env.SOCKET_IO_CORS_ORIGIN || process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  adminUser: process.env.ADMIN_USER as string,
  adminPassHash: process.env.ADMIN_PASS_HASH as string,
  jwtSecret: process.env.JWT_SECRET as string,
  databaseUrl: process.env.DATABASE_URL as string,
  port: Number(process.env.PORT || 4000),
  allowedOrigins,
  socketIoCorsOrigins,
};