# Notifications Component Guide

Documentation for the local Convex notifications component at `convex/components/notifications/`.

## When to Use

Read this guide when:
- Sending notifications to Slack channels, webhooks, or S3
- Managing notification destinations (create, update, delete)
- Implementing topic-based threading (Slack threads, webhook/S3 correlation)
- Querying delivery logs and debugging notification failures
- Testing destination connectivity

## Component Overview

The notifications component is a sandboxed Convex component that provides **delivery infrastructure** for notifications. It owns:
- **Destinations** — where to send (Slack, Webhook, S3) scoped by an opaque `scopeId`
- **Delivery execution** — async with automatic retry (3 attempts, backoff: 0s → 5s → 30s)
- **Topic-based threading** — Slack `thread_ts` threading, webhook/S3 correlation headers
- **Delivery logs** — full audit trail of every delivery attempt
- **Maintenance** — daily cron cleanup of logs/anchors older than 30 days

It does NOT own: notification definitions, business logic, event routing, or content formatting.

## Directory Structure

```
convex/components/notifications/
├── convex.config.ts      # defineComponent("notifications")
├── schema.ts             # destinations, logs, topicAnchors tables
├── destinations.ts       # CRUD: create, update, remove, get, list
├── send.ts               # Public send action (main entry point)
├── deliver.ts            # Internal _deliver action + retry logic
├── test.ts               # testDestination action
├── logs.ts               # listLogs, getLog queries
├── maintenance.ts        # Cleanup internal mutations
├── crons.ts              # Daily cleanup schedules
└── lib/
    ├── slack.ts           # Slack chat.postMessage helper
    ├── webhook.ts         # HTTP webhook delivery helper
    └── s3.ts              # S3 PutObject with AWS Sig V4
```

## Host Integration

### Registration

```typescript
// convex/convex.config.ts
import notifications from "./components/notifications/convex.config.js";
app.use(notifications);
```

### Using NotificationsClient

```typescript
// convex/notifications.ts provides a typed wrapper
import { components } from "./_generated/api";
import { NotificationsClient } from "./notifications";

const notifications = new NotificationsClient(components.notifications);
```

### Common Operations

```typescript
// Create a Slack destination
const destId = await notifications.createDestination(ctx, {
  scopeId: workspaceId,
  name: "Production Alerts",
  type: "slack",
  config: {
    type: "slack",
    accessToken: "xoxb-...",
    channelId: "C0456",
    channelName: "#production-alerts",
  },
});

// Send a notification (from an action)
const results = await notifications.send(ctx, {
  items: [{
    destinationId: destId,
    type: "slack",
    text: "Run failed",
    topicId: "run_123", // enables Slack threading
  }],
});

// Test a destination before saving
const test = await notifications.testDestination(ctx, {
  type: "slack",
  config: { type: "slack", accessToken: "...", channelId: "..." },
});
```

## Tables

### destinations
Stores registered notification targets with type-specific config.
- Indexes: `by_scopeId`, `by_scopeId_type`
- Config is a discriminated union on `config.type` (slack | webhook | s3)

### logs
Records every delivery attempt with status, receipt, error, and retry tracking.
- Indexes: `by_destinationId`, `by_scopeId`, `by_scopeId_status`, `by_status`, `by_createdAt`, `by_topicId`

### topicAnchors
Tracks topic state per (destination, topic) pair for Slack threading and webhook/S3 correlation.
- Indexes: `by_destination_topic`, `by_scopeId`, `by_createdAt`

## Public API

| Function | Type | Module | Description |
|----------|------|--------|-------------|
| `create` | mutation | destinations | Create a new destination |
| `update` | mutation | destinations | Update name, config, or enabled status |
| `remove` | mutation | destinations | Delete destination + topic anchors (logs preserved) |
| `get` | query | destinations | Get single destination by ID |
| `list` | query | destinations | List destinations by scopeId, optional type filter |
| `send` | action | send | Send notifications to one or more destinations |
| `testDestination` | action | test | Test connectivity (by ID or by config) |
| `listLogs` | query | logs | List logs with filters (scopeId, destinationId, topicId, status) |
| `getLog` | query | logs | Get single log by ID |

## Topic-Based Threading

Pass a consistent `topicId` to group related messages:

```typescript
// First message creates a new Slack message
await notifications.send(ctx, { items: [{
  destinationId, type: "slack", text: "Run started", topicId: "run_123",
}]});

// Subsequent messages auto-thread under the first
await notifications.send(ctx, { items: [{
  destinationId, type: "slack", text: "Step 1 done", topicId: "run_123",
}]});
```

For webhooks: `X-Notification-Topic-Id`, `X-Notification-Topic-Sequence`, `X-Notification-Topic-Is-First` headers.
For S3: `x-amz-meta-notification-topic-*` object metadata.

## Destination Config Requirements

| Type | Required Fields | Optional Fields |
|------|----------------|-----------------|
| slack | `accessToken`, `channelId` | `channelName`, `teamName`, `teamId` |
| webhook | `url` | `method` (POST/PUT), `headers` |
| s3 | `bucket`, `region`, `accessKeyId`, `secretAccessKey` | `prefix`, `endpoint` |

## Retry Behavior

- Max 3 attempts (1 initial + 2 retries)
- Backoff: attempt 1 → immediate, attempt 2 → 5s, attempt 3 → 30s
- HTTP timeout: 10s (Slack, Webhook), 30s (S3)
- Config is re-read from DB before each retry (picks up fixes between retries)
- Disabled destinations during retry → log marked "failed"

## Key Constraints

- Component is sandboxed — cannot access host tables or `process.env`
- All IDs are strings at the component boundary
- Credentials (Slack tokens, S3 keys) are stored in destination config
- The host is responsible for Slack OAuth flow — component just stores the resulting bot token
- `_generated/` is auto-generated by `convex dev`
