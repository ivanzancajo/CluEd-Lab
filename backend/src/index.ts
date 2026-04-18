import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import configRoutes from './routes/configRoutes.js';
import { env } from './config/env.js';

const app = express();

// Middlewares iniciales
app.use(cors({ origin: env.allowedOrigins, credentials: true }));
app.use(express.json());

// ==========================================
// RUTA DE HEALTH CHECK (Control de salud)
// ==========================================
app.get('/health', (req, res) => {
  res.json({ status: "Servidor Cluedo Operativo" });
});

// Rutas de autenticación
app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);

app.listen(env.port, '0.0.0.0', () => {
  console.log(`[Backend] Servidor Cluedo corriendo en el puerto ${env.port}`);
});