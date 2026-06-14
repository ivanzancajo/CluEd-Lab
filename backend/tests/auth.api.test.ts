import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { verifyAdminToken } from '../src/middleware/auth.js';
import authRoutes from '../src/routes/authRoutes.js';

type ErrorResponse = {
  error: string;
};

type LoginResponse = {
  token: string;
};

type SessionResponse = {
  authenticated: boolean;
  user: {
    role: string;
    username: string;
  };
};

describe('API de autenticacion del administrador', () => {
  let server: Server;
  let baseUrl = '';

  function signToken(payload: object, expiresIn: SignOptions['expiresIn'] = '8h') {
    return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn });
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);

    server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('No se pudo resolver el puerto del servidor de pruebas de autenticacion.');
    }

    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  async function request(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);

    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
  }

  it('devuelve 400 cuando faltan credenciales obligatorias', async () => {
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '', password: '' }),
    });

    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Usuario y contraseña son obligatorios.' });
  });

  it('devuelve 400 cuando username o password no son cadenas', async () => {
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 1234, password: false }),
    });

    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Usuario y contraseña son obligatorios.' });
  });

  it('rechaza credenciales incorrectas con 401', async () => {
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'incorrecta' }),
    });

    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Credenciales incorrectas' });
  });

  it('emite un JWT valido y permite recuperar la sesion autenticada', async () => {
    const loginResponse = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'cluedo2026' }),
    });

    const loginBody = (await loginResponse.json()) as LoginResponse;

    expect(loginResponse.status).toBe(200);
    expect(loginBody.token.split('.')).toHaveLength(3);
    const verifiedToken = verifyAdminToken(loginBody.token);

    expect(verifiedToken).toMatchObject({
      role: 'admin',
      username: 'admin',
    });
    expect(verifiedToken.exp).toEqual(expect.any(Number));
    expect(verifiedToken.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const sessionResponse = await request('/api/auth/session', {
      headers: {
        Authorization: `Bearer ${loginBody.token}`,
      },
    });

    const sessionBody = (await sessionResponse.json()) as SessionResponse;

    expect(sessionResponse.status).toBe(200);
    expect(sessionBody).toMatchObject({
      authenticated: true,
      user: {
        role: 'admin',
        username: 'admin',
      },
    });
  });

  it('rechaza la consulta de sesion sin token', async () => {
    const response = await request('/api/auth/session');

    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Acceso denegado. Se requiere autenticación.' });
  });

  it('rechaza la consulta de sesion cuando la cabecera Bearer no contiene token', async () => {
    const response = await request('/api/auth/session', {
      headers: {
        Authorization: 'Bearer',
      },
    });

    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Acceso denegado. Se requiere autenticación.' });
  });

  it('rechaza la consulta de sesion con un token invalido', async () => {
    const response = await request('/api/auth/session', {
      headers: {
        Authorization: 'Bearer token.invalido',
      },
    });

    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Token inválido o expirado.' });
  });

  it('rechaza la consulta de sesion con un token expirado', async () => {
    const response = await request('/api/auth/session', {
      headers: {
        Authorization: `Bearer ${signToken({ role: 'admin', username: 'admin' }, '-10s')}`,
      },
    });

    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Token inválido o expirado.' });
  });

  it('rechaza la consulta de sesion con un token firmado para un rol distinto de admin', async () => {
    const response = await request('/api/auth/session', {
      headers: {
        Authorization: `Bearer ${signToken({ role: 'viewer', username: 'admin' })}`,
      },
    });

    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Token inválido o expirado.' });
  });
});