# Despliegue en MV de pruebas

Esta guia cubre el despliegue productivo actual en una MV Linux donde el frontend y el backend corren en Docker Compose, pero PostgreSQL permanece fuera de Docker en el host de la propia MV.

Para la MV del laboratorio con acceso publico en `virtual.lab.inf.uva.es`, puerto SSH `20381` y publicacion web `20382 -> 80` (y `20383 -> 443`), el script de despliegue configura automaticamente nginx en el host como proxy inverso HTTP y, opcionalmente, activa un Cloudflare Tunnel para acceso desde redes con puertos no estandar bloqueados (Eduroam).

Si quieres dejar el despliegue reproducible para futuras actualizaciones y automatizarlo con GitHub Actions, usa [scripts/deploy-mv.sh](../scripts/deploy-mv.sh) y la guia de [docs/automatizacion-despliegue-mv.md](./automatizacion-despliegue-mv.md).

Se ha validado sobre la rama `develop` del repositorio. Si tu copia local tiene cambios sin confirmar, no la uses como fuente para la MV: clona o actualiza siempre desde remoto y configura el entorno directamente en la maquina virtual.

## Arquitectura esperada

- El punto de entrada fuera de Eduroam es `http://virtual.lab.inf.uva.es:20382` (HTTP, NAT lab: externo `:20382` → VM:80).
- El nginx del host (Ubuntu, fuera de Docker) escucha en el puerto 80 y proxea directamente `/api`, `/socket.io` y `/` a los contenedores internos sin redireccion HTTPS.
- El puerto 443 (externo `:20383`) esta disponible con un certificado autofirmado; el navegador mostrara advertencia de seguridad porque Let's Encrypt no puede validar el dominio via HTTP-01 a traves del NAT del laboratorio.
- El contenedor `frontend` sirve unicamente ficheros estaticos en `127.0.0.1:8080`.
- El contenedor `backend` escucha en `127.0.0.1:4000`.
- El backend conecta con PostgreSQL del host Linux mediante `host.docker.internal:5432`.
- Para acceso desde Eduroam se usa un Cloudflare Named Tunnel: `cloudflared` corre como contenedor Docker con el perfil `tunnel` y abre una conexion saliente hacia Cloudflare, que publica la app en una URL HTTPS con certificado valido accesible en el puerto 443 estandar.

Consecuencia importante: los origenes CORS deben incluir `http://virtual.lab.inf.uva.es:20382` y, si el tunnel esta activo, tambien la URL del tunnel.

## Alcance y fuera de alcance

Esta guia si cubre:

- Despliegue con `docker-compose.prod.yml`.
- Configuracion necesaria de PostgreSQL en el host Linux.
- Ejemplo completo de `backend/.env`.
- Alineacion previa de Prisma antes del primer arranque sobre una base ya existente.
- Verificaciones basicas con `curl` y revision de logs.

Esta guia no cubre:

- Aprovisionamiento de la MV.
- Configuracion inicial del cortafuegos del host.
- Reglas de firewall externas.
- Gestion de secretos del sistema operativo.

## Requisitos en la MV

- Docker Engine y plugin de Docker Compose.
- Acceso shell a la MV.
- nginx instalado en el host (`apt install nginx`); el script lo instala automaticamente si falta.
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

## Configurar la publicacion de puertos para el laboratorio

La publicacion de puertos del despliegue productivo se controla desde variables de Compose en [docker-compose.prod.yml](../docker-compose.prod.yml). Para esta MV, usa el ejemplo preparado en la raiz del repo:

```bash
cd /home/usuario/TFG
cp docker-compose.lab.env.example docker-compose.lab.env
```

El archivo resultante debe dejar estos valores:

```dotenv
FRONTEND_HOST_IP=127.0.0.1
FRONTEND_PUBLISHED_PORT=8080
BACKEND_HOST_IP=127.0.0.1
BACKEND_PUBLISHED_PORT=4000
```

Con esto, Docker publica el frontend solo en `127.0.0.1:8080` (inaccesible desde fuera del host). El nginx del host lo proxea en HTTP y lo expone como `http://virtual.lab.inf.uva.es:20382`, y el backend queda igualmente restringido a `127.0.0.1:4000`.

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

3. Averigua la subred real que usa el despliegue de Docker Compose en la MV. En este proyecto suele ser `tfg_default`:

```bash
docker network inspect tfg_default --format '{{(index .IPAM.Config 0).Subnet}}'
```

Si la red tiene otro nombre, lista primero las redes y luego inspecciona la correcta:

```bash
docker network ls
```

4. Permite esa subred en `pg_hba.conf`. Ejemplo para una red Compose real:

```conf
host    cluedo_db    cluedo_admin    172.18.0.0/16    scram-sha-256
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
- Si `/health` y `/api/auth/login` responden pero `/api/config/skins` devuelve `500`, sospecha primero de `pg_hba.conf`: el backend puede arrancar sin tocar la base y fallar solo al primer acceso real a PostgreSQL.

## Ejemplo completo de backend/.env

El origen CORS usa `http://` con el puerto externo `20382` (NAT lab: externo `:20382` → VM:80):

```dotenv
PORT=4000
ADMIN_USER=admin
ADMIN_PASS_HASH=$2b$10$REEMPLAZA_ESTE_HASH_BCRYPT
JWT_SECRET=REEMPLAZA_ESTE_SECRETO
DATABASE_URL=postgresql://cluedo_admin:TU_PASSWORD@host.docker.internal:5432/cluedo_db?schema=public
ALLOWED_ORIGINS=http://virtual.lab.inf.uva.es:20382
SOCKET_IO_CORS_ORIGIN=http://virtual.lab.inf.uva.es:20382
FRONTEND_HOST_IP=127.0.0.1
FRONTEND_PUBLISHED_PORT=8080
BACKEND_HOST_IP=127.0.0.1
BACKEND_PUBLISHED_PORT=4000
# CLOUDFLARE_TUNNEL_TOKEN=<token-del-tunel>
# CLOUDFLARE_TUNNEL_URL=https://<subdominio>.workers.dev
```

Cuando el tunnel esta activo el script añade `CLOUDFLARE_TUNNEL_URL` automaticamente a `ALLOWED_ORIGINS`, por lo que no hace falta editarlo a mano.

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

Todos los comandos `docker compose --env-file docker-compose.lab.env -f docker-compose.prod.yml ...` se ejecutan desde la raiz del repositorio, por ejemplo `/home/usuario/TFG`.

1. Prepara el entorno real del backend:

```bash
cp backend/.env.example backend/.env
```

2. Edita `backend/.env` con tus valores reales.

3. Construye y levanta los servicios:

```bash
docker compose --env-file docker-compose.lab.env -f docker-compose.prod.yml up -d --build
```

4. Comprueba el estado:

```bash
docker compose --env-file docker-compose.lab.env -f docker-compose.prod.yml ps
```

La entrada publica para usuarios debe ser siempre `http://virtual.lab.inf.uva.es:20382`. Aunque el backend publica `4000`, en esta MV queda ligado a `127.0.0.1` y el frontend productivo sigue trabajando same-origin a traves de nginx.

## Script reproducible de despliegue

Una vez validado el despliegue manual inicial, puedes convertirlo en un flujo reproducible dentro de la propia MV:

```bash
cd /home/usuario/TFG
mkdir -p .deploy
cp deploy/mv.backend.env.example .deploy/mv.backend.env
chmod 600 .deploy/mv.backend.env
bash scripts/deploy-mv.sh
```

El script:

- regenera `backend/.env` y `docker-compose.lab.env`
- deduplica la regla exacta de `pg_hba.conf` para la subred de Docker Compose
- ejecuta Prisma desde el host
- levanta los contenedores y valida `health`, proxy HTTP y Socket.IO

Para automatizarlo desde GitHub Actions por SSH, consulta [docs/automatizacion-despliegue-mv.md](./automatizacion-despliegue-mv.md).

## Acceso desde Eduroam: Cloudflare Tunnel

El puerto 20382 asignado por el laboratorio es no estandar y Eduroam lo bloquea. La solucion es un tunnel de Cloudflare: `cloudflared` corre como contenedor Docker (perfil `tunnel` de `docker-compose.prod.yml`) y abre una conexion saliente hacia Cloudflare, que publica la app en una URL HTTPS con certificado valido accesible en el puerto 443 estandar. No hace falta abrir puertos adicionales en el laboratorio.

Hay dos variantes segun si tienes dominio propio en Cloudflare:

### Opcion A — Quick Tunnel (sin cuenta ni dominio)

La mas sencilla. Cloudflare asigna una URL del tipo `https://palabras-random.trycloudflare.com` al arrancar el contenedor. La URL es estable mientras el contenedor no se reinicie.

En la MV, edita `.deploy/mv.backend.env` y descomenta:

```dotenv
CLOUDFLARE_QUICK_TUNNEL=true
```

El script `deploy-mv.sh` detecta esta variable y:

1. Levanta los contenedores con `--profile tunnel`, arrancando `cloudflared` en modo Quick Tunnel (`--url http://localhost:80`).
2. Espera hasta 45 segundos a que el contenedor emita su URL en los logs.
3. Añade la URL a `ALLOWED_ORIGINS` y `SOCKET_IO_CORS_ORIGIN` en `backend/.env`.
4. Reinicia solo el contenedor `backend` para que aplique el nuevo CORS.

Al terminar el despliegue el log muestra la URL asignada. Si el contenedor se reinicia, la URL cambia: vuelve a ejecutar `deploy-mv.sh` para que el script la detecte y actualice CORS automaticamente.

### Opcion B — Named Tunnel (cuenta gratuita de Cloudflare + dominio, URL estable)

Requiere un dominio gestionado en Cloudflare DNS. Ofrece una URL fija que no cambia en reinicios.

1. En el Cloudflare Dashboard → Zero Trust → Networks → Tunnels, crea un tunnel.
2. Añade un **Public Hostname** apuntando a `http://localhost:80`.
3. Copia el **token** del tunnel.
4. En la MV, edita `.deploy/mv.backend.env` y descomenta:

```dotenv
CLOUDFLARE_TUNNEL_TOKEN=<token-del-tunel>
CLOUDFLARE_TUNNEL_URL=https://<public-hostname-configurado>
```

El script inyecta `CLOUDFLARE_TUNNEL_URL` en `ALLOWED_ORIGINS` antes de arrancar el backend y activa el contenedor `cloudflared` con el token.

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
  http://virtual.lab.inf.uva.es:20382/api/auth/login
```

Debes recibir `401`, lo cual confirma que nginx esta reenviando `/api` al backend.

### Proxy Socket.IO a traves de nginx

```bash
curl -i "http://virtual.lab.inf.uva.es:20382/socket.io/?EIO=4&transport=polling"
```

Debes ver una respuesta `200` con el payload inicial del handshake de Socket.IO.

### Verificacion desde la URL del Cloudflare Tunnel (Eduroam)

```bash
curl -I https://<url-del-tunel>
curl -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"incorrecta"}' \
  https://<url-del-tunel>/api/auth/login   # debe devolver 401
curl -i "https://<url-del-tunel>/socket.io/?EIO=4&transport=polling"   # debe devolver 200
```

### Verificacion visual desde un navegador externo

Abre un navegador en `http://virtual.lab.inf.uva.es:20382` (fuera de Eduroam) o en la URL del tunnel (Eduroam).

Checklist minimo:

- La portada carga correctamente.
- El login de administrador funciona.
- En `Configurar CluedoSkin` aparecen skins remotas.
- En `Crear sesion` aparecen skins remotas.
- Se puede crear una sesion y llegar al lobby.
- Dos equipos pueden unirse y el lobby se actualiza en tiempo real.
- La partida puede iniciarse desde el host.

## Verificaciones con logs

```bash
docker compose --env-file docker-compose.lab.env -f docker-compose.prod.yml logs backend --tail=100
docker compose --env-file docker-compose.lab.env -f docker-compose.prod.yml logs frontend --tail=100
```

Pistas utiles:

- Si el backend no arranca, revisa primero `DATABASE_URL`, conectividad a `host.docker.internal:5432` y estado de Prisma.
- Si la SPA carga pero fallan las peticiones del navegador, revisa que `ALLOWED_ORIGINS` y `SOCKET_IO_CORS_ORIGIN` usen `https://` y el puerto correcto.
- Si `/api` funciona pero `socket.io` no, confirma que el acceso se hace por la URL publica del frontend en `20382` y no llamando al backend por otra origin distinta.
- Si la app funciona dentro de la MV pero no desde el cliente, el problema ya no es Docker: revisa si la red del laboratorio publica la IP de la MV o usa la alternativa del tunel HTTPS temporal.
