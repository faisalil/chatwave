# ChatWave

ChatWave is built with [Convex](https://convex.dev) as its backend and was scaffolded with [Chef](https://chef.convex.dev).
You can find docs about Chef with useful information like how to deploy to production [here](https://docs.convex.dev/chef).
  
This project is connected to the Convex deployment named [`befitting-rat-184`](https://dashboard.convex.dev/d/befitting-rat-184).

## Multi-tenant model

ChatWave is workspace-scoped (multi-tenant):
- Every user belongs to exactly one workspace.
- Users only see channels and messages inside their workspace.
- On first sign-in, ChatWave auto-creates a personal workspace and a default `#general` channel.
  
## Project structure
  
The frontend code is in the `app` directory and is built with [Vite](https://vitejs.dev/).
  
The backend code is in the `convex` directory.
  
`npm run dev` will start the frontend and backend servers.

## App authentication

ChatWave uses [Convex Auth](https://auth.convex.dev/) with password authentication (`sign in` / `sign up`).

## Seed test data

Use the seed action to create repeatable multi-tenant test data:

```bash
npm run seed
```

Seed behavior:
- Idempotent (safe to run multiple times).
- Creates two test workspaces, with owner/member users in each workspace.
- Creates channels `#general`, `#product`, and `#random` in each workspace.
- Adds seeded messages to each channel only when that channel is empty.

Seed users (all use password `testtest123`):
- `seed.owner.a@chatwave.test`
- `seed.member.a@chatwave.test`
- `seed.owner.b@chatwave.test`
- `seed.member.b@chatwave.test`

## Developing and deploying your app

Check out the [Convex docs](https://docs.convex.dev/) for more information on how to develop with Convex.
* If you're new to Convex, the [Overview](https://docs.convex.dev/understanding/) is a good place to start
* Check out the [Hosting and Deployment](https://docs.convex.dev/production/) docs for how to deploy your app
* Read the [Best Practices](https://docs.convex.dev/understanding/best-practices/) guide for tips on how to improve you app further

## Deployment automation (Convex + Fly.io)

This repository deploys both Convex and the Vite frontend to Fly.io.

### Fly app names

- Production: `chatwave-prod-c05a04c2`
- Development: `chatwave-dev-c05a04c2`
- Preview: `chatwave-pr-<shortsha>-<rand4>` (new app on each preview run)

### GitHub Actions

- `.github/workflows/deploy-production.yml`
  - Trigger: Release `published` and `workflow_dispatch`
  - Guard: release target must be `main`
  - Deploys Convex production + Fly production app
- `.github/workflows/deploy-development.yml`
  - Trigger: push to `main` and `workflow_dispatch`
  - Deploys Convex development cloud + Fly development app

### Required GitHub secrets

- `FLY_API_TOKEN`
- `CONVEX_DEPLOY_KEY_PROD`
- `CONVEX_DEPLOY_KEY_DEV`
- `CONVEX_DEPLOY_KEY_PREVIEW`
- `CONVEX_AUTH_JWT_PRIVATE_KEY`
- `CONVEX_AUTH_JWKS`

Set them with `gh`:

```bash
gh secret set FLY_API_TOKEN --repo faisalil/chatwave
gh secret set CONVEX_DEPLOY_KEY_PROD --repo faisalil/chatwave
gh secret set CONVEX_DEPLOY_KEY_DEV --repo faisalil/chatwave
gh secret set CONVEX_DEPLOY_KEY_PREVIEW --repo faisalil/chatwave
gh secret set CONVEX_AUTH_JWT_PRIVATE_KEY --repo faisalil/chatwave
gh secret set CONVEX_AUTH_JWKS --repo faisalil/chatwave
```

### Local deployment scripts

- `./scripts/deploy-env.sh --env prod|dev|preview ...`
- `./scripts/deploy-preview.sh`
- `./scripts/destroy-preview.sh --app <fly_app> [--preview-name <convex_preview>]`

Preview workflow:

```bash
# Requires CONVEX_DEPLOY_KEY_PREVIEW in your environment
./scripts/deploy-preview.sh

# Later: destroy the Fly preview app to avoid extra cost/resources
./scripts/destroy-preview.sh --app <fly_app> --preview-name <convex_preview_name>
```

`deploy-preview.sh` allows dirty local files but deploys from committed `HEAD`.
If commits are not pushed, it pushes the current branch before deploying.
It also auto-loads auth keys (`JWT_PRIVATE_KEY` / `JWKS`) from your current dev
deployment when possible, so preview auth flows work.

## HTTP API

User-defined http routes are defined in the `convex/router.ts` file. We split these routes into a separate file from `convex/http.ts` to allow us to prevent the LLM from modifying the authentication routes.
