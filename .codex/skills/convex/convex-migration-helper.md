# Convex Migration Helper

Safely migrate Convex schemas and data when making breaking changes.

## Migration Principles

1. **No automatic migrations** — Convex doesn't auto-migrate data
2. **Additive changes are safe** — Adding optional fields or new tables needs no migration
3. **Breaking changes need code** — Required fields, type changes need migration functions
4. **Zero-downtime** — Write migrations to keep the app running during migration

## Safe Changes (No Migration Needed)

### Adding Optional Field
```typescript
// Before
users: defineTable({ name: v.string() })

// After — safe! New field is optional
users: defineTable({
  name: v.string(),
  bio: v.optional(v.string()),
})
```

### Adding New Table
```typescript
// Safe — completely new tables
posts: defineTable({
  userId: v.id("users"),
  title: v.string(),
}).index("by_user", ["userId"])
```

### Adding Index
```typescript
// Safe — add indexes at any time
users: defineTable({
  name: v.string(),
  email: v.string(),
}).index("by_email", ["email"]) // New index
```

## Breaking Changes (Migration Required)

### Adding Required Field

**Steps:**
1. Add as optional first
2. Write migration to backfill
3. Run migration
4. Make field required

```typescript
// Step 1: Add as optional
users: defineTable({
  name: v.string(),
  email: v.optional(v.string()), // Start optional
})

// Step 2: Migration function
export const backfillEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      if (!user.email) {
        await ctx.db.patch(user._id, {
          email: `user-${user._id}@example.com`,
        });
      }
    }
  },
});

// Step 3: Run migration
// npx convex run migrations:backfillEmails

// Step 4: Make required (after all data migrated)
users: defineTable({
  name: v.string(),
  email: v.string(), // Now required
})
```

### Renaming Field

```typescript
// Step 1: Add new field (optional)
users: defineTable({
  name: v.string(),
  displayName: v.optional(v.string()),
})

// Step 2: Copy data
export const renameField = internalMutation({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      await ctx.db.patch(user._id, { displayName: user.name });
    }
  },
});

// Step 3: Update all code to use new field name
// Step 4: Remove old field from schema
users: defineTable({ displayName: v.string() })
```

### Changing Field Type (e.g., array to relational)

```typescript
// Step 1: Create new structure (additive)
tags: defineTable({ name: v.string() }).index("by_name", ["name"]),
postTags: defineTable({
  postId: v.id("posts"),
  tagId: v.id("tags"),
}).index("by_post", ["postId"]).index("by_tag", ["tagId"]),

// Keep old field as optional during migration
posts: defineTable({
  title: v.string(),
  tags: v.optional(v.array(v.string())), // Keep temporarily
})

// Step 2: Write migration
export const migrateTags = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const posts = await ctx.db.query("posts")
      .filter(q => q.neq(q.field("tags"), undefined))
      .take(batchSize);

    for (const post of posts) {
      if (!post.tags || post.tags.length === 0) {
        await ctx.db.patch(post._id, { tags: undefined });
        continue;
      }
      for (const tagName of post.tags) {
        let tag = await ctx.db.query("tags")
          .withIndex("by_name", q => q.eq("name", tagName)).unique();
        if (!tag) {
          const tagId = await ctx.db.insert("tags", { name: tagName });
          tag = { _id: tagId, name: tagName };
        }
        await ctx.db.insert("postTags", { postId: post._id, tagId: tag._id });
      }
      await ctx.db.patch(post._id, { tags: undefined });
    }
    return { migrated: posts.length };
  },
});

// Step 3: Run in batches until all migrated
// Step 4: Remove old field from schema
```

## Migration Patterns

### Batch Processing (for large tables)

```typescript
export const migrateBatch = internalMutation({
  args: { batchSize: v.number() },
  handler: async (ctx, args) => {
    const items = await ctx.db.query("largeTable").take(args.batchSize);
    for (const item of items) {
      await ctx.db.patch(item._id, { /* migration logic */ });
    }
    return { processed: items.length, hasMore: items.length === args.batchSize };
  },
});
```

### Scheduled Migration (cron)

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("migrate-batch", { minutes: 5 }, internal.migrations.migrateBatch, { batchSize: 100 });
export default crons;
```

### Dual-Write Pattern (zero-downtime)

During transition, write to both old and new structure:

```typescript
export const createPost = mutation({
  args: { title: v.string(), tags: v.array(v.string()) },
  handler: async (ctx, args) => {
    const postId = await ctx.db.insert("posts", {
      title: args.title,
      tags: args.tags, // Old field — keep writing during migration
    });

    // ALSO write to new structure
    for (const tagName of args.tags) {
      let tag = await ctx.db.query("tags")
        .withIndex("by_name", q => q.eq("name", tagName)).unique();
      if (!tag) {
        const tagId = await ctx.db.insert("tags", { name: tagName });
        tag = { _id: tagId };
      }
      await ctx.db.insert("postTags", { postId, tagId: tag._id });
    }
    return postId;
  },
});
// After migration complete, remove old writes
```

### Verify Migration

```typescript
export const verifyMigration = query({
  args: {},
  handler: async (ctx) => {
    const total = (await ctx.db.query("users").collect()).length;
    const migrated = (await ctx.db.query("users")
      .filter(q => q.neq(q.field("newField"), undefined))
      .collect()
    ).length;
    return {
      total,
      migrated,
      remaining: total - migrated,
      percentComplete: total > 0 ? (migrated / total) * 100 : 100,
    };
  },
});
```

## Checklist

- [ ] Identify breaking change
- [ ] Add new structure as optional/additive
- [ ] Write migration function (internal mutation)
- [ ] Test migration on sample data
- [ ] Run migration in batches if large dataset
- [ ] Verify migration completed (all records updated)
- [ ] Update application code to use new structure
- [ ] Deploy new code
- [ ] Remove old fields from schema
- [ ] Clean up migration code

## Common Pitfalls

1. **Don't make field required immediately** — always add as optional first
2. **Don't migrate in a single transaction** — batch large migrations
3. **Don't forget to update queries** — update all code using old field
4. **Don't delete old field too soon** — wait until all data migrated
5. **Test thoroughly** — verify migration on dev environment first
