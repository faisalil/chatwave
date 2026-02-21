# Convex Authentication & Authorization Patterns

Set up authentication, user management, and access control in Convex.

## Architecture

1. **Client Authentication**: Provider (WorkOS, Auth0, `@convex-dev/auth`, custom JWT)
2. **Backend Identity**: Map auth provider identity to your `users` table via `tokenIdentifier`

## Schema Setup

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(), // Unique per auth provider
    name: v.string(),
    email: v.string(),
    pictureUrl: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),
});
```

## Core Helper: getCurrentUser

```typescript
// convex/lib/auth.ts
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new Error("User not found");

  return user;
}

export async function getCurrentUserOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin") throw new Error("Admin access required");
  return user;
}
```

## User Upsert on First Sign-In

```typescript
// convex/users.ts
export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, { updatedAt: Date.now() });
      return existingUser._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? "Anonymous",
      email: identity.email ?? "",
      pictureUrl: identity.pictureUrl,
      role: "user",
      createdAt: Date.now(),
    });
  },
});
```

## Custom Functions for Data Protection (Convex's RLS Alternative)

Use `convex-helpers` custom functions instead of repeating auth in every function:

```typescript
// convex/lib/customFunctions.ts
import { customQuery, customMutation } from "convex-helpers/server/customFunctions";
import { query, mutation } from "../_generated/server";
import { getCurrentUser } from "./auth";

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

// Usage — ctx.user is automatically available and typed!
export const getMyTasks = authedQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", q => q.eq("userId", ctx.user._id))
      .collect();
  },
});
```

### Role-Based Access Control (RBAC)

```typescript
export const adminQuery = customQuery(query, {
  args: {},
  input: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user.role !== "admin") throw new Error("Admin access required");
    return { ctx: { ...ctx, user }, args };
  },
});

export const getAllUsers = adminQuery({
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});
```

### Multi-Tenant Access Control

```typescript
export const orgQuery = customQuery(query, {
  args: { orgId: v.id("organizations") },
  input: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", q =>
        q.eq("orgId", args.orgId).eq("userId", user._id)
      )
      .unique();
    if (!membership) throw new Error("Not a member of this organization");
    return { ctx: { ...ctx, user, orgId: args.orgId, role: membership.role }, args };
  },
});
```

## Resource Ownership Pattern

```typescript
export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (task.userId !== user._id) throw new Error("You can only delete your own tasks");

    await ctx.db.delete(args.taskId);
  },
});
```

## Team-Based Access

```typescript
async function requireTeamAccess(
  ctx: MutationCtx,
  teamId: Id<"teams">
): Promise<{ user: Doc<"users">, membership: Doc<"teamMembers"> }> {
  const user = await getCurrentUser(ctx);
  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_and_user", q =>
      q.eq("teamId", teamId).eq("userId", user._id)
    )
    .unique();
  if (!membership) throw new Error("You don't have access to this team");
  return { user, membership };
}
```

## Public vs Private vs Hybrid Queries

```typescript
// Public — no auth
export const listPublicPosts = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_published", q => q.eq("published", true))
      .collect();
  },
});

// Private — requires auth
export const getMyPosts = authedQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_user", q => q.eq("userId", ctx.user._id))
      .collect();
  },
});

// Hybrid — optional auth
export const getPosts = query({
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (user) {
      return await ctx.db.query("posts")
        .withIndex("by_user", q => q.eq("userId", user._id)).collect();
    }
    return await ctx.db.query("posts")
      .withIndex("by_published", q => q.eq("published", true)).collect();
  },
});
```

## File Organization

```
convex/
├── lib/
│   ├── auth.ts              # getCurrentUser, requireAdmin
│   └── customFunctions.ts   # authedQuery, authedMutation, adminQuery, orgQuery
├── users.ts                 # storeUser, public user functions
├── tasks.ts                 # Use authedQuery/authedMutation
├── admin.ts                 # Use adminQuery/adminMutation
└── organizations.ts         # Use orgQuery/orgMutation
```

## Checklist

- [ ] Users table with `tokenIdentifier` index
- [ ] `getCurrentUser` helper in `convex/lib/auth.ts`
- [ ] `storeUser` mutation for first sign-in upsert
- [ ] Custom function wrappers (`authedQuery`, `authedMutation`)
- [ ] Authentication check in all protected functions
- [ ] Authorization check for resource access (ownership, role, team)
- [ ] Clear error messages ("Not authenticated", "Unauthorized", "Admin access required")
