# AGENTS.md

## Project Overview

ChatWave is a TypeScript chat app built with a single Convex backend and a Vite + React frontend.

## Workspaces

| Package | Path | Runtime | Description |
|---|---|---|---|
| `chatwave` | `app/` | Node.js | Vite frontend + Convex backend for channels, messages, and profiles |

## Commands

```bash
# Run from the app workspace
cd app

# Development
pnpm dev              # runs frontend + backend in parallel
pnpm dev:frontend     # vite dev server
pnpm dev:backend      # convex dev

# Build and checks
pnpm build            # vite build
pnpm lint             # typecheck + convex codegen check + build
```

## Architecture

The app is split into two parts under `app/`:

- **Frontend** (`src/`): React UI for channel selection, messaging, profile editing, and search.
- **Backend** (`convex/`): Convex schema and server functions.

Authentication is handled with `@convex-dev/auth` and currently supports both `Password` and `Anonymous` providers.

### Data Model

Primary application tables (in addition to auth tables):

- `channels` (`name`, `createdBy`)
- `messages` (`channelId`, `authorId`, `content`)
- `profiles` (`userId`, `name`, `avatarId`)

## Key Backend Files

| File | Purpose |
|---|---|
| `app/convex/schema.ts` | Convex schema: auth tables + channels/messages/profiles |
| `app/convex/auth.ts` | Convex Auth providers + logged-in user query |
| `app/convex/channels.ts` | Channel list/create/get functions |
| `app/convex/messages.ts` | Message list/send/search functions |
| `app/convex/profiles.ts` | Profile read/update + avatar upload URL |
| `app/convex/http.ts` | Registers auth HTTP routes |
| `app/convex/router.ts` | User-defined HTTP router (separate from auth route wiring) |

## Key Frontend Files

| File | Purpose |
|---|---|
| `app/src/App.tsx` | Top-level auth gating and app shell |
| `app/src/components/ChatApp.tsx` | Main authenticated chat layout and modal state |
| `app/src/components/ChannelSidebar.tsx` | Channel navigation and channel selection UI |
| `app/src/components/MessageArea.tsx` | Channel message list and message composer |
| `app/src/components/ProfileModal.tsx` | Profile editing flow |
| `app/src/components/SearchModal.tsx` | Message search flow |

## Code Conventions

- TypeScript strict mode is enabled.
- Convex functions should use validators from `convex/values` for all args.
- Auth-gated backend operations should call `getAuthUserId(ctx)` and handle unauthenticated access explicitly.
- Keep custom HTTP routes in `app/convex/router.ts`; `app/convex/http.ts` is used to register auth routes.
- Do not edit `app/convex/_generated/` manually.

## Environment Notes

- Local env is managed through `app/.env.local`.
- `app/setup.mjs` runs `npx @convex-dev/auth` to help initialize auth-related env configuration.

## Gotchas

- `convex dev` regenerates Convex code under `app/convex/_generated/`.
- The router split (`router.ts` + `http.ts`) is intentional to keep auth route wiring isolated.
