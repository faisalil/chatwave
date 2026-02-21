# Convex Best Practices & Rules

Comprehensive rules for writing correct, performant, and secure Convex backend code.

## Async Handling

Always await ALL promises in Convex functions. Not awaiting `ctx.db.patch`, `ctx.db.insert`, `ctx.scheduler.runAfter`, etc. causes silent failures.

```typescript
// BAD - missing await
ctx.db.patch(args.userId, { name: args.name });

// GOOD
await ctx.db.patch(args.userId, { name: args.name });
```

Enable the `no-floating-promises` ESLint rule.

## Argument & Return Validation

All public `query`, `mutation`, and `action` functions MUST define `args` and `returns` validators:

```typescript
export const createTask = mutation({
  args: {
    text: v.string(),
    userId: v.id("users"),
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    )),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      text: args.text,
      userId: args.userId,
      priority: args.priority ?? "medium",
      completed: false,
    });
  },
});
```

Internal functions (`internalQuery`, `internalMutation`, `internalAction`) can skip validators but it's recommended to include them.

## Query Optimization

**Never use `.filter()` on database queries** — it does a full table scan. Use `.withIndex()` instead:

```typescript
// BAD - full table scan
const user = await ctx.db
  .query("users")
  .filter(q => q.eq(q.field("email"), email))
  .first();

// GOOD - indexed lookup
const user = await ctx.db
  .query("users")
  .withIndex("by_email", q => q.eq("email", email))
  .first();
```

For small result sets where an index isn't warranted, collect then filter in TypeScript:
```typescript
const allUsers = await ctx.db.query("users").collect();
const filtered = allUsers.filter(user => user.age > 18);
```

## No Date.now() in Queries

Never use `Date.now()` or `new Date()` inside query functions — it breaks caching and reactivity. Queries must be deterministic.

**Solutions:**
1. Pass time as an argument from the client
2. Use status fields updated by scheduled functions (cron jobs)
3. Use coarser time granularity (day-level strings)

```typescript
// BAD
export const getActive = query({
  handler: async (ctx) => {
    const now = Date.now(); // Breaks reactivity!
    return await ctx.db.query("tasks").filter(q => q.lt(q.field("dueDate"), now)).collect();
  },
});

// GOOD - pass time as argument
export const getActive = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.query("tasks")
      .withIndex("by_due_date", q => q.lt("dueDate", args.now))
      .collect();
  },
});
```

## Authentication Checks

Every public function accessing user data MUST verify authentication:

```typescript
export const getMyTasks = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await getUserByIdentity(ctx, identity);
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .collect();
  },
});
```

**Access control best practices:**
1. Use unguessable IDs (Convex IDs or UUIDs), never spoofable data like emails
2. Always verify ownership server-side
3. Never trust client-sent IDs without checking permissions

## Schema Design

Design **document-relational** schemas: flat documents with ID relationships, not deep nesting.

```typescript
// BAD - deeply nested
users: defineTable({
  posts: v.array(v.object({
    comments: v.array(v.object({ text: v.string() })),
  })),
})

// GOOD - relational
users: defineTable({ name: v.string() }),
posts: defineTable({
  userId: v.id("users"),
  title: v.string(),
}).index("by_user", ["userId"]),
comments: defineTable({
  postId: v.id("posts"),
  text: v.string(),
}).index("by_post", ["postId"]),
```

**Key principles:**
- Arrays are capped at 8,192 items — only use for small, bounded collections (roles, tags)
- Always index foreign keys from the start
- Use compound indexes for common query patterns: `.index("by_user_and_status", ["userId", "status"])`

## Function Organization

Keep `query`/`mutation`/`action` wrappers thin. Put logic in plain TypeScript helper functions:

```typescript
// convex/lib/auth.ts
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

// convex/posts.ts
export const createPost = mutation({
  args: { title: v.string(), content: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    return await ctx.db.insert("posts", {
      userId: user._id,
      title: args.title,
      content: args.content,
      createdAt: Date.now(),
    });
  },
});
```

## Scheduler Safety

Always schedule `internal` functions, never `api` functions. Scheduled functions bypass client-side auth and validation.

```typescript
import { internal } from "./_generated/api";

// GOOD
await ctx.scheduler.runAfter(0, internal.users.chargeUserInternal, { userId, amount });

// BAD - don't schedule api functions
await ctx.scheduler.runAfter(0, api.users.chargeUser, { userId, amount });
```

## "use node" Directive

Files with `"use node"` can ONLY contain `action` and `internalAction` — NEVER `query` or `mutation`. Separate them into different files:

```
convex/
├── tasks.ts           # queries + mutations (NO "use node")
└── tasksActions.ts    # actions with "use node"
```

Use `"use node"` when you need: external API calls, Node.js crypto, third-party SDKs (Stripe, SendGrid, OpenAI).

Actions interact with the database via `ctx.runQuery()` and `ctx.runMutation()`.

## Error Handling

- **Throw errors** for exceptional cases (auth failure, missing resource, unauthorized)
- **Return null** for expected absences (item might not exist)
- Use specific, actionable error messages
- Don't expose internal details to clients

```typescript
// Throw for exceptional cases
if (!identity) throw new Error("Not authenticated");
if (!task) throw new Error("Task not found");
if (task.userId !== user._id) throw new Error("Unauthorized");

// Return null for expected cases
export const getTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.taskId); // Returns null if not found
  },
});
```

## TypeScript Strict Mode

- Enable `strict: true` in tsconfig.json
- Never use `any` — use proper validators and generated types
- Use `Doc<"tableName">` and `Id<"tableName">` from `_generated/dataModel`
- Define `returns` validators on all public functions
- If type is truly unknown, use `unknown` (not `any`) and narrow with type guards

## Pagination

Never use `.collect()` on unbounded queries. Use `.paginate()` for lists that could grow:

```typescript
import { paginationOptsValidator } from "convex/server";

export const listTasks = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_created")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
```

Client-side: use `usePaginatedQuery` with `initialNumItems: 20` (range 10-50).

## Development Workflow

- **Always use `npx convex dev`** during development (watches files, auto-reloads)
- **Only use `npx convex deploy`** for production deployments
- Never edit `convex/_generated/` files — they're auto-generated
- Enable ESLint with `@convex-dev/require-argument-validators` rule
