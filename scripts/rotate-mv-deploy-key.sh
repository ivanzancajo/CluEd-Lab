#!/usr/bin/env bash

set -euo pipefail

log() {
  printf '[rotate-mv-key] %s\n' "$*"
}

fail() {
  printf '[rotate-mv-key] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Falta el comando requerido: $1"
}

usage() {
  cat <<'EOF'
Uso:
  scripts/rotate-mv-deploy-key.sh [opciones]

Opciones:
  --host HOST                     Host de la MV.
  --port PORT                     Puerto SSH de la MV. Por defecto: 20381.
  --user USER                     Usuario SSH de la MV.
  --repo-slug OWNER/REPO          Repositorio GitHub. Si no se indica, se deriva de origin.
  --key-path PATH                 Ruta base de la nueva clave. Por defecto: ~/.ssh/id_ed25519_tfg_mv_actions_rotacion.
  --comment TEXT                  Comentario de la nueva clave.
  --bootstrap-identity PATH       Clave existente para entrar en la MV sin password durante la rotacion.
  --secret-name NAME              Secreto GitHub a actualizar. Por defecto: MV_SSH_PRIVATE_KEY_B64.
  --workflow-name NAME            Workflow a relanzar. Por defecto: deploy-mv-lab.yml.
  --workflow-ref REF              Ref git sobre la que lanzar el workflow. Por defecto: develop.
  --workflow-input-ref REF        Valor del input git_ref. Por defecto: develop.
  --retire-comment TEXT           Comentario de la clave antigua a retirar de authorized_keys tras validar el workflow.
  --delete-old-local-key PATH     Ruta base de la clave antigua a borrar localmente tras validar el workflow.
  --skip-gh-update                No actualiza el secreto en GitHub.
  --skip-workflow-rerun           No relanza ni espera el workflow.
  --force                         Sobrescribe la nueva clave si ya existe.
  --help                          Muestra esta ayuda.

Descripcion:
  Automatiza la rotacion segura de la clave SSH de despliegue con solape temporal:
  genera una clave nueva, la instala en la MV, valida acceso, prepara el secreto Base64,
  actualiza GitHub opcionalmente y puede relanzar el workflow antes de retirar la clave antigua.

Notas:
  - Requiere ssh, ssh-keygen, ssh-copy-id y base64.
  - Si no se usa --skip-gh-update, tambien requiere gh autenticado.
  - La retirada de la clave antigua solo se hace si indicas --retire-comment y el workflow relanzado termina bien.
EOF
}

derive_repo_slug() {
  local origin_url

  origin_url="$(git config --get remote.origin.url 2>/dev/null || true)"
  [[ -n "$origin_url" ]] || fail 'No se pudo derivar el repositorio desde remote.origin.url; usa --repo-slug.'

  case "$origin_url" in
    git@github.com:*.git)
      printf '%s' "${origin_url#git@github.com:}" | sed 's/\.git$//'
      ;;
    git@github.com:*)
      printf '%s' "${origin_url#git@github.com:}"
      ;;
    https://github.com/*.git)
      printf '%s' "${origin_url#https://github.com/}" | sed 's/\.git$//'
      ;;
    https://github.com/*)
      printf '%s' "${origin_url#https://github.com/}"
      ;;
    *)
      fail "No se pudo derivar el repositorio desde origin: $origin_url"
      ;;
  esac
}

require_gh() {
  require_command gh
  gh auth status >/dev/null 2>&1 || fail 'GitHub CLI no esta autenticado. Ejecuta gh auth login o usa --skip-gh-update.'
}

HOST="${MV_HOST:-}"
PORT="${MV_PORT:-20381}"
USER_NAME="${MV_USER:-}"
REPO_SLUG=""
KEY_PATH="$HOME/.ssh/id_ed25519_tfg_mv_actions_rotacion"
COMMENT="github-actions-tfg-mv-rotacion-$(date +%Y%m%d-%H%M%S)"
BOOTSTRAP_IDENTITY=""
SECRET_NAME="MV_SSH_PRIVATE_KEY_B64"
WORKFLOW_NAME="deploy-mv-lab.yml"
WORKFLOW_REF="develop"
WORKFLOW_INPUT_REF="develop"
RETIRE_COMMENT=""
DELETE_OLD_LOCAL_KEY=""
SKIP_GH_UPDATE=0
SKIP_WORKFLOW_RERUN=0
FORCE_OVERWRITE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
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
    --repo-slug)
      REPO_SLUG="$2"
      shift 2
      ;;
    --key-path)
      KEY_PATH="$2"
      shift 2
      ;;
    --comment)
      COMMENT="$2"
      shift 2
      ;;
    --bootstrap-identity)
      BOOTSTRAP_IDENTITY="$2"
      shift 2
      ;;
    --secret-name)
      SECRET_NAME="$2"
      shift 2
      ;;
    --workflow-name)
      WORKFLOW_NAME="$2"
      shift 2
      ;;
    --workflow-ref)
      WORKFLOW_REF="$2"
      shift 2
      ;;
    --workflow-input-ref)
      WORKFLOW_INPUT_REF="$2"
      shift 2
      ;;
    --retire-comment)
      RETIRE_COMMENT="$2"
      shift 2
      ;;
    --delete-old-local-key)
      DELETE_OLD_LOCAL_KEY="$2"
      shift 2
      ;;
    --skip-gh-update)
      SKIP_GH_UPDATE=1
      shift
      ;;
    --skip-workflow-rerun)
      SKIP_WORKFLOW_RERUN=1
      shift
      ;;
    --force)
      FORCE_OVERWRITE=1
      shift
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

[[ -n "$HOST" ]] || fail 'Falta --host o MV_HOST.'
[[ -n "$USER_NAME" ]] || fail 'Falta --user o MV_USER.'

require_command ssh
require_command ssh-keygen
require_command ssh-copy-id
require_command base64

if [[ -z "$REPO_SLUG" && ( $SKIP_GH_UPDATE -eq 0 || $SKIP_WORKFLOW_RERUN -eq 0 ) ]]; then
  REPO_SLUG="$(derive_repo_slug)"
fi

if [[ $SKIP_GH_UPDATE -eq 0 || $SKIP_WORKFLOW_RERUN -eq 0 ]]; then
  require_gh
  [[ -n "$REPO_SLUG" ]] || fail 'Falta --repo-slug o no se pudo derivar el repositorio.'
fi

if [[ -e "$KEY_PATH" || -e "$KEY_PATH.pub" ]]; then
  if [[ $FORCE_OVERWRITE -eq 1 ]]; then
    rm -f "$KEY_PATH" "$KEY_PATH.pub"
  else
    fail "La nueva clave ya existe en $KEY_PATH. Usa --force para sobrescribirla o cambia --key-path."
  fi
fi

log "Generando nueva clave en $KEY_PATH"
ssh-keygen -t ed25519 -N "" -f "$KEY_PATH" -C "$COMMENT" >/dev/null

SSH_COPY_ID_ARGS=(ssh-copy-id -i "$KEY_PATH.pub" -p "$PORT")
if [[ -n "$BOOTSTRAP_IDENTITY" ]]; then
  SSH_COPY_ID_ARGS+=(-o IdentitiesOnly=yes -o IdentityFile="$BOOTSTRAP_IDENTITY")
fi
SSH_COPY_ID_ARGS+=("$USER_NAME@$HOST")

log 'Instalando la nueva clave publica en la MV'
"${SSH_COPY_ID_ARGS[@]}"

log 'Validando acceso con la nueva clave'
ssh -i "$KEY_PATH" -o IdentitiesOnly=yes -o BatchMode=yes -p "$PORT" "$USER_NAME@$HOST" 'echo ok' >/dev/null

KEY_B64="$(base64 -w0 "$KEY_PATH")"
log 'Clave nueva validada; Base64 preparado'

if [[ $SKIP_GH_UPDATE -eq 0 ]]; then
  log "Actualizando el secreto $SECRET_NAME en $REPO_SLUG"
  printf '%s' "$KEY_B64" | gh secret set "$SECRET_NAME" --repo "$REPO_SLUG"
fi

if [[ $SKIP_WORKFLOW_RERUN -eq 0 ]]; then
  log "Relanzando el workflow $WORKFLOW_NAME"
  gh workflow run "$WORKFLOW_NAME" --repo "$REPO_SLUG" --ref "$WORKFLOW_REF" -f "git_ref=$WORKFLOW_INPUT_REF"
  log 'Esperando a que termine el workflow relanzado'
  gh run watch --repo "$REPO_SLUG"
fi

if [[ -n "$RETIRE_COMMENT" ]]; then
  if [[ $SKIP_WORKFLOW_RERUN -eq 1 ]]; then
    log 'No se retira la clave antigua porque se ha omitido la validacion del workflow.'
  else
    printf -v RETIRE_MARKER_Q '%q' " $RETIRE_COMMENT"
    log "Retirando de la MV la clave antigua con comentario: $RETIRE_COMMENT"
    ssh -i "$KEY_PATH" -o IdentitiesOnly=yes -o BatchMode=yes -p "$PORT" "$USER_NAME@$HOST" \
      "tmp=\$(mktemp) && grep -vF -- $RETIRE_MARKER_Q ~/.ssh/authorized_keys > \$tmp && cat \$tmp > ~/.ssh/authorized_keys && rm -f \$tmp && chmod 600 ~/.ssh/authorized_keys"
  fi
fi

if [[ -n "$DELETE_OLD_LOCAL_KEY" ]]; then
  if [[ $SKIP_WORKFLOW_RERUN -eq 1 ]]; then
    log 'No se borra la clave antigua local porque se ha omitido la validacion del workflow.'
  else
    log "Borrando la clave antigua local en $DELETE_OLD_LOCAL_KEY"
    rm -f "$DELETE_OLD_LOCAL_KEY" "$DELETE_OLD_LOCAL_KEY.pub"
  fi
fi

log 'Rotacion completada'
printf '\n'
printf 'Nueva clave privada: %s\n' "$KEY_PATH"
printf 'Nueva clave publica: %s.pub\n' "$KEY_PATH"
printf 'Secreto Base64 preparado: %s\n' "$SECRET_NAME"
if [[ $SKIP_GH_UPDATE -eq 1 ]]; then
  printf 'Valor Base64 para GitHub:\n%s\n' "$KEY_B64"
fi