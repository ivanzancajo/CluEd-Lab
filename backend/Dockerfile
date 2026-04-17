FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

FROM base AS dev

COPY . .

RUN npx prisma generate

EXPOSE 4000
CMD ["npm", "run", "dev"]

FROM base AS build

COPY . .

RUN npx prisma generate && npm run build

FROM node:22-alpine AS prod

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate && npm prune --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["npm", "run", "start"]