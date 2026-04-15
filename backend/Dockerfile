# ==========================================
# Etapa 1: Construcción (Builder)
# ==========================================
FROM node:22-alpine AS builder

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos solo los archivos de dependencias
COPY package*.json ./
COPY tsconfig.json ./

# Instalamos TODAS las dependencias (necesitamos TypeScript para compilar)
RUN npm install

# Copiamos todo el código fuente
COPY src/ ./src/

# Compilamos de TypeScript a JavaScript (genera la carpeta /dist)
RUN npm run build

# ==========================================
# Etapa 2: Producción (Runner)
# ==========================================
FROM node:22-alpine

# Directorio de trabajo
WORKDIR /app

# Copiamos el package.json
COPY package*.json ./

# Instalamos SOLO las dependencias de producción (--omit=dev)
# Esto hace que la imagen sea súper ligera y segura
RUN npm install --omit=dev

# Copiamos ÚNICAMENTE la carpeta /dist compilada desde la Etapa 1
COPY --from=builder /app/dist ./dist

# Exponemos el puerto de nuestra API
EXPOSE 4000

# Comando para arrancar el servidor
CMD ["npm", "start"]