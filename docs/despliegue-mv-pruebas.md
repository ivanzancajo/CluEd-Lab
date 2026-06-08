# Despliegue en MV de pruebas

Esta guia cubre el despliegue productivo actual en una MV Linux donde el frontend y el backend corren en Docker Compose, pero PostgreSQL permanece fuera de Docker en el host de la propia MV.

Para la MV del laboratorio con acceso publico en `virtual.lab.inf.uva.es`, puerto SSH `20381` y publicacion web `20382 -> 80` (y `20383 -> 443`), el script de despliegue configura automaticamente nginx en el host como proxy inverso HTTP y, opcionalmente, activa un Cloudflare Tunnel para acceso desde redes con puertos no estandar bloqueados (Eduroam).

Si quieres dejar el despliegue reproducible para futuras actualizaciones y automatizarlo con GitHub Actions, usa [scripts/deploy-mv.sh](../scripts/deploy-mv.sh) y la guia de [docs/automatizacion-despliegue-mv.md](./automatizacion-despliegue-mv.md).

Se ha validado sobre la rama `develop` del repositorio. Si tu copia local tiene cambios sin confirmar, no la uses como fuente para la MV: clona o actualiza siempre desde remoto y configura el entorno directamente en la maquina virtual.

## Arquitectura esperada

- El punto de entrada fuera de Eduroam es `https://virtual.lab.inf.uva.es:20382` (HTTPS, NAT lab: externo `:20382` → VM:80). El navegador mostrara una advertencia de certificado autofirmado en el primer acceso; se puede continuar haciendo clic en "Avanzado".
- El nginx del host (Ubuntu, fuera de Docker) escucha en el puerto 80 con TLS (cert autofirmado) y proxea `/api`, `/socket.io` y `/` a los contenedores internos. El Cloudflare Tunnel usa el puerto interno `8081` (HTTP, solo loopback) para no interferir con el TLS del puerto 80.
- El puerto 443 (externo `:20383`) tambien sirve HTTPS con el mismo certificado autofirmado.
- El contenedor `frontend` sirve unicamente ficheros estaticos en `127.0.0.1:8080`.
- El contenedor `backend` escucha en `127.0.0.1:4000`.
- El backend conecta con PostgreSQL del host Linux mediante `host.docker.internal:5432`.
- Para acceso desde Eduroam se usa un Cloudflare Named Tunnel: `cloudflared` corre como contenedor Docker con el perfil `tunnel` y abre una conexion saliente hacia Cloudflare, que publica la app en una URL HTTPS con certificado valido accesible en el puerto 443 estandar.

Consecuencia importante: los origenes CORS deben incluir `https://virtual.lab.inf.uva.es:20382` y, si el tunnel esta activo, tambien la URL del tunnel.

## Via de acceso recomendada: Cloudflare Tunnel para todos los usuarios

El acceso directo por `https://virtual.lab.inf.uva.es:20382` tiene dos limitaciones que NO se pueden resolver configurando la MV:

1. **Eduroam lo bloquea.** El puerto publico `20382` (y `20383`) es no estandar; el cortafuegos de salida de Eduroam descarta el trafico antes de que llegue a la MV. Ningun ajuste de nginx lo abre.
2. **Muestra "sitio no seguro".** El certificado es autofirmado (lo genera `scripts/deploy-mv.sh` con `openssl`). El trafico va cifrado, pero el navegador no confia en el porque no lo emite una CA reconocida. Bajo el NAT del laboratorio no es posible obtener un certificado valido: Let's Encrypt HTTP-01 necesita el puerto 80 estandar publico (solo hay `20382→80`), DNS-01 exige controlar la zona DNS de `uva.es` (es de la universidad) y TLS-ALPN-01 necesita el 443 estandar publico. La advertencia es inherente a este path.

Por eso **se recomienda usar el Cloudflare Named Tunnel como entrada canonica para todos los usuarios** (dentro y fuera de Eduroam), no solo como parche de Eduroam. El tunnel resuelve ambos problemas a la vez: sale por el 443 estandar (Eduroam lo permite) y Cloudflare sirve un **certificado de confianza valido en su propio edge**, sin advertencia de navegador. El acceso directo `:20382` queda como via de respaldo en LAN/depuracion, asumiendo la advertencia del certificado autofirmado.

| | `:20382` directo | Cloudflare Named Tunnel |
|---|---|---|
| Funciona desde Eduroam | No (puerto bloqueado) | Si (sale por 443 estandar) |
| Certificado de confianza | No (advertencia) | Si (cert valido de Cloudflare) |
| URL estable | Si | Si (Named Tunnel) |

La configuracion del Named Tunnel se detalla en [Acceso desde Eduroam: Cloudflare Tunnel](#acceso-desde-eduroam-cloudflare-tunnel).

### Eliminar el aviso "sitio no seguro" en `:20382`

El acceso directo `:20382` usa un certificado **autofirmado** que genera `scripts/deploy-mv.sh` con `openssl`. El trafico va cifrado, pero el navegador avisa porque ninguna CA de confianza lo respalda. Bajo el NAT del laboratorio **no es posible emitir un certificado valido por auto-servicio** (ACME requiere el puerto 80/443 estandar publico o control del DNS de `uva.es`, y no tienes ninguno de los dos).

La unica forma de que `:20382` deje de avisar es instalar un certificado emitido por una CA de confianza **para `virtual.lab.inf.uva.es`**. Como el dominio es de la universidad, ese certificado debe pedirlo quien lo gestiona:

1. Solicita al **laboratorio / Servicio de Informatica de la UVa** un certificado de servidor para `virtual.lab.inf.uva.es`. Las universidades espanolas suelen emitirlo via RedIRIS / GEANT TCS (Sectigo), sin necesidad de ACME.
2. Te entregaran (o generaras tu el CSR y ellos firman) dos ficheros: la cadena completa y la clave privada.
3. En la MV, sustituye los ficheros autofirmados por los reales, conservando las rutas que ya usa nginx:

```bash
sudo cp fullchain_real.pem /etc/letsencrypt/live/virtual.lab.inf.uva.es/fullchain.pem
sudo cp privkey_real.pem   /etc/letsencrypt/live/virtual.lab.inf.uva.es/privkey.pem
sudo nginx -t && sudo systemctl reload nginx
```

No hay que tocar `deploy/nginx/nginx.conf`: ya apunta a esas rutas. Tras la recarga, `:20382` y `:20383` sirven el certificado valido y desaparece el aviso. Si vuelves a ejecutar `deploy-mv.sh`, no regenera el autofirmado porque solo lo crea cuando el fichero no existe.

Mientras no dispongas del certificado institucional, usa el **Quick Tunnel** como via limpia sin advertencia (ver mas abajo) y manten `:20382` con el autofirmado como respaldo en LAN.

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

Con esto, Docker publica el frontend solo en `127.0.0.1:8080` (inaccesible desde fuera del host). El nginx del host lo proxea en HTTPS (cert autofirmado) y lo expone como `https://virtual.lab.inf.uva.es:20382`, y el backend queda igualmente restringido a `127.0.0.1:4000`.

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
ALLOWED_ORIGINS=https://virtual.lab.inf.uva.es:20382
SOCKET_IO_CORS_ORIGIN=https://virtual.lab.inf.uva.es:20382
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

La entrada publica para usuarios debe ser siempre `https://virtual.lab.inf.uva.es:20382`. Aunque el backend publica `4000`, en esta MV queda ligado a `127.0.0.1` y el frontend productivo sigue trabajando same-origin a traves de nginx.

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

### Opcion A — Quick Tunnel (sin cuenta ni dominio) — recomendada sin dominio propio

La mas sencilla y la que da un **certificado de confianza sin advertencia de navegador** sin necesidad de dominio propio. Cloudflare asigna una URL del tipo `https://palabras-random.trycloudflare.com` con TLS valido en su edge. La URL es estable mientras el contenedor no se reinicie. **Convive con el acceso directo `:20382`**: ambos quedan operativos a la vez (el tunel sirve a Eduroam y a quien quiera la URL limpia; `:20382` sigue disponible en LAN/depuracion).

En la MV, edita `.deploy/mv.backend.env` y descomenta:

```dotenv
CLOUDFLARE_QUICK_TUNNEL=true
```

El script `deploy-mv.sh` detecta esta variable y:

1. Levanta los contenedores con `--profile tunnel`, arrancando `cloudflared` en modo Quick Tunnel (`--url http://localhost:8081`, el bloque loopback HTTP plano de nginx).
2. Espera hasta 45 segundos a que el contenedor emita su URL en los logs.
3. Añade la URL a `ALLOWED_ORIGINS` y `SOCKET_IO_CORS_ORIGIN` en `backend/.env`.
4. Reinicia solo el contenedor `backend` para que aplique el nuevo CORS.

Al terminar el despliegue el log muestra la URL asignada. Si el contenedor se reinicia, la URL cambia: vuelve a ejecutar `deploy-mv.sh` para que el script la detecte y actualice CORS automaticamente.

### Opcion B — Named Tunnel (cuenta gratuita de Cloudflare + dominio, URL estable)

Requiere un dominio gestionado en Cloudflare DNS. Ofrece una URL fija que no cambia en reinicios.

1. En el Cloudflare Dashboard → Zero Trust → Networks → Tunnels, crea un tunnel.
2. Añade un **Public Hostname** apuntando a `http://localhost:8081` (el bloque loopback HTTP plano de nginx; no uses `:80`, que sirve TLS).
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
# -k acepta el certificado autofirmado
curl -k -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"incorrecta"}' \
  https://virtual.lab.inf.uva.es:20382/api/auth/login
```

Debes recibir `401`, lo cual confirma que nginx esta reenviando `/api` al backend.

### Proxy Socket.IO a traves de nginx

```bash
curl -ki "https://virtual.lab.inf.uva.es:20382/socket.io/?EIO=4&transport=polling"
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

Abre un navegador en `https://virtual.lab.inf.uva.es:20382` (fuera de Eduroam; acepta la advertencia del certificado autofirmado la primera vez) o en la URL del tunnel (Eduroam, sin advertencia).

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
