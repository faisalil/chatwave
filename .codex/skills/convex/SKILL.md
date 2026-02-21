---
name: convex
description: Developing and debugging Convex backend functionality, including defining schemas, writing queries/mutations/actions, setting up auth, handling file storage, building components, running migrations, and validating cloud data with Convex CLI table inspection commands.
---

# Convex Development Skill

## Before Writing Any Convex Code
1. Always read `./convex-best-practices.md` first for general conventions and patterns.
2. Read the relevant guide(s) below based on the task.
3. Read `./convex-cloud-debugging.md` when validating writes or inspecting data in a Convex cloud deployment.

## Reference Guides

| Task | File | When to Read |
|------|------|-------------|
| Auth & authorization | `./convex-auth-patterns.md` | Implementing auth, row-level security, session management |
| Best practices | `./convex-best-practices.md` | **Always** — read before any Convex work |
| Cloud data debugging | `./convex-cloud-debugging.md` | Validating writes, checking live documents, inspecting system tables, tracing data issues |
| Components | `./convex-components-guide.md` | Building or consuming reusable Convex components |
| File storage | `./convex-file-storage.md` | Uploads, downloads, serving files, storage APIs |
| Functions | `./convex-function-creator.md` | Writing queries, mutations, actions, or HTTP endpoints |
| Helpers | `./convex-helpers-guide.md` | Using convex-helpers library utilities |
| Migrations | `./convex-migration-helper.md` | Schema migrations, data backfills, breaking changes |
| Notifications | `./convex-notifications-component.md` | Sending notifications via Slack, webhooks, S3 with threading and retry |
| Schema | `./convex-schema-builder.md` | Defining or modifying `schema.ts`, validators, indexes |
| Workflow | `./convex-workflow-guide.md` | Durable workflow orchestration with retries, events, and status |

## Key Rules
- Read `convex-best-practices.md` on every task; it contains critical patterns that apply universally.
- Read `convex-schema-builder.md` alongside `convex-function-creator.md` when building new features (schema + functions go together).
- Check `convex-migration-helper.md` when modifying existing schema to determine if a migration is required.
- Read `convex-cloud-debugging.md` whenever data written by code must be validated against cloud state.
- Read `convex-workflow-guide.md` when implementing or debugging durable workflow orchestration.
- Read all guides that apply to the specific task; multiple guides are often required.
