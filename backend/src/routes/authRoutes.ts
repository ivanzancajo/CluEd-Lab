import { Router } from 'express';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import type { AuthRequest } from '../middleware/auth.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password.trim()) {
    res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
    return;
  }

  // Verificamos usuario y comparamos hash de contraseña
  if (username === env.adminUser && await bcrypt.compare(password, env.adminPassHash)) {
    const token = jwt.sign(
      { role: 'admin', username },
      env.jwtSecret,
      { expiresIn: '8h' }
    );
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

router.get('/session', verifyToken, (req: AuthRequest, res: Response) => {
  res.json({ authenticated: true, user: req.user });
});

export default router;