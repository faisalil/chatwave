import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";

const workspaceRole = v.union(v.literal("owner"), v.literal("member"));

type WorkspaceCtx = QueryCtx | MutationCtx;

export async function getMembershipForUser(
  ctx: WorkspaceCtx,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

export async function assertSingleWorkspaceMembership(
  ctx: WorkspaceCtx,
  userId: Id<"users">,
  expectedWorkspaceId?: Id<"workspaces">,
) {
  const memberships = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  if (memberships.length === 0) {
    return null;
  }

  if (memberships.length > 1) {
    throw new Error("User belongs to multiple workspaces; expected exactly one workspace");
  }

  const membership = memberships[0];

  if (expectedWorkspaceId && membership.workspaceId !== expectedWorkspaceId) {
    throw new Error("User already belongs to a different workspace");
  }

  return membership;
}

export async function requireWorkspaceForUser(
  ctx: WorkspaceCtx,
  userId: Id<"users">,
) {
  const membership = await assertSingleWorkspaceMembership(ctx, userId);
  if (!membership) {
    throw new Error("No workspace membership found for user");
  }
  return membership;
}

export async function isMemberOfWorkspace(
  ctx: WorkspaceCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
) {
  const membership = await assertSingleWorkspaceMembership(ctx, userId);
  return membership?.workspaceId === workspaceId;
}

export const ensureForCurrentUser = mutation({
  args: {},
  returns: v.object({
    workspaceId: v.id("workspaces"),
    created: v.boolean(),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const existingMembership = await assertSingleWorkspaceMembership(ctx, userId);
    if (existingMembership) {
      return { workspaceId: existingMembership.workspaceId, created: false };
    }

    const user = await ctx.db.get(userId);
    const nameFromEmail = user?.email?.split("@")[0] ?? "My";
    const baseName = user?.name?.trim() || nameFromEmail;
    const workspaceId = await ctx.db.insert("workspaces", {
      name: `${baseName}'s Workspace`,
      createdBy: userId,
      createdAt: Date.now(),
    });

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
      joinedAt: Date.now(),
    });

    await ctx.db.insert("channels", {
      workspaceId,
      name: "general",
      createdBy: userId,
    });

    return { workspaceId, created: true };
  },
});

export const myWorkspace = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("workspaces"),
      name: v.string(),
      createdAt: v.number(),
      role: workspaceRole,
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const membership = await assertSingleWorkspaceMembership(ctx, userId);
    if (!membership) {
      return null;
    }

    const workspace = await ctx.db.get(membership.workspaceId);
    if (!workspace) {
      return null;
    }

    return {
      _id: workspace._id,
      name: workspace.name,
      createdAt: workspace.createdAt,
      role: membership.role,
    };
  },
});

export const createWorkspace = internalMutation({
  args: {
    name: v.string(),
    createdBy: v.id("users"),
  },
  returns: v.id("workspaces"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("Workspace name is required");
    }

    return await ctx.db.insert("workspaces", {
      name,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });
  },
});

export const addMember = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: workspaceRole,
  },
  returns: v.id("workspaceMembers"),
  handler: async (ctx, args) => {
    await assertSingleWorkspaceMembership(ctx, args.userId, args.workspaceId);

    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
      )
      .first();

    if (existing) {
      if (existing.role !== args.role) {
        await ctx.db.patch(existing._id, { role: args.role });
      }
      return existing._id;
    }

    return await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      role: args.role,
      joinedAt: Date.now(),
    });
  },
});
