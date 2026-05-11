# Automatizacion del despliegue en la MV

Esta guia describe la automatizacion del despliegue validado en la MV del laboratorio usando dos capas:

- un script reproducible dentro del repositorio: [scripts/deploy-mv.sh](../scripts/deploy-mv.sh)
- un workflow de GitHub Actions: [.github/workflows/deploy-mv-lab.yml](../.github/workflows/deploy-mv-lab.yml)

La automatizacion asume el mismo escenario que [docs/despliegue-mv-pruebas.md](./despliegue-mv-pruebas.md): frontend y backend en Docker Compose, PostgreSQL en el host Linux y punto de entrada publico en `http://virtual.lab.inf.uva.es:20382`.

## Que resuelve el script

El script [scripts/deploy-mv.sh](../scripts/deploy-mv.sh) es idempotente y cubre estos pasos:

- regenerar `backend/.env` a partir de un archivo host-local o reutilizar el existente
- regenerar `docker-compose.lab.env` con los puertos de la MV
- construir imagenes y materializar la red de Docker Compose
- asegurar una unica regla `pg_hba.conf` para la subred real de Docker Compose
- ejecutar `prisma generate`, `prisma validate` y `prisma migrate deploy` desde el host
- levantar los contenedores productivos y validar `health`, proxy HTTP y Socket.IO

Si ya existe una linea duplicada en `pg_hba.conf` para la misma subred de Docker, la primera ejecucion del script la deja en una sola entrada exacta.

## Preparacion unica en la MV

1. Mantén el repositorio clonado y funcionando una primera vez de forma manual.
2. Crea un archivo host-local con el entorno real de despliegue:

```bash
cd /home/usuario/TFG
mkdir -p .deploy
cp deploy/mv.backend.env.example .deploy/mv.backend.env
chmod 600 .deploy/mv.backend.env
```

3. Edita `.deploy/mv.backend.env` con tus valores reales.

Ejemplo minimo:

```dotenv
PORT=4000
ADMIN_USER=admin
ADMIN_PASS_HASH=$2b$10$REEMPLAZA_ESTE_HASH_BCRYPT
JWT_SECRET=REEMPLAZA_ESTE_SECRETO
DATABASE_URL=postgresql://cluedo_admin:TU_PASSWORD@host.docker.internal:5432/cluedo_db?schema=public
ALLOWED_ORIGINS=http://virtual.lab.inf.uva.es:20382
SOCKET_IO_CORS_ORIGIN=http://virtual.lab.inf.uva.es:20382
FRONTEND_HOST_IP=0.0.0.0
FRONTEND_PUBLISHED_PORT=80
BACKEND_HOST_IP=127.0.0.1
BACKEND_PUBLISHED_PORT=4000
```

4. Verifica que el usuario de despliegue puede elevar a `sudo`.

El script admite dos modos:

- ejecucion manual: si hay TTY, puede pedir la contrasena de `sudo` una sola vez
- ejecucion desde GitHub Actions: no hay terminal interactiva, asi que la opcion recomendada es permitir `NOPASSWD` para el usuario de despliegue en esa MV o, si prefieres ir mas fino, solo para los comandos necesarios sobre `psql`, `stat`, `awk`, `install` y `systemctl restart postgresql`

5. Ejecuta una vez el script manualmente en la MV para dejar el host alineado con la version automatizada:

```bash
cd /home/usuario/TFG
bash scripts/deploy-mv.sh
```

## Clave SSH para GitHub Actions

GitHub Actions solo necesita la clave privada. La clave publica debe instalarse una vez en la MV dentro de `~/.ssh/authorized_keys` del usuario de despliegue.

Ejemplo de generacion local:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy"
```

Luego anade el contenido de la clave publica en la MV:

```bash
cat ~/.ssh/id_ed25519.pub >> /home/usuario/.ssh/authorized_keys
chmod 600 /home/usuario/.ssh/authorized_keys
```

## Variables y secretos en GitHub

Configura estos valores en el repositorio:

- Variables:
  - `MV_HOST`: `virtual.lab.inf.uva.es`
  - `MV_PORT`: `20381`
  - `MV_USER`: `usuario`
  - `MV_REPO_PATH`: `/home/usuario/TFG`
- Secretos:
  - `MV_SSH_PRIVATE_KEY`: clave privada SSH que corresponde a la publica instalada en la MV

La clave publica no hace falta guardarla en GitHub para que el workflow funcione. Si tu politica interna exige almacenar tambien la publica, puedes guardarla como secreto o variable documental, pero el workflow no la consume.

## Uso del workflow

El workflow [.github/workflows/deploy-mv-lab.yml](../.github/workflows/deploy-mv-lab.yml) se ejecuta de dos formas:

- automaticamente en cada `push` a `develop` que toque backend, frontend o ficheros de despliegue
- manualmente con `workflow_dispatch`, indicando una ref git si quieres forzar una rama o commit concreto

La logica remota del workflow es:

1. conectarse por SSH a la MV
2. hacer `git fetch` y `git pull --ff-only` de la ref objetivo
3. ejecutar `bash ./scripts/deploy-mv.sh`

Si la MV no tiene un checkout previo del repositorio en `MV_REPO_PATH`, el workflow falla a proposito para que el bootstrap inicial siga siendo un paso consciente.

## Bootstrap inicial recomendado

Hazlo una sola vez en la MV:

```bash
ssh -p 20381 usuario@virtual.lab.inf.uva.es
cd /home/usuario
git clone https://github.com/ivanzancajo/TFG-Cluedo.git TFG
cd TFG
git checkout develop
git pull --ff-only origin develop
mkdir -p .deploy
cp deploy/mv.backend.env.example .deploy/mv.backend.env
chmod 600 .deploy/mv.backend.env
bash scripts/deploy-mv.sh
```

Despues de eso, los despliegues futuros pueden quedar en manos del workflow.

## Diagnostico rapido

Si el workflow falla, revisa primero:

- que `MV_SSH_PRIVATE_KEY` corresponde a una clave publica instalada en la MV
- que el usuario remoto puede ejecutar `sudo -n true`
- que `.deploy/mv.backend.env` sigue presente en la MV
- que la ref a desplegar sigue permitiendo `git pull --ff-only`
- que `docker compose --env-file docker-compose.lab.env -f docker-compose.prod.yml ps` muestra ambos contenedores levantados