#!/usr/bin/env bash
# Arranca un quick tunnel de Cloudflare hacia el puerto 80 local,
# extrae la URL asignada, actualiza CORS en backend/.env y reinicia el backend.
#
# Uso: bash scripts/cloudflared-quick.sh
# Requiere: cloudflared instalado, contenedores de producción corriendo.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_ENV_FILE="$ROOT_DIR/backend/.env"
TUNNEL_LOG="$(mktemp)"

cleanup() {
  rm -f "$TUNNEL_LOG"
  kill "$CLOUDFLARED_PID" 2>/dev/null || true
}
trap cleanup EXIT

log() { printf '[tunnel] %s\n' "$*"; }

command -v cloudflared >/dev/null 2>&1 || {
  echo 'cloudflared no está instalado. Instálalo con:'
  echo '  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared'
  echo '  sudo install cloudflared /usr/local/bin/'
  exit 1
}

log 'Iniciando quick tunnel hacia http://localhost:80 ...'
cloudflared tunnel --url http://localhost:80 2>&1 | tee "$TUNNEL_LOG" &
CLOUDFLARED_PID=$!

TUNNEL_URL=''
for i in $(seq 1 30); do
  TUNNEL_URL="$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
  [[ -n "$TUNNEL_URL" ]] && break
  sleep 1
done

[[ -n "$TUNNEL_URL" ]] || { log 'No se pudo obtener la URL del túnel'; exit 1; }
log "URL del túnel: $TUNNEL_URL"

if [[ -f "$BACKEND_ENV_FILE" ]]; then
  BASE_ORIGINS="$(grep '^ALLOWED_ORIGINS=' "$BACKEND_ENV_FILE" | cut -d= -f2- | sed "s|,\?$TUNNEL_URL||g" | sed 's/,$//')"
  NEW_ORIGINS="$BASE_ORIGINS,$TUNNEL_URL"

  sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=$NEW_ORIGINS|" "$BACKEND_ENV_FILE"
  sed -i "s|^SOCKET_IO_CORS_ORIGIN=.*|SOCKET_IO_CORS_ORIGIN=$NEW_ORIGINS|" "$BACKEND_ENV_FILE"
  log 'CORS actualizado en backend/.env'

  if docker ps --filter name=cluedo_backend_prod --filter status=running -q | grep -q .; then
    docker restart cluedo_backend_prod
    log 'Backend reiniciado con el nuevo origen'
  fi
fi

log "Túnel activo. Acceso desde Eduroam: $TUNNEL_URL"
log 'Ctrl+C para detener.'

wait "$CLOUDFLARED_PID"
