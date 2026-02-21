# Convex File Storage

Handle file uploads, storage, and retrieval using Convex's built-in file storage system with proper authentication and security.

## Overview

Convex provides built-in file storage with automatic CDN distribution. Files are immutable once stored and can be accessed via HTTPS URLs.

## File Upload Flow

1. **Client requests upload URL** → calls mutation to generate upload URL
2. **Client uploads file** → POSTs file to upload URL
3. **Client saves metadata** → calls mutation with storage ID
4. **File is stored** → accessible via `ctx.storage.getUrl()`

## Generate Upload URL

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    // 1. Authentication required
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // 2. Generate upload URL (valid for 1 hour)
    return await ctx.storage.generateUploadUrl();
  },
});
```

## Save File Metadata

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const saveFile = mutation({
  args: {
    storageId: v.string(),
    name: v.string(),
    type: v.string(),
    size: v.number(),
  },
  returns: v.id("files"),
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

    // 3. Validate storage ID
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Invalid storage ID");

    // 4. Save metadata
    const fileId = await ctx.db.insert("files", {
      storageId: args.storageId,
      name: args.name,
      type: args.type,
      size: args.size,
      userId: user._id,
      createdAt: Date.now(),
    });

    return fileId;
  },
});
```

## Get File URL

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getFileUrl = query({
  args: {
    fileId: v.id("files"),
  },
  returns: v.union(v.string(), v.null()),
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

    // 3. Get file metadata
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found");

    // 4. Authorization check
    if (file.userId !== user._id) throw new Error("Unauthorized");

    // 5. Get download URL (valid for 1 hour)
    return await ctx.storage.getUrl(file.storageId);
  },
});
```

## List User Files

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const listFiles = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    _id: v.id("files"),
    name: v.string(),
    type: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })),
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

    // 3. Query files
    let filesQuery = ctx.db
      .query("files")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .order("desc");

    if (args.limit) {
      filesQuery = filesQuery.take(args.limit);
    }

    const files = await filesQuery.collect();

    // 4. Return metadata (don't include storageId for security)
    return files.map(f => ({
      _id: f._id,
      name: f.name,
      type: f.type,
      size: f.size,
      createdAt: f.createdAt,
    }));
  },
});
```

## Delete File

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const deleteFile = mutation({
  args: {
    fileId: v.id("files"),
  },
  returns: v.null(),
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

    // 3. Get file
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found");

    // 4. Authorization
    if (file.userId !== user._id) throw new Error("Unauthorized");

    // 5. Delete from storage
    await ctx.storage.delete(file.storageId);

    // 6. Delete metadata
    await ctx.db.delete(args.fileId);

    return null;
  },
});
```

## Schema Definition

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  files: defineTable({
    storageId: v.string(),      // Convex storage ID
    name: v.string(),            // Original filename
    type: v.string(),            // MIME type
    size: v.number(),            // Size in bytes
    userId: v.id("users"),       // Owner
    createdAt: v.number(),       // Unix timestamp
  })
    .index("by_user", ["userId"])
    .index("by_storageId", ["storageId"]),

  users: defineTable({
    // ... user fields
  }),
});
```

## Client-Side Upload (React)

```typescript
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

function FileUploader() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveFile = useMutation(api.files.saveFile);

  async function handleFileUpload(file: File) {
    // 1. Get upload URL
    const uploadUrl = await generateUploadUrl();

    // 2. Upload file to Convex storage
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!response.ok) throw new Error("Upload failed");

    // 3. Get storage ID from response
    const { storageId } = await response.json();

    // 4. Save metadata
    const fileId = await saveFile({
      storageId,
      name: file.name,
      type: file.type,
      size: file.size,
    });

    return fileId;
  }

  return (
    <input
      type="file"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleFileUpload(file);
      }}
    />
  );
}
```

## Client-Side Upload (CLI with ConvexHttpClient)

```typescript
import { ConvexHttpClient } from "convex/browser";
import { api } from "@qamate/backend/convex/_generated/api";
import * as fs from "fs";

const client = new ConvexHttpClient(process.env.CONVEX_URL!);
client.setAuth(jwt);

async function uploadFile(filePath: string) {
  // 1. Read file
  const buffer = fs.readFileSync(filePath);
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);

  // 2. Get upload URL
  const uploadUrl = await client.mutation(api.files.generateUploadUrl, {});

  // 3. Upload file
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: buffer,
  });

  if (!response.ok) throw new Error("Upload failed");

  // 4. Get storage ID
  const { storageId } = await response.json();

  // 5. Save metadata
  const fileId = await client.mutation(api.files.saveFile, {
    storageId,
    name: fileName,
    type: "application/octet-stream",
    size: stats.size,
  });

  return fileId;
}
```

## Security Considerations

### ✅ Always Implement

- **Authentication checks** on all file operations
- **Authorization checks** to verify file ownership
- **File size limits** (Convex max: 1 GB per file)
- **Content type validation** to prevent malicious uploads
- **Rate limiting** on upload URL generation

### ❌ Never Do

- Expose storage IDs directly to clients (use file IDs instead)
- Skip authentication on `generateUploadUrl`
- Allow unlimited file uploads per user
- Store sensitive data without encryption
- Share upload URLs publicly

## File Size Validation

```typescript
export const saveFile = mutation({
  args: {
    storageId: v.string(),
    name: v.string(),
    type: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Enforce size limits (e.g., 10 MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (args.size > MAX_FILE_SIZE) {
      throw new Error("File too large (max 10 MB)");
    }

    // Validate content type
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
    if (!ALLOWED_TYPES.includes(args.type)) {
      throw new Error("Invalid file type");
    }

    // Continue with save...
  },
});
```

## Rate Limiting Upload URLs

```typescript
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Check recent uploads (last hour)
    const user = await getCurrentUser(ctx);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const recentUploads = await ctx.db
      .query("files")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .filter(q => q.gt(q.field("createdAt"), oneHourAgo))
      .collect();

    if (recentUploads.length >= 10) {
      throw new Error("Upload limit reached (10 per hour)");
    }

    return await ctx.storage.generateUploadUrl();
  },
});
```

## Temporary Upload URLs (Actions)

For generating temporary signed URLs with custom expiration:

```typescript
"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const getSignedDownloadUrl = action({
  args: {
    fileId: v.id("files"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Get file via query
    const file = await ctx.runQuery(internal.files.getFileInternal, {
      fileId: args.fileId,
    });

    if (!file) throw new Error("File not found");

    // Generate URL with storage API
    const url = await ctx.storage.getUrl(file.storageId);
    if (!url) throw new Error("Failed to generate URL");

    return url;
  },
});
```

## Image Optimization (Future)

For image uploads, consider using Convex's image transformation (when available):

```typescript
// Get optimized image URL
const url = await ctx.storage.getUrl(file.storageId, {
  width: 800,
  quality: 80,
  format: "webp",
});
```

## Checklist

- [ ] Authentication on all file operations
- [ ] Authorization checks for file ownership
- [ ] File size validation (enforced limit)
- [ ] Content type validation (allowlist)
- [ ] Rate limiting on upload URL generation
- [ ] Schema with proper indexes (`by_user`, `by_storageId`)
- [ ] Storage IDs never exposed to clients directly
- [ ] Error handling for storage operations
- [ ] Cleanup on deletion (both metadata and storage)
- [ ] Upload URL expiration handled client-side
