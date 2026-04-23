# Cluedo Online

Guia minima para levantar, validar y probar la autenticacion del administrador desde el frontend, tanto en desarrollo como en despliegue con Docker.

## Requisitos

- Node.js 22
- PostgreSQL 14 o superior para desarrollo local o una instancia accesible desde la MV
- Docker y Docker Compose

## Variables de entorno

1. Copia [backend/.env.example](backend/.env.example) a `backend/.env`.
2. Define estos valores:
   - `ADMIN_USER`: usuario del Game Master.
   - `ADMIN_PASS_HASH`: hash bcrypt de la contraseña.
   - `JWT_SECRET`: secreto para firmar tokens.
  - `DATABASE_URL`: cadena de conexion PostgreSQL usada por Prisma.
   - `ALLOWED_ORIGINS`: orígenes permitidos para el frontend.

Notas sobre `DATABASE_URL`:

- Fuera de Docker usa normalmente `localhost`.
- Dentro de Docker en Linux, si PostgreSQL vive en la maquina anfitriona, usa `host.docker.internal`.
- En una base ya existente, conviene revisar primero el esquema real con `npm run prisma:pull` antes de aplicar cambios adicionales.

Baseline recomendado para una base ya existente en la MV:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate:resolve -- --applied 20260417_scrum_13_skin_schema
```

Con esto marcas la migracion inicial como ya aplicada en la base remota antes de introducir migraciones nuevas.

### Generar un hash bcrypt

Ejemplo con la contraseña `cluedo-admin-2026`:

```bash
cd backend
node -e "import bcrypt from 'bcrypt'; bcrypt.hash('cluedo-admin-2026', 10).then(console.log)"
```

Copia el resultado en `ADMIN_PASS_HASH`.

## Ejecucion local sin Docker

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

1. Copia [frontend/.env.example](frontend/.env.example) a `frontend/.env` si quieres fijar la URL del backend.
2. Arranca el frontend:

```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Docker de desarrollo

Levanta backend y frontend con recarga:

```bash
docker compose up -d --build
```

El backend incluye la resolucion de `host.docker.internal` para poder alcanzar PostgreSQL si la base corre en la propia MV fuera de Docker.

Servicios publicados:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Parar servicios:

```bash
docker compose down
```

## Smoke test Docker Backend-PostgreSQL

Para validar SCRUM-37 con una prueba automatizada real entre contenedores:

```bash
cd backend
npm run test:docker-backend-postgres
```

La prueba levanta un PostgreSQL efímero y un backend en Docker, sincroniza el esquema Prisma sobre esa base vacía, hace login por HTTP, crea una CluedoSkin, reinicia el contenedor del backend y vuelve a leer la skin para verificar conectividad y persistencia reales.

## Docker de despliegue

Construye y levanta el frontend compilado con nginx y el backend en modo productivo:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

En despliegue, la `DATABASE_URL` del backend debe apuntar a PostgreSQL usando el host adecuado para el entorno. Si la base corre en la MV anfitriona fuera de Docker, usa `host.docker.internal` en lugar de `localhost`.

Servicios publicados:

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:4000`

Parar servicios:

```bash
docker compose -f docker-compose.prod.yml down
```

## Pruebas manuales de autenticacion

1. Abre la portada en `http://localhost:5173` o `http://localhost:8080`.
2. Pulsa `Configurar CluedoSkin` o `Crear Sesión`.
3. Introduce el usuario definido en `ADMIN_USER` y la contraseña en claro asociada al hash de `ADMIN_PASS_HASH`.
4. Verifica que el login correcto te redirige a la pantalla administrativa solicitada: `/config` si accediste desde `Configurar CluedoSkin` o `/host` si accediste desde `Crear Sesión`.
5. Intenta abrir `http://localhost:5173/config` o `http://localhost:8080/config` sin token y confirma la redirección a `/`.
6. Repite la prueba con una contraseña incorrecta y confirma el mensaje de error.
7. Desde la vista de administración o de creación de sesión, pulsa `Salir` o `Cerrar sesión` y verifica que vuelves a la portada.

## Pruebas HTTP utiles

### Healthcheck

```bash
curl http://localhost:4000/health
```

### Login incorrecto

```bash
curl -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"incorrecta"}' \
  http://localhost:4000/api/auth/login
```

### Sesion sin token

```bash
curl http://localhost:4000/api/auth/session
```

### Login a traves del proxy de despliegue

```bash
curl -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"incorrecta"}' \
  http://localhost:8080/api/auth/login
```

## Estado validado

- Build local del backend: correcto.
- Build local del frontend: correcto.
- Build Docker de desarrollo: correcto.
- Build Docker de despliegue: correcto.
- Respuesta de `401` ante login incorrecto: correcta.
- Respuesta de `401` ante acceso a sesion sin token: correcta.

La validacion de login correcto requiere conocer la contraseña en claro que corresponde al hash activo del archivo `backend/.env`.