#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
BACKEND_ENV_FILE="$BACKEND_DIR/.env"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT_DIR/.deploy/mv.backend.env}"
COMPOSE_ENV_FILE="$ROOT_DIR/docker-compose.lab.env"
COMPOSE_SPEC_FILE="$ROOT_DIR/docker-compose.prod.yml"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-tfg}"

log() {
  printf '[deploy-mv] %s\n' "$*"
}

fail() {
  printf '[deploy-mv] %s\n' "$*" >&2
  exit 1
}

canonicalize_pg_hba_rule() {
  printf '%s\n' "$1" | awk '{ $1=$1; print }'
}

wait_for_http() {
  local url="$1"
  local description="$2"
  local attempts="${3:-20}"
  local delay_seconds="${4:-1}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --silent --show-error --fail "$url" >/dev/null; then
      return 0
    fi

    if (( attempt < attempts )); then
      log "Esperando $description ($attempt/$attempts)"
      sleep "$delay_seconds"
    fi
  done

  fail "No fue posible validar $description en $url"
}

run_sudo() {
  if [[ -t 0 ]]; then
    sudo "$@"
    return 0
  fi

  if sudo -n "$@"; then
    return 0
  fi

  fail "Fallo sudo no interactivo para: sudo $*. Configura NOPASSWD para los comandos privilegiados documentados en docs/automatizacion-despliegue-mv.md."
}

ensure_sudo_session() {
  if [[ -t 0 ]] && ! sudo -n true >/dev/null 2>&1; then
    log 'Solicitando credenciales sudo para preparar PostgreSQL'
    sudo -v
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Falta el comando requerido: $1"
}

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

load_env_file() {
  local env_file="$1"

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    raw_line="${raw_line%$'\r'}"

    if [[ -z "$raw_line" || "$raw_line" =~ ^[[:space:]]*# ]]; then
      continue
    fi

    local key_part="${raw_line%%=*}"
    local value_part="${raw_line#*=}"
    local key
    local value

    key="$(trim_whitespace "$key_part")"
    value="$(trim_whitespace "$value_part")"

    if [[ -z "$key" ]]; then
      continue
    fi

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:-1}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:-1}"
    fi

    export "$key=$value"
  done < "$env_file"
}

require_env() {
  local key="$1"
  [[ -n "${!key:-}" ]] || fail "Falta la variable requerida $key en $DEPLOY_ENV_FILE"
}

parse_database_url_field() {
  local field="$1"
  node --input-type=module -e '
    const url = new URL(process.argv[1]);
    const values = {
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, ""),
      schema: url.searchParams.get("schema") || "public",
    };
    console.log(values[process.argv[2]] ?? "");
  ' "$DATABASE_URL" "$field"
}

rewrite_database_url_host() {
  local replacement_host="$1"
  node --input-type=module -e '
    const url = new URL(process.argv[1]);
    url.hostname = process.argv[2];
    console.log(url.toString());
  ' "$DATABASE_URL" "$replacement_host"
}

write_backend_env() {
  cat > "$BACKEND_ENV_FILE" <<EOF
PORT=$PORT
ADMIN_USER=$ADMIN_USER
ADMIN_PASS_HASH=$ADMIN_PASS_HASH
JWT_SECRET=$JWT_SECRET
DATABASE_URL=$DATABASE_URL
ALLOWED_ORIGINS=$ALLOWED_ORIGINS
SOCKET_IO_CORS_ORIGIN=$SOCKET_IO_CORS_ORIGIN
EOF
}

write_compose_env() {
  cat > "$COMPOSE_ENV_FILE" <<EOF
FRONTEND_HOST_IP=$FRONTEND_HOST_IP
FRONTEND_PUBLISHED_PORT=$FRONTEND_PUBLISHED_PORT
BACKEND_HOST_IP=$BACKEND_HOST_IP
BACKEND_PUBLISHED_PORT=$BACKEND_PUBLISHED_PORT
EOF
}

dedupe_pg_hba_rule() {
  local rule="$1"
  local file_path="$2"
  local temp_file
  local file_mode
  local file_uid
  local file_gid
  local canonical_rule

  temp_file="$(mktemp)"
  canonical_rule="$(canonicalize_pg_hba_rule "$rule")"

  run_sudo awk -v rule="$canonical_rule" '
    {
      normalized = $0
      gsub(/[[:space:]]+/, " ", normalized)
      sub(/^ /, "", normalized)
      sub(/ $/, "", normalized)
    }

    normalized == rule {
      if (!seen) {
        print rule;
        seen = 1;
      }
      next;
    }

    {
      print;
    }

    END {
      if (!seen) {
        print rule;
      }
    }
  ' "$file_path" > "$temp_file"

  file_mode="$(run_sudo stat -c '%a' "$file_path")"
  file_uid="$(run_sudo stat -c '%u' "$file_path")"
  file_gid="$(run_sudo stat -c '%g' "$file_path")"

  run_sudo install -m "$file_mode" -o "$file_uid" -g "$file_gid" "$temp_file" "$file_path"
  rm -f "$temp_file"
}

require_command docker
require_command git
require_command node
require_command npm
require_command psql
require_command sudo

docker compose version >/dev/null 2>&1 || fail 'Docker Compose no esta disponible'

ensure_sudo_session

if [[ -f "$DEPLOY_ENV_FILE" ]]; then
  log "Cargando entorno host-local desde $DEPLOY_ENV_FILE"
  load_env_file "$DEPLOY_ENV_FILE"
elif [[ -f "$BACKEND_ENV_FILE" ]]; then
  log "Cargando entorno existente desde $BACKEND_ENV_FILE"
  load_env_file "$BACKEND_ENV_FILE"
else
  fail "Falta $DEPLOY_ENV_FILE y tampoco existe $BACKEND_ENV_FILE"
fi

PORT="${PORT:-4000}"
SOCKET_IO_CORS_ORIGIN="${SOCKET_IO_CORS_ORIGIN:-${ALLOWED_ORIGINS:-}}"
FRONTEND_HOST_IP="${FRONTEND_HOST_IP:-0.0.0.0}"
FRONTEND_PUBLISHED_PORT="${FRONTEND_PUBLISHED_PORT:-80}"
BACKEND_HOST_IP="${BACKEND_HOST_IP:-127.0.0.1}"
BACKEND_PUBLISHED_PORT="${BACKEND_PUBLISHED_PORT:-4000}"

require_env PORT
require_env ADMIN_USER
require_env ADMIN_PASS_HASH
require_env JWT_SECRET
require_env DATABASE_URL
require_env ALLOWED_ORIGINS
require_env SOCKET_IO_CORS_ORIGIN

DB_USER="$(parse_database_url_field username)"
DB_NAME="$(parse_database_url_field database)"
HOST_DATABASE_URL="$(rewrite_database_url_host 127.0.0.1)"

[[ -n "$DB_USER" ]] || fail 'No se pudo derivar el usuario de base de datos desde DATABASE_URL'
[[ -n "$DB_NAME" ]] || fail 'No se pudo derivar la base de datos desde DATABASE_URL'

write_backend_env
write_compose_env

PG_CONF="$(run_sudo -u postgres psql -tAc 'show config_file' | xargs)"
PG_HBA="$(run_sudo -u postgres psql -tAc 'show hba_file' | xargs)"

log 'Ajustando PostgreSQL del host para conexiones desde Docker Compose'
run_sudo sed -i "s/^#\\?listen_addresses.*/listen_addresses = '*'/" "$PG_CONF"
run_sudo sed -i "s/^#\\?port.*/port = 5432/" "$PG_CONF"

log 'Construyendo imagenes y materializando la red de Docker Compose'
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_SPEC_FILE" build
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_SPEC_FILE" create

SUBNET="$(docker network inspect ${COMPOSE_PROJECT_NAME}_default --format '{{(index .IPAM.Config 0).Subnet}}')"
HOST_RULE="host    $DB_NAME    $DB_USER    $SUBNET    scram-sha-256"

dedupe_pg_hba_rule "$HOST_RULE" "$PG_HBA"
run_sudo systemctl restart postgresql
run_sudo awk -v rule="$(canonicalize_pg_hba_rule "$HOST_RULE")" '
  {
    normalized = $0
    gsub(/[[:space:]]+/, " ", normalized)
    sub(/^ /, "", normalized)
    sub(/ $/, "", normalized)
  }

  normalized == rule {
    printf "%d:%s\n", NR, $0
  }
' "$PG_HBA"

log 'Alineando Prisma desde el host'
pushd "$BACKEND_DIR" >/dev/null
npm ci
export DATABASE_URL="$HOST_DATABASE_URL"
npm run prisma:generate
npm run prisma:validate
npm run prisma:migrate:deploy
unset DATABASE_URL
popd >/dev/null

log 'Levantando servicios productivos'
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_SPEC_FILE" up -d --remove-orphans
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_SPEC_FILE" ps

log 'Validando healthcheck, proxy HTTP y Socket.IO locales'
wait_for_http http://127.0.0.1:4000/health 'healthcheck del backend'
wait_for_http http://127.0.0.1/ 'proxy HTTP del frontend'

LOGIN_STATUS="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"incorrecta"}' \
  http://127.0.0.1/api/auth/login)"

[[ "$LOGIN_STATUS" == '401' ]] || fail "Se esperaba 401 en el login local y se obtuvo $LOGIN_STATUS"

wait_for_http 'http://127.0.0.1/socket.io/?EIO=4&transport=polling' 'handshake de Socket.IO'

log 'Despliegue completado correctamente'
log 'Entrada publica esperada: http://virtual.lab.inf.uva.es:20382'