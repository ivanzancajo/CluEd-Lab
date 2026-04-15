import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';

dotenv.config();

const app = express();

// Middlewares iniciales
app.use(cors());
app.use(express.json());

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Puerto dinámico según el entorno
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`[Backend] Servidor Cluedo corriendo en el puerto ${PORT}`);
});