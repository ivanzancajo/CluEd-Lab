#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  printf '[deploy-mv-manual] %s\n' "$*"
}

fail() {
  printf '[deploy-mv-manual] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Falta el comando requerido: $1"
}

usage() {
  cat <<'EOF'
Uso:
  scripts/deploy-mv-manual.sh [opciones]

Opciones:
  --config PATH         Ruta a un archivo local de configuracion.
  --no-config           No carga archivo de configuracion local.
  --host HOST           Host de la MV.
  --port PORT           Puerto SSH de la MV. Por defecto: 20381.
  --user USER           Usuario SSH de la MV.
  --repo-path PATH      Ruta del repositorio en la MV.
  --ref REF             Ref git a desplegar. Por defecto: develop.
  --identity PATH       Clave SSH privada a usar para la conexion.
  --help                Muestra esta ayuda.

Descripcion:
  Ejecuta desde tu maquina local el mismo flujo remoto que usa el workflow
  deploy-mv-lab.yml: conecta por SSH a la MV, actualiza el checkout al ref
  indicado y lanza scripts/deploy-mv.sh dentro de la MV.

Notas:
  - Usa ssh -tt para permitir prompts interactivos de sudo durante el despliegue.
  - Por defecto intenta cargar .deploy/mv.manual-deploy.env desde la raiz del repositorio.
EOF
}

load_config_file() {
  local path="$1"

  [[ -f "$path" ]] || return 1

  log "Cargando configuracion local desde $path"
  set -a
  # shellcheck disable=SC1090
  source "$path"
  set +a
}

CONFIG_FILE="${MANUAL_MV_DEPLOY_CONFIG:-$ROOT_DIR/.deploy/mv.manual-deploy.env}"
CONFIG_FILE_EXPLICIT=0
USE_CONFIG=1

ORIGINAL_ARGS=("$@")
ARG_INDEX=0
while [[ $ARG_INDEX -lt ${#ORIGINAL_ARGS[@]} ]]; do
  case "${ORIGINAL_ARGS[$ARG_INDEX]}" in
    --config)
      (( ARG_INDEX + 1 < ${#ORIGINAL_ARGS[@]} )) || fail 'Falta el valor de --config.'
      CONFIG_FILE="${ORIGINAL_ARGS[$((ARG_INDEX + 1))]}"
      CONFIG_FILE_EXPLICIT=1
      ((ARG_INDEX += 2))
      ;;
    --no-config)
      USE_CONFIG=0
      ((ARG_INDEX += 1))
      ;;
    *)
      ((ARG_INDEX += 1))
      ;;
  esac
done

if [[ $USE_CONFIG -eq 1 ]]; then
  if ! load_config_file "$CONFIG_FILE" && [[ $CONFIG_FILE_EXPLICIT -eq 1 || -n "${MANUAL_MV_DEPLOY_CONFIG:-}" ]]; then
    fail "No existe el archivo de configuracion indicado: $CONFIG_FILE"
  fi
fi

HOST="${MANUAL_MV_DEPLOY_HOST:-${MV_HOST:-}}"
PORT="${MANUAL_MV_DEPLOY_PORT:-${MV_PORT:-20381}}"
USER_NAME="${MANUAL_MV_DEPLOY_USER:-${MV_USER:-}}"
REPO_PATH="${MANUAL_MV_DEPLOY_REPO_PATH:-${MV_REPO_PATH:-}}"
DEPLOY_REF="${MANUAL_MV_DEPLOY_REF:-develop}"
IDENTITY="${MANUAL_MV_DEPLOY_IDENTITY:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      shift 2
      ;;
    --no-config)
      shift
      ;;
    --host)
      HOST="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --user)
      USER_NAME="$2"
      shift 2
      ;;
    --repo-path)
      REPO_PATH="$2"
      shift 2
      ;;
    --ref)
      DEPLOY_REF="$2"
      shift 2
      ;;
    --identity)
      IDENTITY="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "Opcion no reconocida: $1"
      ;;
  esac
done

[[ -n "$HOST" ]] || fail 'Falta --host o MANUAL_MV_DEPLOY_HOST.'
[[ -n "$USER_NAME" ]] || fail 'Falta --user o MANUAL_MV_DEPLOY_USER.'
[[ -n "$REPO_PATH" ]] || fail 'Falta --repo-path o MANUAL_MV_DEPLOY_REPO_PATH.'
[[ -n "$DEPLOY_REF" ]] || fail 'Falta --ref o MANUAL_MV_DEPLOY_REF.'

require_command ssh

SSH_ARGS=(ssh -tt -p "$PORT")
if [[ -n "$IDENTITY" ]]; then
  SSH_ARGS+=(-i "$IDENTITY" -o IdentitiesOnly=yes)
fi
SSH_ARGS+=("$USER_NAME@$HOST")

log "Conectando con $USER_NAME@$HOST para desplegar $DEPLOY_REF en $REPO_PATH"
"${SSH_ARGS[@]}" bash -s -- "$DEPLOY_REF" "$REPO_PATH" <<'EOF'
set -euo pipefail

DEPLOY_REF="$1"
REPO_PATH="$2"

if [[ ! -d "$REPO_PATH/.git" ]]; then
  echo "No existe un checkout git en $REPO_PATH. Haz el bootstrap manual una vez y vuelve a intentarlo." >&2
  exit 1
fi

cd "$REPO_PATH"
git fetch origin --prune

if git ls-remote --exit-code --heads origin "$DEPLOY_REF" >/dev/null 2>&1; then
  if git show-ref --verify --quiet "refs/heads/$DEPLOY_REF"; then
    git checkout "$DEPLOY_REF"
  else
    git checkout -b "$DEPLOY_REF" "origin/$DEPLOY_REF"
  fi

  git pull --ff-only origin "$DEPLOY_REF"
else
  git checkout --detach "$DEPLOY_REF"
fi

bash ./scripts/deploy-mv.sh
EOF

log 'Despliegue remoto completado'