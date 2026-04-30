# Despliegue en MV de pruebas

Esta guia cubre el despliegue productivo actual en una MV Linux donde el frontend y el backend corren en Docker Compose, pero PostgreSQL permanece fuera de Docker en el host de la propia MV.

Se ha validado sobre la rama `develop` del repositorio. Si tu copia local tiene cambios sin confirmar, no la uses como fuente para la MV: clona o actualiza siempre desde remoto y configura el entorno directamente en la maquina virtual.

## Arquitectura esperada

- El punto de entrada publico es `http://IP_O_DNS_PUBLICO_DE_LA_MV:8080`.
- El contenedor `frontend` sirve la SPA compilada con nginx.
- nginx proxyea `/api` y `/socket.io` al servicio `backend` dentro de la red de Docker Compose.
- El contenedor `backend` lee sus variables reales desde `backend/.env`.
- El backend conecta con PostgreSQL del host Linux mediante `host.docker.internal:5432`.

Consecuencia importante: el origen permitido del backend debe ser la URL publica real del frontend, no `localhost`, para que REST y Socket.IO funcionen desde navegador al desplegar por IP o DNS de la MV.

## Alcance y fuera de alcance

Esta guia si cubre:

- Despliegue con `docker-compose.prod.yml`.
- Configuracion necesaria de PostgreSQL en el host Linux.
- Ejemplo completo de `backend/.env`.
- Alineacion previa de Prisma antes del primer arranque sobre una base ya existente.
- Verificaciones basicas con `curl` y revision de logs.

Esta guia no cubre:

- Aprovisionamiento de la MV.
- TLS o certificados.
- Reglas de firewall externas.
- Gestion de secretos del sistema operativo.

## Requisitos en la MV

- Docker Engine y plugin de Docker Compose.
- Acceso shell a la MV.
- Puerto `8080` accesible desde el cliente que vaya a abrir la aplicacion.
- PostgreSQL 14 o superior ejecutandose en el host Linux de la MV.
- Node.js 22 en la MV si vas a ejecutar comandos de Prisma directamente alli para alinear una base de datos existente.

## Preparar el repositorio en la MV

Trabaja siempre desde la raiz del repositorio. El archivo que usa el backend productivo es `backend/.env`; un `.env` en la raiz no afecta al contenedor del backend.

Si todavia no tienes el proyecto en la MV:

```bash
cd /home/usuario
git clone https://github.com/ivanzancajo/TFG-Cluedo.git TFG
cd TFG
git checkout develop
git pull origin develop
```

Si ya esta clonado:

```bash
cd /home/usuario/TFG
git checkout develop
git pull origin develop
```

Verifica el commit real que vas a desplegar:

```bash
git branch --show-current
git rev-parse --short HEAD
```

## Configurar PostgreSQL en el host Linux

1. Crea la base y el usuario si todavia no existen:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER cluedo_admin WITH PASSWORD 'TU_PASSWORD';
CREATE DATABASE cluedo_db OWNER cluedo_admin;
SQL
```

2. Haz que PostgreSQL escuche en una interfaz accesible desde Docker. En `postgresql.conf`, ajusta:

```conf
listen_addresses = '*'
port = 5432
```

3. Averigua la subred que usa Docker en la MV:

```bash
docker network inspect bridge --format '{{(index .IPAM.Config 0).Subnet}}'
```

4. Permite esa subred en `pg_hba.conf`. Ejemplo para la red bridge por defecto:

```conf
host    cluedo_db    cluedo_admin    172.17.0.0/16    scram-sha-256
```

5. Reinicia PostgreSQL y comprueba que escucha en `5432`:

```bash
sudo systemctl restart postgresql
sudo ss -ltnp | grep 5432
```

Notas:

- `host.docker.internal` solo resuelve dentro del contenedor porque [docker-compose.prod.yml](../docker-compose.prod.yml) anade `extra_hosts` con `host-gateway`.
- Si tu host usa una subred distinta a `172.17.0.0/16`, reemplaza la regla de `pg_hba.conf` por la real.
- Si `postgresql.conf` o `pg_hba.conf` estan en otra ruta segun la distro, aplica el mismo criterio en la ubicacion correcta.

## Ejemplo completo de backend/.env

Usa la IP o el DNS publico real de la MV en ambos origenes CORS:

```dotenv
PORT=4000
ADMIN_USER=admin
ADMIN_PASS_HASH=$2b$10$REEMPLAZA_ESTE_HASH_BCRYPT
JWT_SECRET=REEMPLAZA_ESTE_SECRETO
DATABASE_URL=postgresql://cluedo_admin:TU_PASSWORD@host.docker.internal:5432/cluedo_db?schema=public
ALLOWED_ORIGINS=http://203.0.113.25:8080
SOCKET_IO_CORS_ORIGIN=http://203.0.113.25:8080
```

Si despliegas con DNS o con TLS por delante, sustituye ambos origenes por la URL publica final, por ejemplo `https://cluedo.ejemplo.com`.

Si vas a exponer temporalmente la aplicacion con un tunel HTTPS saliente, incluye tambien ese origen en ambas variables, separado por comas. Ejemplo:

```dotenv
ALLOWED_ORIGINS=http://203.0.113.25:8080,https://tu-subdominio.trycloudflare.com
SOCKET_IO_CORS_ORIGIN=http://203.0.113.25:8080,https://tu-subdominio.trycloudflare.com
```

## Alineacion previa de Prisma en una base existente

El contenedor productivo del backend no ejecuta migraciones al arrancar. Antes del primer `docker compose up`, deja la base alineada manualmente.

### Caso A: base nueva o vacia

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
```

### Caso B: base ya existente

1. Haz una copia de seguridad de la base antes de tocar Prisma.
2. Instala dependencias y genera el cliente:

```bash
cd backend
npm install
npm run prisma:generate
```

3. Introspecciona la base actual para comparar su esquema real:

```bash
npm run prisma:pull
git diff -- prisma/schema.prisma
```

4. Si el esquema existente ya refleja las migraciones versionadas del repositorio, marca como aplicadas solo las migraciones que de verdad ya existan en esa base:

```bash
npm run prisma:migrate:resolve -- --applied 20260417_scrum_13_skin_schema
npm run prisma:migrate:resolve -- --applied 20260418_scrum15_add_motif_descripcion_elemento
npm run prisma:migrate:resolve -- --applied 20260418_scrum16_unique_team_color_per_session
npm run prisma:migrate:resolve -- --applied 20260420_scrum17_add_session_start_fields
npm run prisma:migrate:resolve -- --applied 20260425_scrum39_team_cards
```

5. Valida el esquema y aplica solo migraciones pendientes reales:

```bash
npm run prisma:validate
npm run prisma:migrate:deploy
```

Deten el despliegue si `prisma:pull` revela diferencias que no esperabas. Primero reconcilia la base real con [backend/prisma/schema.prisma](../backend/prisma/schema.prisma) y solo despues continua.

### Caso C: Prisma marca como fallida una migracion ya aplicada fisicamente

Si `npx prisma migrate status` marca como fallida `20260425_scrum39_team_cards`, pero la tabla `carta_equipo` ya existe con su clave primaria, indice y claves foraneas, no la borres si contiene datos. Primero inspecciona el estado real:

```bash
PGPASSWORD='TU_PASSWORD' psql -h 127.0.0.1 -p 5432 -U cluedo_admin -d cluedo_db -c "SELECT migration_name, started_at, finished_at, rolled_back_at, logs FROM _prisma_migrations WHERE migration_name = '20260425_scrum39_team_cards';"
PGPASSWORD='TU_PASSWORD' psql -h 127.0.0.1 -p 5432 -U cluedo_admin -d cluedo_db -c "\d+ carta_equipo"
PGPASSWORD='TU_PASSWORD' psql -h 127.0.0.1 -p 5432 -U cluedo_admin -d cluedo_db -c "SELECT COUNT(*) FROM carta_equipo;"
```

Si la estructura ya coincide con [backend/prisma/migrations/20260425_scrum39_team_cards/migration.sql](../backend/prisma/migrations/20260425_scrum39_team_cards/migration.sql), marca la migracion como aplicada y vuelve a comprobar el estado:

```bash
cd backend
export DATABASE_URL='postgresql://cluedo_admin:TU_PASSWORD@127.0.0.1:5432/cluedo_db?schema=public'
npx prisma migrate resolve --applied 20260425_scrum39_team_cards
npx prisma migrate status
unset DATABASE_URL
```

Solo usa `--rolled-back` y vuelve a desplegar la migracion si la tabla no existe o si la migracion quedo a medias sin datos utiles.

## Despliegue con Docker Compose

Todos los comandos `docker compose -f docker-compose.prod.yml ...` se ejecutan desde la raiz del repositorio, por ejemplo `/home/usuario/TFG`.

1. Prepara el entorno real del backend:

```bash
cp backend/.env.example backend/.env
```

2. Edita `backend/.env` con tus valores reales.

3. Construye y levanta los servicios:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

4. Comprueba el estado:

```bash
docker compose -f docker-compose.prod.yml ps
```

La entrada publica para usuarios debe ser siempre `http://IP_O_DNS_PUBLICO_DE_LA_MV:8080`. Aunque el backend publica `4000`, el frontend productivo esta pensado para trabajar same-origin a traves de nginx.

## Alternativa si la red de la MV no es alcanzable desde el cliente

Si la MV funciona internamente pero no puedes abrir `http://IP_O_DNS_PUBLICO_DE_LA_MV:8080` desde tu equipo cliente, puedes levantar un tunel HTTPS saliente temporal sin tocar la red del hipervisor. El caso mas practico validado ha sido Cloudflare Tunnel.

1. Arranca el tunel desde la MV:

```bash
docker run --rm --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:8080
```

2. Espera a que imprima una URL publica del tipo `https://algo.trycloudflare.com`.
3. Anade esa URL a `ALLOWED_ORIGINS` y `SOCKET_IO_CORS_ORIGIN` dentro de `backend/.env`.
4. Recrea solo el backend para recargar CORS:

```bash
cd /home/usuario/TFG
docker compose -f docker-compose.prod.yml up -d --force-recreate backend
```

5. Valida la URL del tunel desde el cliente:

```bash
curl -I --max-time 15 https://tu-subdominio.trycloudflare.com
curl -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"incorrecta"}' \
  https://tu-subdominio.trycloudflare.com/api/auth/login
curl -i "https://tu-subdominio.trycloudflare.com/socket.io/?EIO=4&transport=polling"
```

Mantén vivo el proceso o contenedor de `cloudflared`: cuando se detiene, la URL deja de ser valida.

## Verificaciones con curl

### Healthcheck del backend desde la MV

```bash
curl http://127.0.0.1:4000/health
```

Debes recibir un JSON con el estado del servidor.

### Proxy REST desde la URL publica del frontend

```bash
curl -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"incorrecta"}' \
  http://IP_O_DNS_PUBLICO_DE_LA_MV:8080/api/auth/login
```

Debes recibir `401`, lo cual confirma que nginx esta reenviando `/api` al backend.

### Proxy Socket.IO a traves de nginx

```bash
curl -i "http://IP_O_DNS_PUBLICO_DE_LA_MV:8080/socket.io/?EIO=4&transport=polling"
```

Debes ver una respuesta `200` con el payload inicial del handshake de Socket.IO.

## Verificaciones con logs

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=100
docker compose -f docker-compose.prod.yml logs frontend --tail=100
```

Pistas utiles:

- Si el backend no arranca, revisa primero `DATABASE_URL`, conectividad a `host.docker.internal:5432` y estado de Prisma.
- Si la SPA carga pero fallan las peticiones del navegador, revisa `ALLOWED_ORIGINS` y `SOCKET_IO_CORS_ORIGIN` contra la URL publica real de la MV.
- Si `/api` funciona pero `socket.io` no, confirma que el acceso se hace por la URL publica del frontend en `8080` y no llamando al backend por otra origin distinta.
- Si la app funciona dentro de la MV pero no desde el cliente, el problema ya no es Docker: revisa si la red del laboratorio publica la IP de la MV o usa la alternativa del tunel HTTPS temporal.