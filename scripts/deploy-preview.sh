#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy-preview.sh [options]

Options:
  --fly-org <name>      Fly organization slug. Default: qamate-test-apps
  --fly-region <region> Fly region. Default: iad
  --format <kind>       Output format: human|json|dotenv. Default: human
  --help                Show this help.

Environment variables:
  CONVEX_DEPLOY_KEY_PREVIEW   Required. Convex preview deploy key.
  FLY_API_TOKEN               Optional locally, required in CI.
EOF
}

err() {
  echo "Error: $*" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

FLY_ORG="qamate-test-apps"
FLY_REGION="iad"
FORMAT="human"

log() {
  if [[ "$FORMAT" == "human" ]]; then
    echo "$*"
  else
    echo "$*" >&2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fly-org)
      FLY_ORG="${2:-}"
      shift 2
      ;;
    --fly-region)
      FLY_REGION="${2:-}"
      shift 2
      ;;
    --format)
      FORMAT="${2:-}"
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

if [[ ! "$FORMAT" =~ ^(human|json|dotenv)$ ]]; then
  err "--format must be one of: human, json, dotenv"
fi

[[ -n "${CONVEX_DEPLOY_KEY_PREVIEW:-}" ]] || err "CONVEX_DEPLOY_KEY_PREVIEW must be set"

cd "$REPO_ROOT"

if [[ -z "${CONVEX_JWT_PRIVATE_KEY:-}" || -z "${CONVEX_JWKS:-}" ]]; then
  DEV_ENV_OUTPUT="$(cd "${REPO_ROOT}/app" && npx convex env list 2>/dev/null || true)"
  DEV_JWT_PRIVATE_KEY="$(echo "$DEV_ENV_OUTPUT" | sed -n 's/^JWT_PRIVATE_KEY=//p')"
  DEV_JWKS="$(echo "$DEV_ENV_OUTPUT" | sed -n 's/^JWKS=//p')"

  if [[ -z "${CONVEX_JWT_PRIVATE_KEY:-}" && -n "$DEV_JWT_PRIVATE_KEY" ]]; then
    export CONVEX_JWT_PRIVATE_KEY="$DEV_JWT_PRIVATE_KEY"
  fi
  if [[ -z "${CONVEX_JWKS:-}" && -n "$DEV_JWKS" ]]; then
    export CONVEX_JWKS="$DEV_JWKS"
  fi
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" ]]; then
  err "Detached HEAD is not supported for preview deploys. Check out a branch and retry."
fi

if git rev-parse --abbrev-ref "@{upstream}" >/dev/null 2>&1; then
  COUNTS="$(git rev-list --left-right --count "@{upstream}...HEAD")"
  BEHIND="$(echo "$COUNTS" | awk '{print $1}')"
  AHEAD="$(echo "$COUNTS" | awk '{print $2}')"
  if [[ "$BEHIND" -gt 0 ]]; then
    err "Branch is behind upstream by ${BEHIND} commit(s). Pull/rebase first."
  fi
  if [[ "$AHEAD" -gt 0 ]]; then
    log "==> Pushing ${AHEAD} unpushed commit(s) to origin/${BRANCH}"
    git push origin "$BRANCH"
  fi
else
  log "==> Branch has no upstream. Pushing and setting upstream to origin/${BRANCH}"
  git push -u origin "$BRANCH"
fi

SHORT_SHA="$(git rev-parse --short=8 HEAD)"
RAND_SUFFIX="$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
FLY_APP="chatwave-pr-${SHORT_SHA}-${RAND_SUFFIX}"
PREVIEW_NAME="preview-${SHORT_SHA}-${RAND_SUFFIX}"
FLY_URL="https://${FLY_APP}.fly.dev"
DESTROY_SCRIPT="${SCRIPT_DIR}/destroy-preview.sh"
DESTROY_COMMAND="${DESTROY_SCRIPT} --app ${FLY_APP} --preview-name ${PREVIEW_NAME}"

log "==> Deploying preview app ${FLY_APP}"
if ! DEPLOY_OUTPUT="$(
  CONVEX_DEPLOY_KEY="$CONVEX_DEPLOY_KEY_PREVIEW" \
    "${SCRIPT_DIR}/deploy-env.sh" \
    --env preview \
    --fly-app "$FLY_APP" \
    --fly-org "$FLY_ORG" \
    --fly-region "$FLY_REGION" \
    --preview-name "$PREVIEW_NAME"
)"; then
  if [[ -n "${DEPLOY_OUTPUT:-}" ]]; then
    echo "$DEPLOY_OUTPUT" >&2
  fi
  err "Preview deployment failed"
fi

if [[ "$FORMAT" == "human" ]]; then
  echo "$DEPLOY_OUTPUT"
else
  echo "$DEPLOY_OUTPUT" >&2
fi

CONVEX_URL="$(echo "$DEPLOY_OUTPUT" | sed -n 's/^CONVEX_URL=//p' | tail -1)"

if [[ "$FORMAT" == "human" ]]; then
  echo ""
  echo "Preview deployment is live."
  echo "FLY_APP=${FLY_APP}"
  echo "FLY_URL=${FLY_URL}"
  if [[ -n "$CONVEX_URL" ]]; then
    echo "CONVEX_URL=${CONVEX_URL}"
  fi
  echo "CONVEX_PREVIEW_NAME=${PREVIEW_NAME}"
  echo ""
  echo "WARNING: This preview app keeps running until you destroy it."
  echo "Teardown command:"
  echo "${DESTROY_COMMAND}"
elif [[ "$FORMAT" == "dotenv" ]]; then
  cat <<EOF
BASE_URL=${FLY_URL}
PREVIEW_BASE_URL=${FLY_URL}
PREVIEW_FLY_APP=${FLY_APP}
PREVIEW_FLY_URL=${FLY_URL}
PREVIEW_CONVEX_PREVIEW_NAME=${PREVIEW_NAME}
PREVIEW_CONVEX_URL=${CONVEX_URL}
DESTROY_SCRIPT=${DESTROY_SCRIPT}
DESTROY_APP=${FLY_APP}
DESTROY_PREVIEW_NAME=${PREVIEW_NAME}
DESTROY_COMMAND=${DESTROY_COMMAND}
EOF
else
  cat <<EOF
{"baseUrl":"${FLY_URL}","env":{"PREVIEW_BASE_URL":"${FLY_URL}","PREVIEW_FLY_APP":"${FLY_APP}","PREVIEW_FLY_URL":"${FLY_URL}","PREVIEW_CONVEX_PREVIEW_NAME":"${PREVIEW_NAME}","PREVIEW_CONVEX_URL":"${CONVEX_URL}"},"destroy":{"script":"${DESTROY_SCRIPT}","args":["--app","${FLY_APP}","--preview-name","${PREVIEW_NAME}"],"command":"${DESTROY_COMMAND}"}}
EOF
fi
