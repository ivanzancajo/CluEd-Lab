import { Router } from 'express';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const router = Router();

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  const envUser = process.env.ADMIN_USER;
  const envPassHash = process.env.ADMIN_PASS_HASH;

  // Verificamos usuario y comparamos hash de contraseña
  if (username === envUser && await bcrypt.compare(password, envPassHash || '')) {
    const token = jwt.sign(
      { role: 'admin' }, 
      process.env.JWT_SECRET || 'fallback', 
      { expiresIn: '8h' }
    );
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

export default router;