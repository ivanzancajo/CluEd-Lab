// Importamos 'jwt' como valor y los tipos de express como 'type'
import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export interface AuthTokenPayload extends JwtPayload {
  role: 'admin';
  username: string;
  sub: string;
}

export interface AuthRequest extends Request {
  user?: AuthTokenPayload;
}

export function verifyAdminToken(token: string): AuthTokenPayload {
  const verified = jwt.verify(token, env.jwtSecret);

  if (typeof verified === 'string' || verified.role !== 'admin') {
    throw new Error('Token inválido o expirado.');
  }

  return verified as AuthTokenPayload;
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Acceso denegado. Se requiere autenticación.' });
    return;
  }

  try {
    req.user = verifyAdminToken(token);
    next();
  } catch {
    res.status(403).json({ error: 'Token inválido o expirado.' });
  }
};