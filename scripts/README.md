# Deployment Scripts

This folder contains deployment helpers for ChatWave on Convex + Fly.io.

## Scripts

### `deploy-env.sh`

Deploys a target environment (`prod`, `dev`, or `preview`) end-to-end:

1. Ensures Fly app exists.
2. Deploys Convex functions.
3. Ensures Convex auth keys (`JWT_PRIVATE_KEY`, `JWKS`) exist, seeding from env if provided.
4. Runs `seed` on the target Convex deployment.
5. Deploys frontend to Fly with the resolved `VITE_CONVEX_URL`.
6. Runs HTTP smoke check on the Fly URL.

Usage:

```bash
./scripts/deploy-env.sh --env <prod|dev|preview> --fly-app <name> [--fly-org qamate-test-apps] [--fly-region iad] [--preview-name <name>]
```

### `deploy-preview.sh`

Creates a one-off preview environment from current committed `HEAD`:

1. Pushes branch if local commits are ahead.
2. Generates unique Fly app + Convex preview name.
3. Calls `deploy-env.sh --env preview`.
4. Returns deployment metadata in a standard format.

Usage:

```bash
./scripts/deploy-preview.sh [--fly-org qamate-test-apps] [--fly-region iad] [--format human|json|dotenv]
```

Output formats:

- `human` (default): readable logs + summary.
- `json`: single JSON object to `stdout` with:
  - `baseUrl`
  - `env`
  - `destroy`
- `dotenv`: `KEY=VALUE` lines for shell consumption.

For `json` and `dotenv`, progress logs are written to `stderr` and metadata is
written to `stdout` so downstream scripts can consume output reliably.

JSON shape:

```json
{
  "baseUrl": "https://<app>.fly.dev",
  "env": {
    "PREVIEW_BASE_URL": "https://<app>.fly.dev",
    "PREVIEW_FLY_APP": "chatwave-pr-...",
    "PREVIEW_FLY_URL": "https://<app>.fly.dev",
    "PREVIEW_CONVEX_PREVIEW_NAME": "preview-...",
    "PREVIEW_CONVEX_URL": "https://....convex.cloud"
  },
  "destroy": {
    "script": "/absolute/path/to/scripts/destroy-preview.sh",
    "args": ["--app", "chatwave-pr-...", "--preview-name", "preview-..."],
    "command": "/absolute/path/to/scripts/destroy-preview.sh --app ... --preview-name ..."
  }
}
```

Example consumer:

```bash
meta="$(./scripts/deploy-preview.sh --format json)"
base_url="$(jq -r '.baseUrl' <<<"$meta")"
app="$(jq -r '.env.PREVIEW_FLY_APP' <<<"$meta")"
preview_name="$(jq -r '.env.PREVIEW_CONVEX_PREVIEW_NAME' <<<"$meta")"
./scripts/destroy-preview.sh --app "$app" --preview-name "$preview_name"
```

### `destroy-preview.sh`

Destroys the Fly preview app and prints a reminder for Convex preview lifecycle.

Usage:

```bash
./scripts/destroy-preview.sh --app <fly_app> [--preview-name <convex_preview_name>]
```
