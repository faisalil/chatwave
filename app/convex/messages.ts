import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import {
  assertSingleWorkspaceMembership,
  requireWorkspaceForUser,
} from "./workspaces";

async function getAuthorForMessage(ctx: QueryCtx, authorId: Id<"users">) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", authorId))
    .first();

  const user = await ctx.db.get(authorId);
  const avatarUrl = profile?.avatarId ? await ctx.storage.getUrl(profile.avatarId) : null;

  return {
    name: profile?.name || user?.name || user?.email || "Unknown",
    avatarUrl,
  };
}

export const list = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const membership = await assertSingleWorkspaceMembership(ctx, userId);
    if (!membership) {
      return [];
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      return [];
    }

    if (channel.workspaceId !== membership.workspaceId) {
      throw new Error("Not authorized to access this channel");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("asc")
      .collect();

    return await Promise.all(
      messages
        .filter((message) => message.workspaceId === membership.workspaceId)
        .map(async (message) => ({
          ...message,
          author: await getAuthorForMessage(ctx, message.authorId),
        })),
    );
  },
});

export const send = mutation({
  args: {
    channelId: v.id("channels"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const membership = await requireWorkspaceForUser(ctx, userId);
    const content = args.content.trim();
    if (!content) {
      throw new Error("Message cannot be empty");
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }

    if (channel.workspaceId !== membership.workspaceId) {
      throw new Error("Not authorized to send messages to this channel");
    }

    return await ctx.db.insert("messages", {
      workspaceId: membership.workspaceId,
      channelId: args.channelId,
      authorId: userId,
      content,
    });
  },
});

export const search = query({
  args: {
    query: v.string(),
    channelId: v.optional(v.id("channels")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const membership = await assertSingleWorkspaceMembership(ctx, userId);
    if (!membership) {
      return [];
    }

    const searchText = args.query.trim();
    if (!searchText) {
      return [];
    }

    if (args.channelId) {
      const channel = await ctx.db.get(args.channelId);
      if (!channel) {
        return [];
      }
      if (channel.workspaceId !== membership.workspaceId) {
        throw new Error("Not authorized to search this channel");
      }
    }

    const messages = await ctx.db
      .query("messages")
      .withSearchIndex("search_content", (q) => {
        let search = q.search("content", searchText).eq(
          "workspaceId",
          membership.workspaceId,
        );

        if (args.channelId) {
          search = search.eq("channelId", args.channelId);
        }

        return search;
      })
      .take(50);

    return await Promise.all(
      messages.map(async (message) => {
        const author = await getAuthorForMessage(ctx, message.authorId);
        const channel = await ctx.db.get(message.channelId);

        return {
          ...message,
          author,
          channelName: channel?.name || "Unknown Channel",
        };
      }),
    );
  },
});
