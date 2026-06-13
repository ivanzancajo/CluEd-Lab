# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**CluEd Lab** — a real-time multiplayer web adaptation of Cluedo. Players join as teams via access codes; a Game Master (admin) controls the session lifecycle. The board is thematic (CluEdSkins), movement is node-graph based, and the game resolves through suggestions, refutations, and a final accusation phase.

Stack: Express + Socket.IO backend, React SPA frontend, PostgreSQL via Prisma, Docker Compose for dev and prod.

## Commands

### Backend (`cd backend`)

```bash
npm run dev                         # tsx watch (hot reload)
npm run build                       # tsc compile to dist/
npm run prisma:generate             # regenerate Prisma client after schema changes
npm run prisma:migrate:dev          # create and apply a new migration
npm run prisma:migrate:deploy       # apply pending migrations (prod)
npm run test                        # integration + unit tests (needs running PG)
npm run test:unit                   # unit tests only (no DB needed)
npm run test:auth-api               # auth API tests only
npm run demo:deal -- --teams=4      # create a demo dealt session
```

Run a single test file:
```bash
npx jest --runInBand --config jest.config.cjs tests/session-movement.test.ts
```

### Frontend (`cd frontend`)

```bash
npm run dev         # Vite dev server on :5173 (proxies /api and /socket.io to :4000)
npm run build       # production build to dist/
npm run lint        # ESLint
npm run cy:open     # Cypress interactive
npm run cy:run      # Cypress headless e2e
```

### Docker

```bash
docker compose up -d --build                                     # dev (hot reload)
docker compose -f docker-compose.prod.yml up -d --build          # production
docker compose -f docker-compose.prod.yml --env-file docker-compose.lab.env up -d --build  # lab VM
npm run test:docker-backend-postgres                             # container smoke test (from backend/)
```

## Environment Setup

Copy `backend/.env.example` to `backend/.env`. Required variables:

| Variable | Purpose |
|----------|---------|
| `ADMIN_USER` | Game Master username |
| `ADMIN_PASS_HASH` | bcrypt hash of GM password |
| `JWT_SECRET` | JWT signing secret |
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |

Optional: `ALLOWED_ORIGINS`, `SOCKET_IO_CORS_ORIGIN`, `PORT` (default 4000).

For a pre-existing DB, mark the baseline migration as applied before running new ones:
```bash
npm run prisma:migrate:resolve -- --applied 20260417_scrum_13_skin_schema
```

## Architecture

### Backend (`backend/src/`)

- **`index.ts`** — Express app + Node HTTP server, registers Socket.IO, mounts routes at `/api/auth`, `/api/config`, `/api/game`.
- **`config/env.ts`** — validates and exports all env vars; throws on startup if any required var is missing.
- **`middleware/auth.ts`** — JWT verification; `verifyToken` for admin HTTP routes, `verifyAdminToken` for socket connections.
- **`routes/`** — thin Express route handlers: `authRoutes`, `configRoutes`, `sessionRoutes`. Business logic lives in `lib/`.
- **`socket/socketServer.ts`** — all Socket.IO event handling. Exports `registerSocketServer` and `emitSessionSnapshotUpdate` (called from HTTP routes to push realtime updates after HTTP mutations). The active `io` instance is module-level.
- **`socket/lobbyPresenceStore.ts`** — in-memory presence tracking (which teams are connected per session).

**Core `lib/` modules:**

| File | Responsibility |
|------|---------------|
| `sessionSnapshots.ts` | Read-only DB queries returning `SessionSnapshot` / `SessionTeamSnapshot`; single source of truth for what clients receive |
| `sessionGameplay.ts` | start, pause, resume session (Prisma transaction functions) |
| `sessionMovement.ts` | dice rolling, pawn movement on the board graph |
| `sessionSuggestion.ts` | create suggestions, find refuting team, resolve refutations |
| `sessionAccusation.ts` | final accusation verdicts |
| `sessionResolution.ts` | in-memory resolution state (FINAL_CHANCE timer + submissions, DIRECT_REVEAL). Resolution is not persisted until finalized |
| `boardGraph.ts` | static board topology — nodes with `(positionX, positionY)`, adjacency. Shared conceptually with frontend's `src/lib/boardGraph.ts` |
| `skinConfigs.ts` | loads a `CluEdSkin` + its elements from DB into a typed config |
| `sessionAccessCode.ts` | 6-char access code generation with uniqueness retry logic |
| `http.ts` | `HttpError` class and `parseBody` helper for Zod validation in routes |

**Socket.IO room naming:**
- `lobby:session:{sessionId}` — all participants of a session (host + all teams)
- `lobby:session-team:{sessionId}:{teamId}` — team-private channel (for refutation requests)

**Socket event pattern:** every client→server event takes `(payload: unknown, acknowledge?)`. The handler parses with Zod, executes business logic, then calls `acknowledge({ ok: true, ... })` or `acknowledge({ ok: false, error: string })`. Critical mutations run in `prisma.$transaction(..., { isolationLevel: 'Serializable' })`.

### Frontend (`frontend/`)

- **`routes.ts`** (root level, not in `src/`) — React Router 7 browser router. Admin routes (`/config`, `/lobby`, `/board`, `/host`) are wrapped in `ProtectedRoute` (redirects to `/` if no JWT). Team routes (`/join`, `/terminal`) are public.
- **`components/views/`** — page-level components: `Landing`, `AdminConfigView`, `SessionCreateView`, `LobbyView`, `BoardView`, `JoinTerminalView`, `TerminalView`.
- **`components/ui/`** — shadcn/ui components (Radix UI primitives + Tailwind). Do not modify these manually.
- **`components/game/ThemedBoard.tsx`** — the interactive SVG board with thematic skins.
- **`src/lib/`** — client-side logic:
  - `auth.ts` — JWT storage and retrieval
  - `sessionApi.ts` — typed API client and TypeScript types mirroring backend `SessionSnapshot`
  - `lobbySocket.ts` — Socket.IO client wrapper with typed events matching `socketServer.ts`
  - `skinApi.ts` — CRUD for CluEdSkin via REST
  - `boardGraph.ts` / `boardMovement.ts` — client-side board graph and movement validation

Vite dev server proxies `/api` and `/socket.io` to `localhost:4000`, so the frontend never needs `VITE_API_URL` in local dev.

### Database Schema (key models)

- **`CluEdSkin`** — thematic skin (subjects, objects, spaces as `Elemento` records).
- **`Partida`** — game session. Holds `status` (`EstadoPartida`), `accessCode`, FK to active turn team, active suggestion event, dice state.
- **`Equipo`** — a team within a session. Has board position `(positionX, positionY)`, elimination state, color.
- **`Elemento`** — generic game element (subject/object/space) shared across skins.
- **`CartaEquipo`** — cards dealt to a team (many-to-many `Equipo` ↔ `Elemento`).
- **`Solucion`** — the secret solution (one subject + one object + one space `Elemento`).
- **`TablaRazonamiento` / `CeldaRazonamiento`** — per-team deduction grid.
- **`Evento`** — append-only event log (MOVIMIENTO, SUGERENCIA, REFUTACION, ACUSACION, SISTEMA).

`EstadoPartida` lifecycle: `LOBBY` → `REPARTO` (dealt) → `EN_CURSO` → `PAUSADA` ↔ `EN_CURSO` → `FINALIZADA`.

### Integration Tests

Tests in `backend/tests/` that end with `.api.test.ts` or `.integration.test.ts` require a running PostgreSQL instance (read from `backend/.env`). They use a dedicated schema (`jest_prisma_integration`) created in `globalSetup.ts` via `prisma db push`.

Unit tests (`.test.ts` files that are not `.api.` or `.integration.`) use `jest.unit.config.cjs` and need no database.

To run integration tests for a single scenario:
```bash
cd backend
npx jest --runInBand --config jest.config.cjs tests/session-resolution.api.test.ts
```

### Deployment

Production uses `docker-compose.prod.yml` with nginx serving the compiled frontend. The backend does not auto-migrate on start — run `prisma:migrate:deploy` manually before updating. PostgreSQL runs outside Docker; `DATABASE_URL` must use `host.docker.internal` when the DB is on the host machine.
