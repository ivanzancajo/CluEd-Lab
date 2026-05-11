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
- ejecucion desde GitHub Actions: no hay terminal interactiva, asi que necesitas `NOPASSWD` para los comandos privilegiados reales que usa el script. No hace falta `NOPASSWD: ALL`.

5. Si quieres dejar GitHub Actions totalmente operativo, crea un `sudoers` restringido para el usuario de despliegue.

Primero comprueba las rutas reales de los binarios en esa MV:

```bash
type -P awk stat install sed systemctl psql
```

En Ubuntu suelen ser estas:

- `/usr/bin/awk`
- `/usr/bin/stat`
- `/usr/bin/install`
- `/usr/bin/sed`
- `/usr/bin/systemctl`
- `/usr/bin/psql`

Despues crea el fichero de `sudoers` con `visudo`:

```bash
sudo visudo -f /etc/sudoers.d/tfg-deploy
```

Contenido recomendado para el usuario `usuario`:

```sudoers
Runas_Alias TFG_POSTGRES = postgres
Cmnd_Alias TFG_DEPLOY_POSTGRES = /usr/bin/psql -tAc *
Cmnd_Alias TFG_DEPLOY_ROOT = /usr/bin/awk *, /usr/bin/stat *, /usr/bin/install *, /usr/bin/sed *, /usr/bin/systemctl restart postgresql, /usr/bin/grep *
usuario ALL=(TFG_POSTGRES) NOPASSWD: TFG_DEPLOY_POSTGRES
usuario ALL=(root) NOPASSWD: TFG_DEPLOY_ROOT
```

Si el nombre del usuario o las rutas de los binarios cambian en tu MV, adapta ese bloque antes de guardarlo. El script usa esas rutas absolutas cuando llama a `sudo`, para que el `sudoers` restringido funcione igual en la ejecucion manual y en GitHub Actions.

Valida la sintaxis antes de salir o despues con:

```bash
sudo visudo -cf /etc/sudoers.d/tfg-deploy
```

Antes de probar el `NOPASSWD`, limpia cualquier credencial `sudo` cacheada en esa sesion. Si acabas de usar `visudo`, una prueba directa con `sudo -n` puede dar un falso positivo aunque el workflow siga fallando despues.

```bash
sudo -k
sudo -n -u postgres /usr/bin/psql -tAc 'show config_file'
sudo -n -u postgres /usr/bin/psql -tAc 'show hba_file'
sudo -n /usr/bin/systemctl restart postgresql
```

Si cualquiera de esos comandos pide contrasena o falla con `sudo: a password is required`, el `sudoers` restringido todavia no esta aplicado correctamente para CI/CD.

Con el script actual, ese `sudoers` restringido ya es suficiente tambien para CI/CD: el chequeo no usa `sudo -n true` como condicion global, sino los comandos privilegiados reales del despliegue.

6. Ejecuta una vez el script manualmente en la MV para dejar el host alineado con la version automatizada:

```bash
cd /home/usuario/TFG
bash scripts/deploy-mv.sh
```

## Clave SSH para GitHub Actions

GitHub Actions solo necesita la clave privada. La clave publica debe instalarse una vez en la MV dentro de `~/.ssh/authorized_keys` del usuario de despliegue.

Genera esta clave en tu maquina local, no dentro de la MV. El workflow de GitHub necesita la clave privada local para guardarla como secreto `MV_SSH_PRIVATE_KEY`.

Ejemplo de generacion local:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy"
```

Luego anade el contenido de la clave publica en la MV:

```bash
cat ~/.ssh/id_ed25519.pub >> /home/usuario/.ssh/authorized_keys
chmod 600 /home/usuario/.ssh/authorized_keys
```

La linea que copies a `authorized_keys` debe ser la clave publica completa, incluyendo el prefijo `ssh-ed25519` y el comentario final si existe. No copies solo el bloque Base64.

Si por error generaste la clave dentro de la MV, no la reutilices moviendo la privada fuera de ella. Lo correcto es generar una nueva clave en tu maquina local y anadir su publica completa a `authorized_keys`.

## Variables y secretos en GitHub

Configura estos valores en el repositorio:

- Variables:
  - `MV_HOST`: `virtual.lab.inf.uva.es`
  - `MV_PORT`: `20381`
  - `MV_USER`: `usuario`
  - `MV_REPO_PATH`: `/home/usuario/TFG`
- Secretos:
  - `MV_SSH_PRIVATE_KEY`: clave privada SSH que corresponde a la publica instalada en la MV
  - `MV_SSH_PRIVATE_KEY_B64`: alternativa recomendada si pegas el secreto desde la web de GitHub; contiene la misma clave privada codificada en Base64 en una sola linea

La clave publica no hace falta guardarla en GitHub para que el workflow funcione. Si tu politica interna exige almacenar tambien la publica, puedes guardarla como secreto o variable documental, pero el workflow no la consume.

Si configuras secretos desde la interfaz web de GitHub, es mas robusto usar `MV_SSH_PRIVATE_KEY_B64` para evitar problemas con saltos de linea. En Linux puedes obtener ese valor asi:

```bash
base64 -w0 ~/.ssh/id_ed25519_tfg_mv_actions
```

Si usas `MV_SSH_PRIVATE_KEY_B64`, no hace falta definir `MV_SSH_PRIVATE_KEY`.

## Rotacion de la clave SSH del despliegue

Para rotar la clave SSH sin romper el workflow, haz el cambio con solape temporal: primero anade la clave nueva en la MV, luego actualiza GitHub y solo al final retira la clave antigua.

La via recomendada es usar el script local [scripts/rotate-mv-deploy-key.sh](../scripts/rotate-mv-deploy-key.sh), que automatiza ese solape. Requiere ejecutarse en tu maquina local y disponer de `ssh`, `ssh-keygen`, `base64` y, si quieres actualizar GitHub y relanzar el workflow automaticamente, tambien `gh` autenticado.

Para no tener que pasar `host`, `port`, `user` y el resto de parametros cada vez, el script intenta cargar por defecto un archivo local ignorado por Git en `.deploy/rotate-mv-deploy-key.env`.

Puedes prepararlo asi:

```bash
mkdir -p .deploy
cp deploy/rotate-mv-deploy-key.env.example .deploy/rotate-mv-deploy-key.env
chmod 600 .deploy/rotate-mv-deploy-key.env
```

Despues ajusta ese archivo con tus rutas locales reales. A partir de ahi, el uso habitual puede quedar reducido a:

```bash
./scripts/rotate-mv-deploy-key.sh
```

Si algun dia quieres usar otro archivo de configuracion, puedes pasarlo con `--config /ruta/al/archivo.env`. Si prefieres ignorar el archivo local y usar solo argumentos por CLI, usa `--no-config`.

Ejemplo recomendado, asumiendo que la clave actual sigue en `~/.ssh/id_ed25519_tfg_mv_actions` y que quieres retirar la antigua cuando el workflow nuevo valide en verde:

```bash
./scripts/rotate-mv-deploy-key.sh \
  --host virtual.lab.inf.uva.es \
  --port 20381 \
  --user usuario \
  --bootstrap-identity ~/.ssh/id_ed25519_tfg_mv_actions \
  --retire-comment github-actions-tfg-mv \
  --delete-old-local-key ~/.ssh/id_ed25519_tfg_mv_actions
```

Si no tienes `gh` en tu maquina local, puedes seguir usando el mismo script para automatizar toda la parte SSH y que te imprima el Base64 listo para pegar en GitHub:

```bash
./scripts/rotate-mv-deploy-key.sh \
  --host virtual.lab.inf.uva.es \
  --port 20381 \
  --user usuario \
  --bootstrap-identity ~/.ssh/id_ed25519_tfg_mv_actions \
  --skip-gh-update \
  --skip-workflow-rerun
```

En ese modo, el script genera la nueva clave, la instala en la MV, valida acceso y muestra el valor Base64 para `MV_SSH_PRIVATE_KEY_B64`, pero no toca GitHub ni retira la clave anterior.

Secuencia recomendada:

1. Genera una clave nueva en tu maquina local con un comentario distinto al actual:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519_tfg_mv_actions_rotacion -C "github-actions-rotacion-tfg-mv-2026-05"
```

2. Instala la nueva clave publica en la MV sin borrar todavia la anterior:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519_tfg_mv_actions_rotacion.pub -p 20381 usuario@virtual.lab.inf.uva.es
```

3. Valida desde tu maquina local que la clave nueva ya entra sin password:

```bash
ssh -i ~/.ssh/id_ed25519_tfg_mv_actions_rotacion -o IdentitiesOnly=yes -o BatchMode=yes -p 20381 usuario@virtual.lab.inf.uva.es 'echo ok'
```

4. Genera el secreto Base64 de la clave nueva:

```bash
base64 -w0 ~/.ssh/id_ed25519_tfg_mv_actions_rotacion
```

5. En GitHub, actualiza el secreto `MV_SSH_PRIVATE_KEY_B64` con ese nuevo valor. No retires todavia la clave vieja de `authorized_keys`.

6. Relanza el workflow `Deploy MV laboratorio`. Si termina en verde, la clave nueva ya esta en servicio.

7. Retira entonces la clave antigua de la MV. Si el comentario antiguo sigue siendo `github-actions-tfg-mv`, puedes borrarla asi:

```bash
ssh -p 20381 usuario@virtual.lab.inf.uva.es
sed -i '/ github-actions-tfg-mv$/d' ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

8. Borra o archiva la clave privada antigua en tu maquina local. Si quieres eliminarla directamente:

```bash
rm -f ~/.ssh/id_ed25519_tfg_mv_actions ~/.ssh/id_ed25519_tfg_mv_actions.pub
```

9. Haz una ultima validacion relanzando otra vez el workflow o probando el acceso SSH manual con la clave nueva.

Mientras la clave nueva no haya sido validada en GitHub Actions, no borres la anterior de `authorized_keys`.

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
- que el usuario remoto puede ejecutar sin password los comandos `sudo` restringidos documentados para PostgreSQL
- que `.deploy/mv.backend.env` sigue presente en la MV
- que la ref a desplegar sigue permitiendo `git pull --ff-only`
- que `docker compose --env-file docker-compose.lab.env -f docker-compose.prod.yml ps` muestra ambos contenedores levantados