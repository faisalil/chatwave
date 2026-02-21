#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  destroy-preview.sh --app <fly_app> [--preview-name <convex_preview>]

Options:
  --app <fly_app>             Required. Fly preview app to destroy.
  --preview-name <name>       Optional. Convex preview deployment name for reminders.
  --help                      Show this help.
EOF
}

err() {
  echo "Error: $*" >&2
  exit 1
}

FLY_APP=""
PREVIEW_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      FLY_APP="${2:-}"
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

[[ -n "$FLY_APP" ]] || err "--app is required"

echo "==> Destroying Fly preview app ${FLY_APP}"
fly apps destroy "$FLY_APP" --yes

echo ""
echo "Fly preview app destroyed: ${FLY_APP}"
if [[ -n "$PREVIEW_NAME" ]]; then
  echo "Convex preview deployment was: ${PREVIEW_NAME}"
fi
echo "Reminder: Convex preview deployments are managed separately (dashboard/retention policy)."
