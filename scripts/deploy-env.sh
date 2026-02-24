#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy-env.sh --env <prod|dev|preview> --fly-app <name> [options]

Options:
  --env <prod|dev|preview>   Deployment target environment.
  --fly-app <name>           Fly app name to deploy.
  --fly-org <name>           Fly organization slug. Default: qamate-test-apps
  --fly-region <region>      Fly primary region. Default: iad
  --preview-name <name>      Required when --env preview.
  --help                     Show this help.

Environment variables:
  CONVEX_DEPLOY_KEY          Required. Convex deploy key for target deployment.
  FLY_API_TOKEN              Optional locally, required in CI.
  CONVEX_JWT_PRIVATE_KEY     Optional value used to seed missing JWT_PRIVATE_KEY.
  CONVEX_JWKS                Optional value used to seed missing JWKS.
EOF
}

err() {
  echo "Error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || err "Required command not found: $1"
}

ensure_auth_envs() {
  local target_label="$1"
  shift
  local target_args=("$@")

  local env_output=""
  env_output="$(npx convex env "${target_args[@]}" list 2>/dev/null || true)"

  local has_jwt=0
  local has_jwks=0
  if echo "$env_output" | grep -q '^JWT_PRIVATE_KEY='; then
    has_jwt=1
  fi
  if echo "$env_output" | grep -q '^JWKS='; then
    has_jwks=1
  fi

  if [[ "$has_jwt" -eq 1 && "$has_jwks" -eq 1 ]]; then
    return 0
  fi

  if [[ -n "${CONVEX_JWT_PRIVATE_KEY:-}" && -n "${CONVEX_JWKS:-}" ]]; then
    echo "==> Seeding missing auth env vars on ${target_label}"
    npx convex env "${target_args[@]}" set JWT_PRIVATE_KEY -- "$CONVEX_JWT_PRIVATE_KEY" >/dev/null
    npx convex env "${target_args[@]}" set JWKS -- "$CONVEX_JWKS" >/dev/null
    return 0
  fi

  err "Deployment ${target_label} is missing JWT_PRIVATE_KEY/JWKS. Set CONVEX_JWT_PRIVATE_KEY and CONVEX_JWKS."
}

run_seed() {
  local target_label="$1"
  shift
  local target_args=("$@")

  echo "==> Running seed on ${target_label}"
  npx convex run "${target_args[@]}" seed
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${REPO_ROOT}/app"

DEPLOY_ENV=""
FLY_APP=""
FLY_ORG="qamate-test-apps"
FLY_REGION="iad"
PREVIEW_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      DEPLOY_ENV="${2:-}"
      shift 2
      ;;
    --fly-app)
      FLY_APP="${2:-}"
      shift 2
      ;;
    --fly-org)
      FLY_ORG="${2:-}"
      shift 2
      ;;
    --fly-region)
      FLY_REGION="${2:-}"
      shift 2
      ;;
    --preview-name)
      PREVIEW_NAME="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      err "Unknown argument: $1"
      ;;
  esac
done

[[ -n "$DEPLOY_ENV" ]] || err "--env is required"
[[ -n "$FLY_APP" ]] || err "--fly-app is required"
[[ "$DEPLOY_ENV" =~ ^(prod|dev|preview)$ ]] || err "--env must be one of: prod, dev, preview"

if [[ "$DEPLOY_ENV" == "preview" && -z "$PREVIEW_NAME" ]]; then
  err "--preview-name is required when --env preview"
fi

[[ -n "${CONVEX_DEPLOY_KEY:-}" ]] || err "CONVEX_DEPLOY_KEY must be set"

require_cmd git
require_cmd fly
require_cmd npx
require_cmd curl

if [[ -n "${FLY_API_TOKEN:-}" ]]; then
  export FLY_API_TOKEN
fi

if ! fly auth whoami >/dev/null 2>&1; then
  err "Fly authentication is missing. Set FLY_API_TOKEN or run 'fly auth login'."
fi

if [[ ! -d "$APP_DIR" ]]; then
  err "App directory not found at ${APP_DIR}"
fi

echo "==> Ensuring Fly app exists: ${FLY_APP}"
if ! fly status -a "$FLY_APP" >/dev/null 2>&1; then
  fly apps create "$FLY_APP" -o "$FLY_ORG" --yes
fi

FLY_URL="https://${FLY_APP}.fly.dev"

pushd "$APP_DIR" >/dev/null

echo "==> Deploying Convex (${DEPLOY_ENV})"
DEPLOY_CMD=(
  npx convex deploy --yes
  --cmd "bash -lc 'echo __CONVEX_URL__=\$VITE_CONVEX_URL'"
  --cmd-url-env-var-name VITE_CONVEX_URL
)
if [[ "$DEPLOY_ENV" == "preview" ]]; then
  DEPLOY_CMD+=(--preview-create "$PREVIEW_NAME")
fi

if ! DEPLOY_OUTPUT="$("${DEPLOY_CMD[@]}" 2>&1)"; then
  echo "$DEPLOY_OUTPUT"
  err "Convex deploy failed"
fi
echo "$DEPLOY_OUTPUT"

CONVEX_URL="$(echo "$DEPLOY_OUTPUT" | sed -nE 's/.*__CONVEX_URL__=(https:\/\/[^[:space:]]+).*/\1/p' | tail -1)"
if [[ -z "$CONVEX_URL" ]]; then
  CONVEX_URL="$(echo "$DEPLOY_OUTPUT" | grep -Eo 'https://[a-z0-9-]+\.convex\.cloud' | tail -1 || true)"
fi
[[ -n "$CONVEX_URL" ]] || err "Unable to determine Convex URL from deploy output"

if [[ "$DEPLOY_ENV" == "preview" ]]; then
  ensure_auth_envs "preview ${PREVIEW_NAME}" --preview-name "$PREVIEW_NAME"
  run_seed "preview ${PREVIEW_NAME}" --preview-name "$PREVIEW_NAME"
else
  ensure_auth_envs "$DEPLOY_ENV deployment"
  run_seed "$DEPLOY_ENV deployment"
fi

echo "==> Deploying Fly app ${FLY_APP}"
fly deploy . \
  --config fly.toml \
  -a "$FLY_APP" \
  --primary-region "$FLY_REGION" \
  --build-arg "VITE_CONVEX_URL=${CONVEX_URL}" \
  --yes

popd >/dev/null

echo "==> HTTP smoke check: ${FLY_URL}"
max_attempts=20
for attempt in $(seq 1 "$max_attempts"); do
  if curl -fsS --max-time 10 "$FLY_URL" >/dev/null; then
    break
  fi
  if [[ "$attempt" == "$max_attempts" ]]; then
    err "Smoke check failed for ${FLY_URL}"
  fi
  sleep 3
done

echo ""
echo "Deployment complete."
echo "ENV=${DEPLOY_ENV}"
echo "FLY_APP=${FLY_APP}"
echo "FLY_URL=${FLY_URL}"
echo "CONVEX_URL=${CONVEX_URL}"
if [[ "$DEPLOY_ENV" == "preview" ]]; then
  echo "CONVEX_PREVIEW_NAME=${PREVIEW_NAME}"
fi
