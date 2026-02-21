# Convex Schema Builder

Design and generate Convex database schemas with proper validation, indexes, and relationships.

## When to Use

- Creating a new `convex/schema.ts` file
- Adding tables to existing schema
- Designing data model relationships
- Adding or optimizing indexes
- Converting nested data to relational structure

## Schema Template

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tableName: defineTable({
    // Required fields
    field: v.string(),

    // Optional fields
    optional: v.optional(v.number()),

    // Relations (use IDs)
    userId: v.id("users"),

    // Enums with union + literal
    status: v.union(
      v.literal("active"),
      v.literal("pending"),
      v.literal("archived")
    ),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_created", ["createdAt"]),
});
```

## Validator Reference

```typescript
// Primitives
v.string()
v.number()
v.boolean()
v.null()
v.int64()          // 64-bit integer
v.bytes()          // binary data
v.id("tableName")  // typed document ID

// Optional
v.optional(v.string())

// Union types (enums)
v.union(v.literal("a"), v.literal("b"), v.literal("c"))

// Objects
v.object({
  key: v.string(),
  nested: v.number(),
})

// Arrays
v.array(v.string())

// Records (arbitrary keys)
v.record(v.string(), v.boolean())

// Any (avoid if possible)
v.any()
```

## Relationship Patterns

### One-to-Many

```typescript
export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }).index("by_email", ["email"]),

  posts: defineTable({
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),
  }).index("by_user", ["userId"]),
});
```

### Many-to-Many (Junction Table)

```typescript
export default defineSchema({
  users: defineTable({ name: v.string() }),
  projects: defineTable({ name: v.string() }),

  projectMembers: defineTable({
    userId: v.id("users"),
    projectId: v.id("projects"),
    role: v.union(v.literal("owner"), v.literal("member")),
  })
    .index("by_user", ["userId"])
    .index("by_project", ["projectId"])
    .index("by_project_and_user", ["projectId", "userId"]),
});
```

### Hierarchical Data (Self-Referencing)

```typescript
export default defineSchema({
  comments: defineTable({
    postId: v.id("posts"),
    parentId: v.optional(v.id("comments")), // null for top-level
    userId: v.id("users"),
    text: v.string(),
  })
    .index("by_post", ["postId"])
    .index("by_parent", ["parentId"]),
});
```

### Small Bounded Arrays (OK to Use)

```typescript
users: defineTable({
  name: v.string(),
  roles: v.array(v.union(
    v.literal("admin"),
    v.literal("editor"),
    v.literal("viewer")
  )),
  tags: v.array(v.string()), // max ~10 tags
}),
```

Arrays are capped at 8,192 items. Only use for naturally bounded collections.

## Index Strategy

1. **Single-field indexes** — for simple lookups:
   - `by_user: ["userId"]`
   - `by_email: ["email"]`

2. **Compound indexes** — for filtered queries:
   - `by_user_and_status: ["userId", "status"]`
   - `by_team_and_created: ["teamId", "createdAt"]`

3. **Compound indexes subsume single-field**: `by_a_and_b: ["a", "b"]` covers queries on just `"a"`, so you don't also need `by_a: ["a"]`.

4. **Index fields used in `.withIndex()` queries** — every field you use in `q.eq()` must be part of the index, in order.

## Converting Nested to Relational

**Before (nested — avoid):**
```typescript
users: defineTable({
  posts: v.array(v.object({
    title: v.string(),
    comments: v.array(v.object({ text: v.string() })),
  })),
})
```

**After (relational — preferred):**
```typescript
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

## Search Indexes

For full-text search:
```typescript
posts: defineTable({
  title: v.string(),
  body: v.string(),
})
  .searchIndex("search_title", { searchField: "title" })
  .searchIndex("search_body", {
    searchField: "body",
    filterFields: ["userId"],
  }),
```

## Vector Indexes

For AI/embedding search:
```typescript
documents: defineTable({
  text: v.string(),
  embedding: v.array(v.float64()),
})
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["userId"],
  }),
```

## Checklist

- [ ] All foreign keys have indexes
- [ ] Common query patterns have compound indexes
- [ ] Arrays are small and bounded (or converted to relations)
- [ ] All fields have proper validators (no `v.any()`)
- [ ] Enums use `v.union(v.literal(...))` pattern
- [ ] Timestamps use `v.number()` (milliseconds since epoch)
- [ ] Table names are lowercase plural (e.g., `tasks`, `users`)
- [ ] Field names are camelCase (e.g., `createdAt`, `userId`)
