# CluEd Lab

Adaptación web multijugador en tiempo real del juego Cluedo. Los equipos se unen a una sesión mediante códigos de acceso; el Game Master controla el ciclo de vida de la partida desde un panel administrativo. El tablero es temático (CluEdSkins intercambiables), el movimiento sigue un grafo de nodos, y la partida se resuelve mediante sugerencias, refutaciones y una acusación final.

Stack: Express + Socket.IO (backend), React SPA (frontend), PostgreSQL vía Prisma, Docker Compose para desarrollo y producción.

## Requisitos

- Node.js 22
- PostgreSQL 14 o superior
- Docker y Docker Compose

## Variables de entorno

1. Copia [backend/.env.example](backend/.env.example) a `backend/.env`.
2. Define estos valores:
   - `ADMIN_USER`: usuario del Game Master.
   - `ADMIN_PASS_HASH`: hash bcrypt de la contraseña.
   - `JWT_SECRET`: secreto para firmar tokens JWT.
   - `DATABASE_URL`: cadena de conexión PostgreSQL usada por Prisma.
   - `ALLOWED_ORIGINS`: orígenes permitidos para el frontend.

Notas sobre `DATABASE_URL`:

- Fuera de Docker usa normalmente `localhost`.
- Dentro de Docker en Linux, si PostgreSQL vive en la máquina anfitriona, usa `host.docker.internal`.

Baseline recomendado para una base ya existente en la MV:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate:resolve -- --applied 20260417_scrum_13_skin_schema
```

### Generar un hash bcrypt

```bash
cd backend
node -e "import bcrypt from 'bcrypt'; bcrypt.hash('tu-contraseña', 10).then(console.log)"
```

Copia el resultado en `ADMIN_PASS_HASH`.

## Ejecución local sin Docker

### Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run build
npm run dev
```

Verifica salud:

```bash
curl http://localhost:4000/health
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Docker de desarrollo

Levanta backend y frontend con recarga en caliente:

```bash
docker compose up -d --build
```

Servicios publicados:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Parar servicios:

```bash
docker compose down
```

## Smoke test Docker Backend-PostgreSQL

```bash
cd backend
npm run test:docker-backend-postgres
```

La prueba levanta un PostgreSQL efímero y un backend en Docker, sincroniza el esquema Prisma sobre esa base vacía, hace login por HTTP, crea una CluEdSkin, reinicia el contenedor del backend y vuelve a leer la skin para verificar conectividad y persistencia reales.

## Demo automatizada de reparto

```bash
cd backend
npm run demo:deal -- --teams=6
```

Crea una skin de prueba, una sesión y los equipos indicados, y devuelve por JSON el código de acceso, el id de sesión y la mano privada de cada equipo. Acepta `--teams` entre `2` y `6`.

## Docker de despliegue

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Para la MV del laboratorio:

```bash
docker compose --env-file docker-compose.lab.env -f docker-compose.prod.yml up -d --build
```

Consulta [docs/despliegue-mv-pruebas.md](docs/despliegue-mv-pruebas.md) para el procedimiento completo y [docs/automatizacion-despliegue-mv.md](docs/automatizacion-despliegue-mv.md) para el despliegue automatizado vía GitHub Actions.

Puntos críticos:

- PostgreSQL queda fuera de `docker-compose.prod.yml`; si corre en la MV anfitriona, usa `host.docker.internal` en `DATABASE_URL`.
- `ALLOWED_ORIGINS` y `SOCKET_IO_CORS_ORIGIN` deben apuntar al DNS o IP pública real, no a `localhost`.
- El backend productivo no aplica migraciones al iniciar; ejecútalas manualmente con `npm run prisma:migrate:deploy` antes de actualizar.

Servicios publicados en la MV del laboratorio:

- Frontend desde fuera: `http://virtual.lab.inf.uva.es:20382`
- Backend solo en la MV: `http://127.0.0.1:4000`

Parar servicios:

```bash
docker compose -f docker-compose.prod.yml down
```

## Pruebas manuales de autenticación

1. Abre la portada en `http://localhost:5173` o `http://localhost:8080`.
2. Pulsa `Configurar CluEdSkin` o `Crear Sesión`.
3. Introduce el usuario definido en `ADMIN_USER` y la contraseña en claro asociada al hash de `ADMIN_PASS_HASH`.
4. Verifica que el login correcto redirige a `/config` (desde `Configurar CluEdSkin`) o a `/host` (desde `Crear Sesión`).
5. Intenta abrir `/config` sin token y confirma la redirección a `/`.
6. Repite con contraseña incorrecta y confirma el mensaje de error.
7. Pulsa `Salir` o `Cerrar sesión` y verifica que vuelves a la portada.

## Pruebas HTTP útiles

```bash
# Healthcheck
curl http://localhost:4000/health

# Login incorrecto (espera 401)
curl -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"incorrecta"}' \
  http://localhost:4000/api/auth/login

# Sesión sin token (espera 401)
curl http://localhost:4000/api/auth/session
```
