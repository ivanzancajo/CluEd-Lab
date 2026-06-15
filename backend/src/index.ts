import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import configRoutes from './routes/configRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import { env } from './config/env.js';
import { registerSocketServer } from './socket/socketServer.js';

const app = express();
const httpServer = createServer(app);

// Middlewares iniciales
app.use(cors({ origin: env.allowedOrigins, credentials: true }));
app.use(express.json({ limit: '25mb' }));

// ==========================================
// RUTA DE HEALTH CHECK (Control de salud)
// ==========================================
app.get('/health', (req, res) => {
  res.json({ status: "Servidor Cluedo Operativo" });
});

// Rutas de autenticación
app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);
app.use('/api/game', sessionRoutes);

registerSocketServer(httpServer);

httpServer.listen(env.port, '0.0.0.0', () => {
  console.log(`[Backend] Servidor Cluedo corriendo en el puerto ${env.port}`);
});