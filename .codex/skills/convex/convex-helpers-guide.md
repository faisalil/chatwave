# Convex Helpers Guide

Use `convex-helpers` for pre-built patterns: relationships, custom functions, filtering, sessions, migrations, and more.

## Installation

```bash
npm install convex-helpers
```

## Available Helpers

### 1. Relationship Helpers

Traverse relationships between tables in a type-safe way.

```typescript
import { getOneFrom, getManyFrom, getManyVia } from "convex-helpers/server/relationships";

export const getPostWithDetails = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;

    const author = await getOneFrom(ctx.db, "users", "by_id", post.authorId, "_id");
    const comments = await getManyFrom(ctx.db, "comments", "by_post", post._id, "postId");

    return { ...post, author, comments };
  },
});
```

Key functions:
- `getOneFrom` — single related document
- `getManyFrom` — multiple related documents
- `getManyVia` — many-to-many through junction table

### 2. Custom Functions (Data Protection / RLS Alternative)

**This is Convex's recommended approach to data protection** (instead of Row Level Security).

```typescript
import { customQuery, customMutation } from "convex-helpers/server/customFunctions";
import { query, mutation } from "../_generated/server";

// Authenticated query — user automatically in ctx
export const authedQuery = customQuery(query, {
  args: {},
  input: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    return { ctx: { ...ctx, user }, args };
  },
});

export const authedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    return { ctx: { ...ctx, user }, args };
  },
});

// Usage — ctx.user is typed and available
export const getMyTasks = authedQuery({
  handler: async (ctx) => {
    return await ctx.db.query("tasks")
      .withIndex("by_user", q => q.eq("userId", ctx.user._id))
      .collect();
  },
});
```

**Composable wrappers:**
```typescript
// Admin-only (layers on top of authedQuery)
export const adminQuery = customQuery(authedQuery, {
  args: {},
  input: async (ctx, args) => {
    if (ctx.user.role !== "admin") throw new Error("Admin access required");
    return { ctx, args };
  },
});

// Organization-scoped
export const orgQuery = customQuery(authedQuery, {
  args: { orgId: v.id("organizations") },
  input: async (ctx, args) => {
    const member = await ctx.db.query("members")
      .withIndex("by_org_and_user", q =>
        q.eq("orgId", args.orgId).eq("userId", ctx.user._id)
      ).unique();
    if (!member) throw new Error("Not a member");
    return { ctx: { ...ctx, orgId: args.orgId, role: member.role }, args };
  },
});
```

### 3. Filter Helper

Apply complex TypeScript filters to database queries (prefer indexes when possible):

```typescript
import { filter } from "convex-helpers/server/filter";

export const getActiveTasks = query({
  handler: async (ctx) => {
    return await filter(
      ctx.db.query("tasks"),
      (task) => !task.completed && task.priority === "high"
    ).collect();
  },
});
```

### 4. Sessions (Anonymous User Tracking)

Track users across requests without authentication:

```typescript
// Server
import { SessionIdArg } from "convex-helpers/server/sessions";

export const trackView = mutation({
  args: { ...SessionIdArg, pageUrl: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("pageViews", {
      sessionId: args.sessionId,
      pageUrl: args.pageUrl,
      timestamp: Date.now(),
    });
  },
});

// Client (React)
import { useSessionId } from "convex-helpers/react/sessions";

function MyComponent() {
  const sessionId = useSessionId();
  // Pass sessionId with all requests
}
```

### 5. Zod Validation

Use Zod schemas instead of Convex validators:

```typescript
import { zCustomQuery } from "convex-helpers/server/zod";
import { z } from "zod";

const argsSchema = z.object({
  email: z.string().email(),
  age: z.number().min(18).max(120),
});

export const createUser = zCustomQuery(query, {
  args: argsSchema,
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", args);
  },
});
```

### 6. Migrations

Run data migrations safely:

```typescript
import { makeMigration } from "convex-helpers/server/migrations";

export const addDefaultPriority = makeMigration({
  table: "tasks",
  migrateOne: async (ctx, doc) => {
    if (doc.priority === undefined) {
      await ctx.db.patch(doc._id, { priority: "medium" });
    }
  },
});
// Run: npx convex run migrations:addDefaultPriority
```

### 7. Triggers

Execute code automatically when data changes:

```typescript
import { Triggers } from "convex-helpers/server/triggers";

const triggers = new Triggers();
triggers.register("tasks", "insert", async (ctx, task) => {
  await ctx.db.insert("notifications", {
    userId: task.userId,
    type: "task_created",
    taskId: task._id,
  });
});
```

### 8. Async Map (Batch Operations)

```typescript
import { asyncMap } from "convex-helpers";

const results = await asyncMap(taskIds, async (taskId) => {
  const task = await ctx.db.get(taskId);
  if (task) {
    await ctx.db.patch(taskId, { status: "done" });
    return { success: true, taskId };
  }
  return { success: false, taskId };
});
```

## Quick Reference

| Need | Helper | Import |
|------|--------|--------|
| Load related data | `getOneFrom`, `getManyFrom` | `convex-helpers/server/relationships` |
| Auth in all functions | `customQuery`, `customMutation` | `convex-helpers/server/customFunctions` |
| Complex filters | `filter` | `convex-helpers/server/filter` |
| Anonymous users | `useSessionId`, `SessionIdArg` | `convex-helpers/react/sessions`, `convex-helpers/server/sessions` |
| Zod validation | `zCustomQuery` | `convex-helpers/server/zod` |
| Data migrations | `makeMigration` | `convex-helpers/server/migrations` |
| Triggers | `Triggers` | `convex-helpers/server/triggers` |
| Batch operations | `asyncMap` | `convex-helpers` |
| Pagination | `getPage` | `convex-helpers/server/pagination` |

## Resources

- GitHub: https://github.com/get-convex/convex-helpers
- npm: https://www.npmjs.com/package/convex-helpers
