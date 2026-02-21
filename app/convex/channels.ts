import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertSingleWorkspaceMembership,
  requireWorkspaceForUser,
} from "./workspaces";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const membership = await assertSingleWorkspaceMembership(ctx, userId);
    if (!membership) {
      return [];
    }

    return await ctx.db
      .query("channels")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", membership.workspaceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const name = args.name.trim();
    if (!name) {
      throw new Error("Channel name is required");
    }

    const membership = await requireWorkspaceForUser(ctx, userId);

    const existing = await ctx.db
      .query("channels")
      .withIndex("by_workspace_and_name", (q) =>
        q.eq("workspaceId", membership.workspaceId).eq("name", name),
      )
      .first();

    if (existing) {
      throw new Error("Channel already exists");
    }

    return await ctx.db.insert("channels", {
      workspaceId: membership.workspaceId,
      name,
      createdBy: userId,
    });
  },
});

export const get = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const membership = await assertSingleWorkspaceMembership(ctx, userId);
    if (!membership) {
      return null;
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      return null;
    }

    if (channel.workspaceId !== membership.workspaceId) {
      throw new Error("Not authorized to access this channel");
    }

    return channel;
  },
});
