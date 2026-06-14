FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
# El proyecto usa legacy-peer-deps (ver .npmrc local); se fija aquí porque el
# build de Docker no copia .npmrc y npm ci debe resolver igual que en local.
RUN npm ci --legacy-peer-deps

FROM base AS dev

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

FROM base AS build

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY . .

RUN npm run build

FROM nginx:1.27-alpine AS prod

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]