# Despliegue en MV de pruebas

Esta guia cubre el despliegue productivo actual en una MV Linux donde el frontend y el backend corren en Docker Compose, pero PostgreSQL permanece fuera de Docker en el host de la propia MV.

Para la MV del laboratorio con acceso publico en `virtual.lab.inf.uva.es`, puerto SSH `20381` y publicacion web `20382 -> 80` (y `20383 -> 443`), el script de despliegue configura automaticamente nginx en el host con TLS y redireccion HTTP → HTTPS.

Si quieres dejar el despliegue reproducible para futuras actualizaciones y automatizarlo con GitHub Actions, usa [scripts/deploy-mv.sh](../scripts/deploy-mv.sh) y la guia de [docs/automatizacion-despliegue-mv.md](./automatizacion-despliegue-mv.md).

Se ha validado sobre la rama `develop` del repositorio. Si tu copia local tiene cambios sin confirmar, no la uses como fuente para la MV: clona o actualiza siempre desde remoto y configura el entorno directamente en la maquina virtual.

## Arquitectura esperada

- El punto de entrada publico es `https://virtual.lab.inf.uva.es` (puerto 443 estandar, accesible desde Eduroam).
- Una peticion HTTP a `http://virtual.lab.inf.uva.es` recibe un `301` automatico a HTTPS.
- El nginx del host (Ubuntu, fuera de Docker) termina TLS en el puerto 443 y proxea `/api`, `/socket.io` y `/` a los contenedores internos.
- El contenedor `frontend` sirve unicamente ficheros estaticos en `127.0.0.1:8080`.
- El contenedor `backend` escucha en `127.0.0.1:4000`.
- El backend conecta con PostgreSQL del host Linux mediante `host.docker.internal:5432`.
- El certificado TLS lo gestiona certbot (Let's Encrypt) si se define `CERTBOT_EMAIL`; en caso contrario se usa un certificado autofirmado y el navegador mostrara una advertencia.

Consecuencia importante: los origenes CORS deben usar `https://virtual.lab.inf.uva.es` (sin numero de puerto).

## Alcance y fuera de alcance

Esta guia si cubre:

- Despliegue con `docker-compose.prod.yml`.
- Configuracion necesaria de PostgreSQL en el host Linux.
- Ejemplo completo de `backend/.env`.
- Alineacion previa de Prisma antes del primer arranque sobre una base ya existente.
- Verificaciones basicas con `curl` y revision de logs.

Esta guia no cubre:

- Aprovisionamiento de la MV.
- Configuracion inicial del cortafuegos para abrir los puertos 80 y 443.
- Reglas de firewall externas.
- Gestion de secretos del sistema operativo.

## Requisitos en la MV

- Docker Engine y plugin de Docker Compose.
- Acceso shell a la MV.
- Puertos `80` y `443` accesibles desde el exterior (el laboratorio los expone directamente).
- nginx instalado en el host (`apt install nginx`); el script instala certbot automaticamente si falta.
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

Con esto, Docker publica el frontend solo en `127.0.0.1:8080` (inaccesible desde fuera del host). El nginx del host lo proxea en HTTPS y lo expone como `https://virtual.lab.inf.uva.es:20382`, y el backend queda igualmente restringido a `127.0.0.1:4000`.

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

Usa `https://` sin numero de puerto (el puerto 443 es el estandar HTTPS):

```dotenv
PORT=4000
ADMIN_USER=admin
ADMIN_PASS_HASH=$2b$10$REEMPLAZA_ESTE_HASH_BCRYPT
JWT_SECRET=REEMPLAZA_ESTE_SECRETO
DATABASE_URL=postgresql://cluedo_admin:TU_PASSWORD@host.docker.internal:5432/cluedo_db?schema=public
ALLOWED_ORIGINS=https://virtual.lab.inf.uva.es
SOCKET_IO_CORS_ORIGIN=https://virtual.lab.inf.uva.es
FRONTEND_HOST_IP=127.0.0.1
FRONTEND_PUBLISHED_PORT=8080
BACKEND_HOST_IP=127.0.0.1
BACKEND_PUBLISHED_PORT=4000
# CERTBOT_EMAIL=tu@email.com
```

Si vas a exponer temporalmente la aplicacion con un tunel HTTPS saliente, incluye tambien ese origen en ambas variables, separado por comas. Ejemplo:

```dotenv
ALLOWED_ORIGINS=https://virtual.lab.inf.uva.es,https://tu-subdominio.trycloudflare.com
SOCKET_IO_CORS_ORIGIN=https://virtual.lab.inf.uva.es,https://tu-subdominio.trycloudflare.com
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

## Acceso desde Eduroam: Cloudflare Named Tunnel

El puerto 20382 asignado por el laboratorio es no estandar y Eduroam lo bloquea antes de que el trafico llegue a nginx. La solucion es un tunel saliente: cloudflared abre una conexion desde la MV hacia la red de Cloudflare y publica la app en una URL HTTPS en el puerto 443, que Eduroam si permite. Al ser una conexion saliente no es necesario abrir puertos adicionales en el laboratorio.

Este proceso se hace una sola vez. El token generado se guarda como secreto en GitHub y en `.deploy/mv.backend.env` para que cada despliegue automatico arranque el tunel y configure CORS correctamente.

### Configuracion inicial del tunel (una sola vez)

1. Crea una cuenta gratuita en cloudflare.com.
2. Instala `cloudflared` en la MV (descarga desde la documentacion oficial de Cloudflare).
3. Autentica cloudflared con tu cuenta: `cloudflared tunnel login`
4. Crea el tunel: `cloudflared tunnel create cluedo-tfg`
5. En el Cloudflare Dashboard, ve al tunel creado y añade un Public Hostname que apunte a `http://localhost:80` (HTTP, sin TLS entre cloudflared y nginx).
6. Obtén el token del tunel: `cloudflared tunnel token cluedo-tfg`
7. Anota la URL publica asignada al tunel (del tipo `https://cluedo-tfg.tudominio.workers.dev` o la que hayas configurado).

### Añadir el token y la URL al entorno de despliegue

En la MV, edita `.deploy/mv.backend.env` y añade al final:

```dotenv
CLOUDFLARE_TUNNEL_TOKEN=<token obtenido en el paso 6>
CLOUDFLARE_TUNNEL_URL=https://<subdominio>.workers.dev
```

En GitHub → Settings del repositorio:

- **Secrets** → añade `CLOUDFLARE_TUNNEL_TOKEN` con el mismo token.
- **Variables** → añade `CLOUDFLARE_TUNNEL_URL` con la URL publica del tunel.

### Como funciona en cada despliegue

El script `deploy-mv.sh` detecta que `CLOUDFLARE_TUNNEL_TOKEN` esta definido y:

1. Añade `CLOUDFLARE_TUNNEL_URL` a `ALLOWED_ORIGINS` y `SOCKET_IO_CORS_ORIGIN` del backend.
2. Activa el perfil `tunnel` de Docker Compose, que arranca el servicio `cloudflared`.
3. El servicio `cloudflared` se conecta automaticamente al tunel nombrado usando el token.

Tras el despliegue la app queda accesible en la URL del tunel desde cualquier red, incluida Eduroam.

### Verificacion desde Eduroam

```bash
curl -I https://<url-del-tunel>
curl -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"incorrecta"}' \
  https://<url-del-tunel>/api/auth/login   # debe devolver 401
curl -i "https://<url-del-tunel>/socket.io/?EIO=4&transport=polling"   # debe devolver 200
```

---

## Alternativa temporal si el tunel nombrado no esta configurado

Si la MV funciona internamente pero no puedes abrir `http://IP_O_DNS_PUBLICO_DE_LA_MV:8080` desde tu equipo cliente, puedes levantar un tunel HTTPS saliente temporal sin tocar la red del hipervisor. El caso mas practico validado ha sido Cloudflare Tunnel en modo quick tunnel (sin cuenta).

1. Arranca el tunel desde la MV:

```bash
docker run --rm --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:80
```

2. Espera a que imprima una URL publica del tipo `https://algo.trycloudflare.com`.
3. Anade esa URL a `ALLOWED_ORIGINS` y `SOCKET_IO_CORS_ORIGIN` dentro de `backend/.env`.
4. Recrea solo el backend para recargar CORS:

```bash
cd /home/usuario/TFG
docker compose --env-file docker-compose.lab.env -f docker-compose.prod.yml up -d --force-recreate backend
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

Si `cloudflared` falla al crear el quick tunnel o la MV no tiene escritorio grafico, usa un tunel SSH local desde tu equipo cliente hasta el puerto `80` de la MV. Si el laboratorio publica SSH por un puerto alternativo, añade `-p`:

```bash
ssh -N -L 8080:127.0.0.1:80 usuario@IP_O_HOST_DE_LA_MV
# Ejemplo con puerto SSH no estandar:
ssh -p 20381 -N -L 8080:127.0.0.1:80 usuario@virtual.lab.inf.uva.es
```

En ese caso, abre `http://127.0.0.1:8080` en el navegador de tu equipo cliente. Si el navegador accede por `localhost` o `127.0.0.1`, recuerda incluir temporalmente esos origenes en `ALLOWED_ORIGINS` y `SOCKET_IO_CORS_ORIGIN` antes de recrear el backend.

## Verificaciones con curl

### Healthcheck del backend desde la MV

```bash
curl http://127.0.0.1:4000/health
```

Debes recibir un JSON con el estado del servidor.

### Redireccion HTTP → HTTPS

```bash
curl -I http://virtual.lab.inf.uva.es/
```

Debes recibir `301 Moved Permanently` con `Location: https://virtual.lab.inf.uva.es/`.

### Proxy REST desde la URL publica del frontend

```bash
# Con certificado Let's Encrypt no se necesita -k; con autofirmado añadelo
curl -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"incorrecta"}' \
  https://virtual.lab.inf.uva.es/api/auth/login
```

Debes recibir `401`, lo cual confirma que nginx esta reenviando `/api` al backend.

### Proxy Socket.IO a traves de nginx

```bash
curl -i "https://virtual.lab.inf.uva.es/socket.io/?EIO=4&transport=polling"
```

Debes ver una respuesta `200` con el payload inicial del handshake de Socket.IO.

### Verificacion visual desde un navegador externo

Una vez validados `GET /health`, `POST /api/auth/login`, `GET /api/config/skins` y `socket.io`, abre un navegador en `https://virtual.lab.inf.uva.es`. Con certificado Let's Encrypt la conexion es segura sin advertencias; con autofirmado aparecera "La conexion no es privada" la primera vez.

Checklist minimo:

- `http://virtual.lab.inf.uva.es` redirige automaticamente a `https://`.
- La portada carga en `https://virtual.lab.inf.uva.es`.
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
