# Convex Function Creator

Build Convex queries, mutations, and actions with proper validation, authentication, and patterns.

## Function Types

| Type | Purpose | Can Read DB | Can Write DB | Can Call External APIs |
|------|---------|-------------|--------------|----------------------|
| `query` | Read data | Yes | No | No |
| `mutation` | Write data | Yes | Yes | No |
| `action` | Side effects | Via `ctx.runQuery` | Via `ctx.runMutation` | Yes |
| `internalQuery` | Backend-only read | Yes | No | No |
| `internalMutation` | Backend-only write | Yes | Yes | No |
| `internalAction` | Backend-only side effects | Via `ctx.runQuery` | Via `ctx.runMutation` | Yes |

## Query Template

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const listTasks = query({
  args: {
    status: v.optional(v.string()),
  },
  returns: v.array(v.object({
    _id: v.id("tasks"),
    title: v.string(),
    completed: v.boolean(),
  })),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new Error("User not found");

    let tasks = ctx.db
      .query("tasks")
      .withIndex("by_user", q => q.eq("userId", user._id));

    return await tasks.collect();
  },
});
```

## Mutation Template

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const updateTask = mutation({
  args: {
    taskId: v.id("tasks"),
    text: v.optional(v.string()),
    completed: v.optional(v.boolean()),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    // 1. Authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // 2. Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new Error("User not found");

    // 3. Get resource
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    // 4. Authorization
    if (task.userId !== user._id) throw new Error("Unauthorized");

    // 5. Update
    const updates: Record<string, unknown> = {};
    if (args.text !== undefined) updates.text = args.text;
    if (args.completed !== undefined) updates.completed = args.completed;

    await ctx.db.patch(args.taskId, updates);
    return args.taskId;
  },
});
```

## Action Template (with "use node")

Actions that need Node.js APIs MUST be in a separate file with `"use node"` at the top. This file can ONLY contain actions, never queries or mutations.

```typescript
// convex/taskActions.ts
"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

export const sendTaskReminder = action({
  args: { taskId: v.id("tasks") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    // 1. Auth
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // 2. Get data via query (actions can't read DB directly)
    const task = await ctx.runQuery(api.tasks.getTask, { taskId: args.taskId });
    if (!task) throw new Error("Task not found");

    // 3. Call external service
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: identity.email,
        from: "noreply@example.com",
        subject: "Task Reminder",
        text: `Don't forget: ${task.text}`,
      }),
    });

    if (!response.ok) throw new Error("Failed to send email");

    // 4. Update via mutation (actions can't write DB directly)
    await ctx.runMutation(internal.tasks.markReminderSent, { taskId: args.taskId });

    return true;
  },
});
```

## Internal Functions

For backend-only functions (called by scheduler, crons, other functions):

```typescript
import { internalMutation } from "./_generated/server";

export const processExpiredTasks = internalMutation({
  args: {},
  handler: async (ctx) => {
    // No auth needed — only callable from backend
    const now = Date.now();
    const expired = await ctx.db
      .query("tasks")
      .withIndex("by_status", q => q.eq("status", "active"))
      .collect();

    for (const task of expired.filter(t => t.dueDate && t.dueDate < now)) {
      await ctx.db.patch(task._id, { status: "expired" });
    }
  },
});
```

## Scheduling Functions

Always schedule `internal` functions, never `api` functions:

```typescript
import { internal } from "./_generated/api";

// In a mutation or action:
await ctx.scheduler.runAfter(0, internal.tasks.processExpiredTasks, {});
await ctx.scheduler.runAt(timestamp, internal.emails.sendReminder, { userId });
```

## Cron Jobs

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("cleanup", { hours: 1 }, internal.tasks.cleanup, {});
crons.cron("daily-report", "0 9 * * *", internal.reports.generate, {});

export default crons;
```

## HTTP Endpoints

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/api/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    await ctx.runMutation(internal.webhooks.process, { payload: body });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
```

## File Organization

```
convex/
├── _generated/        # Auto-generated (never edit)
├── lib/
│   └── auth.ts        # getCurrentUser helper
├── schema.ts          # Database schema
├── tasks.ts           # queries + mutations (NO "use node")
├── tasksActions.ts    # actions with "use node"
├── users.ts           # user queries + mutations
├── http.ts            # HTTP endpoints
└── crons.ts           # Scheduled jobs
```

## Checklist

- [ ] `args` defined with validators
- [ ] `returns` defined with validator
- [ ] Authentication check (`ctx.auth.getUserIdentity()`)
- [ ] Authorization check (ownership/permissions)
- [ ] All promises awaited
- [ ] Indexed queries (`.withIndex()` not `.filter()`)
- [ ] Error handling with descriptive messages
- [ ] Scheduled functions use `internal.*` not `api.*`
- [ ] If using Node.js APIs: `"use node"` at top of file
- [ ] If file has `"use node"`: Only actions (no queries/mutations)
- [ ] Actions in separate file from queries/mutations
