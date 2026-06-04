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

resolve_command_path() {
  local resolved_path

  resolved_path="$(type -P "$1" || true)"
  [[ -n "$resolved_path" ]] || fail "No se pudo resolver la ruta del comando requerido: $1"
  printf '%s' "$resolved_path"
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

has_pending_failed_prisma_migration() {
  local migration_name="$1"
  local database_schema="$2"
  local table_exists
  local failed_marker

  table_exists="$(
    PGPASSWORD="$DB_PASSWORD" "$PSQL_BIN" \
      -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
      -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema = '${database_schema}' AND table_name = '_prisma_migrations' LIMIT 1;"
  )"

  [[ "$(trim_whitespace "$table_exists")" == '1' ]] || return 1

  failed_marker="$(
    PGPASSWORD="$DB_PASSWORD" "$PSQL_BIN" \
      -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
      -tAc "SELECT 1 FROM \"_prisma_migrations\" WHERE migration_name = '${migration_name}' AND finished_at IS NULL AND rolled_back_at IS NULL LIMIT 1;"
  )"

  [[ "$(trim_whitespace "$failed_marker")" == '1' ]]
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

  run_sudo "$AWK_BIN" -v rule="$canonical_rule" '
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

  file_mode="$(run_sudo "$STAT_BIN" -c '%a' "$file_path")"
  file_uid="$(run_sudo "$STAT_BIN" -c '%u' "$file_path")"
  file_gid="$(run_sudo "$STAT_BIN" -c '%g' "$file_path")"

  run_sudo "$INSTALL_BIN" -m "$file_mode" -o "$file_uid" -g "$file_gid" "$temp_file" "$file_path"
  rm -f "$temp_file"
}

require_command docker
require_command git
require_command node
require_command npm
require_command psql
require_command sudo

AWK_BIN="$(resolve_command_path awk)"
STAT_BIN="$(resolve_command_path stat)"
INSTALL_BIN="$(resolve_command_path install)"
SED_BIN="$(resolve_command_path sed)"
SYSTEMCTL_BIN="$(resolve_command_path systemctl)"
PSQL_BIN="$(resolve_command_path psql)"

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
FRONTEND_HOST_IP="${FRONTEND_HOST_IP:-127.0.0.1}"
FRONTEND_PUBLISHED_PORT="${FRONTEND_PUBLISHED_PORT:-8080}"
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
DB_PASSWORD="$(parse_database_url_field password)"
DB_PORT="$(parse_database_url_field port)"
DB_SCHEMA="$(parse_database_url_field schema)"
HOST_DATABASE_URL="$(rewrite_database_url_host 127.0.0.1)"
KNOWN_RECOVERY_MIGRATION='20260514_scrum89_final_accusation_state'
KNOWN_RECOVERY_SQL_MARKER='id_evento_sugerencia_activa'
KNOWN_RECOVERY_MIGRATION_FILE="$BACKEND_DIR/prisma/migrations/$KNOWN_RECOVERY_MIGRATION/migration.sql"

[[ -n "$DB_USER" ]] || fail 'No se pudo derivar el usuario de base de datos desde DATABASE_URL'
[[ -n "$DB_NAME" ]] || fail 'No se pudo derivar la base de datos desde DATABASE_URL'

setup_host_nginx() {
  local cert_dir="/etc/letsencrypt/live/virtual.lab.inf.uva.es"
  local cert_path="$cert_dir/fullchain.pem"
  local acme_webroot='/var/www/certbot'

  # ── Instalar nginx y certbot ────────────────────────────────────────────────
  if ! command -v nginx >/dev/null 2>&1; then
    log 'Instalando nginx...'
    run_sudo apt-get update -qq
    run_sudo apt-get install -y nginx
  fi

  if ! command -v certbot >/dev/null 2>&1; then
    log 'Instalando certbot...'
    run_sudo apt-get install -y certbot
  fi

  run_sudo mkdir -p "$acme_webroot"

  # ── Certificado: autofirmado como punto de partida ─────────────────────────
  # Si no existe ningún cert todavía, se genera uno autofirmado para que nginx
  # pueda arrancar con el bloque SSL antes de que certbot valide con Let's Encrypt.
  if [[ ! -f "$cert_path" ]]; then
    log 'Generando certificado autofirmado como marcador de posición...'
    run_sudo mkdir -p "$cert_dir"
    run_sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "$cert_dir/privkey.pem" \
      -out    "$cert_path" \
      -subj   '/CN=virtual.lab.inf.uva.es' \
      -addext 'subjectAltName=DNS:virtual.lab.inf.uva.es'
  fi

  # ── Instalar config nginx y arrancar/recargar ──────────────────────────────
  run_sudo cp "$ROOT_DIR/deploy/nginx/nginx.conf" /etc/nginx/nginx.conf
  run_sudo nginx -t
  run_sudo "$SYSTEMCTL_BIN" enable nginx
  if run_sudo "$SYSTEMCTL_BIN" is-active --quiet nginx; then
    run_sudo "$SYSTEMCTL_BIN" reload nginx
  else
    run_sudo "$SYSTEMCTL_BIN" start nginx
  fi

  # ── Obtener/renovar certificado Let's Encrypt via HTTP-01 webroot ──────────
  # nginx ya está escuchando en el puerto 80 y sirve /.well-known/acme-challenge/
  # desde $acme_webroot, por lo que el desafío HTTP-01 de Let's Encrypt puede
  # completarse ahora. Si CERTBOT_EMAIL no está definido se omite este paso.
  local certbot_email="${CERTBOT_EMAIL:-}"
  if [[ -n "$certbot_email" ]]; then
    local needs_cert=0
    if run_sudo openssl x509 -checkend 2592000 -noout -in "$cert_path" 2>/dev/null; then
      # Cert válido más de 30 días; comprobar si es autofirmado (no tiene CA chain)
      local issuer subject
      issuer="$(run_sudo openssl x509 -noout -issuer -in "$cert_path" 2>/dev/null)"
      subject="$(run_sudo openssl x509 -noout -subject -in "$cert_path" 2>/dev/null)"
      [[ "$issuer" == "$subject" ]] && needs_cert=1 || log "Certificado Let's Encrypt vigente — omitiendo renovación"
    else
      needs_cert=1
      log 'Certificado próximo a expirar — renovando...'
    fi

    if [[ "$needs_cert" -eq 1 ]]; then
      log "Solicitando certificado Let's Encrypt para virtual.lab.inf.uva.es..."
      if run_sudo certbot certonly --webroot \
          -w "$acme_webroot" \
          -d virtual.lab.inf.uva.es \
          --non-interactive --agree-tos \
          --email "$certbot_email" 2>&1 | while IFS= read -r line; do log "[certbot] $line"; done; then
        log "Certificado Let's Encrypt instalado correctamente"
        run_sudo "$SYSTEMCTL_BIN" reload nginx
      else
        log 'ADVERTENCIA: certbot no pudo obtener certificado. El sitio seguirá con certificado autofirmado.'
      fi
    fi
  else
    log 'CERTBOT_EMAIL no definido — se usará el certificado autofirmado. Añade CERTBOT_EMAIL=tu@email.com a .deploy/mv.backend.env para obtener un certificado de confianza.'
  fi
}

write_backend_env
write_compose_env

PG_CONF="$(run_sudo -u postgres "$PSQL_BIN" -tAc 'show config_file' | xargs)"
PG_HBA="$(run_sudo -u postgres "$PSQL_BIN" -tAc 'show hba_file' | xargs)"

log 'Ajustando PostgreSQL del host para conexiones desde Docker Compose'
run_sudo "$SED_BIN" -i "s/^#\\?listen_addresses.*/listen_addresses = '*'/" "$PG_CONF"
run_sudo "$SED_BIN" -i "s/^#\\?port.*/port = 5432/" "$PG_CONF"

log 'Construyendo imagenes y materializando la red de Docker Compose'
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_SPEC_FILE" build
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_SPEC_FILE" create

SUBNET="$(docker network inspect ${COMPOSE_PROJECT_NAME}_default --format '{{(index .IPAM.Config 0).Subnet}}')"
HOST_RULE="host    $DB_NAME    $DB_USER    $SUBNET    scram-sha-256"

dedupe_pg_hba_rule "$HOST_RULE" "$PG_HBA"
run_sudo "$SYSTEMCTL_BIN" restart postgresql
run_sudo "$AWK_BIN" -v rule="$(canonicalize_pg_hba_rule "$HOST_RULE")" '
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

if [[ -f "$KNOWN_RECOVERY_MIGRATION_FILE" ]]; then
  migration_sql_contents="$(< "$KNOWN_RECOVERY_MIGRATION_FILE")"

  if [[ "$migration_sql_contents" != *"$KNOWN_RECOVERY_SQL_MARKER"* ]] && has_pending_failed_prisma_migration "$KNOWN_RECOVERY_MIGRATION" "$DB_SCHEMA"; then
    log "Recuperando migracion fallida heredada: $KNOWN_RECOVERY_MIGRATION"
    npm run prisma:migrate:resolve -- --rolled-back "$KNOWN_RECOVERY_MIGRATION"
  fi
fi

npm run prisma:migrate:deploy
unset DATABASE_URL
popd >/dev/null

log 'Configurando nginx del host con certificado SSL'
setup_host_nginx

log 'Levantando servicios productivos'
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_SPEC_FILE" up -d --remove-orphans
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_SPEC_FILE" ps

log 'Validando healthcheck, frontend container y Socket.IO locales'
wait_for_http http://127.0.0.1:4000/health 'healthcheck del backend'
wait_for_http http://127.0.0.1:8080/ 'frontend container'

LOGIN_STATUS="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"incorrecta"}' \
  http://127.0.0.1:4000/api/auth/login)"

[[ "$LOGIN_STATUS" == '401' ]] || fail "Se esperaba 401 en el login local y se obtuvo $LOGIN_STATUS"

wait_for_http 'http://127.0.0.1:4000/socket.io/?EIO=4&transport=polling' 'handshake de Socket.IO'

log 'Despliegue completado correctamente'
log 'Entrada publica: https://virtual.lab.inf.uva.es'