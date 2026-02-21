# Convex Cloud Data Debugging

Use this guide to validate that writes actually landed in Convex cloud data and to investigate mismatches between expected and actual backend state.

## Core Table Inspection Commands

Run from the Convex project root:

```bash
npx convex data
```

Use this to list table names and document counts.

Inspect documents in a specific table:

```bash
npx convex data tasks
```

This prints the latest 100 documents and first-level fields.

Change output volume and creation-time ordering:

```bash
npx convex data tasks --limit 200
npx convex data tasks --order asc
npx convex data tasks --order desc
```

Inspect system tables when needed:

```bash
npx convex data _storage
```

## Handle Filtered Debugging

`npx convex data <table>` does not support field filters.

Use one of these options:
- Use the Convex dashboard Data page for ad hoc filtering.
- Run a targeted query with `npx convex run` for repeatable/debuggable checks.

Example:

```bash
npx convex run debug:getTaskByExternalId '{"externalId":"abc_123"}'
```

Useful flags while debugging:
- `--watch`: re-run continuously on data changes.
- `--push`: use local function code without deploying first.
- `--prod`: run against production deployment.

## Debug Workflow for "Write Then Verify"

1. Trigger the write path (mutation/action/http endpoint/CLI flow).
2. Inspect the primary table with `npx convex data <table>`.
3. Inspect related tables (including system tables like `_storage`) for side effects.
4. If data is missing or wrong, run a targeted query with `npx convex run` to isolate the lookup path.
5. Correlate with server logs:

```bash
npx convex logs
# or, in local dev:
npx convex dev --tail-logs
```

## Safety Rules

- Prefer read-only queries for debugging production state.
- Avoid writing one-off debug mutations in production unless explicitly required.
- Remove temporary debug functions after the issue is resolved.
