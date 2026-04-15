# ==========================================
# Etapa 1: Construcción (Builder)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copiamos manifiestos y bloqueos de versiones
COPY package*.json ./
COPY tsconfig.json ./

# Instalamos TODAS las dependencias (ahora sí incluirá TypeScript y los @types)
RUN npm install

COPY src/ ./src/

# Compilamos de forma segura
RUN npx tsc

# ==========================================
# Etapa 2: Producción (Runner)
# ==========================================
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

# Instalamos SOLO dependencias de producción para aligerar la imagen
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/index.js"]