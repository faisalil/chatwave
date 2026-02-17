import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("asc")
      .collect();

    // Get profiles for all message authors
    const messagesWithProfiles = await Promise.all(
      messages.map(async (message) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", message.authorId))
          .first();
        
        const user = await ctx.db.get(message.authorId);
        const avatarUrl = profile?.avatarId ? await ctx.storage.getUrl(profile.avatarId) : null;

        return {
          ...message,
          author: {
            name: profile?.name || user?.name || user?.email || "Unknown",
            avatarUrl,
          },
        };
      })
    );

    return messagesWithProfiles;
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

    if (!args.content.trim()) {
      throw new Error("Message cannot be empty");
    }

    return await ctx.db.insert("messages", {
      channelId: args.channelId,
      authorId: userId,
      content: args.content.trim(),
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

    if (!args.query.trim()) {
      return [];
    }

    const searchQuery = ctx.db
      .query("messages")
      .withSearchIndex("search_content", (q) => {
        let search = q.search("content", args.query);
        if (args.channelId) {
          search = search.eq("channelId", args.channelId);
        }
        return search;
      })
      .take(50);

    const messages = await searchQuery;

    // Get profiles and channel info for search results
    const messagesWithDetails = await Promise.all(
      messages.map(async (message) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", message.authorId))
          .first();
        
        const user = await ctx.db.get(message.authorId);
        const channel = await ctx.db.get(message.channelId);
        const avatarUrl = profile?.avatarId ? await ctx.storage.getUrl(profile.avatarId) : null;

        return {
          ...message,
          author: {
            name: profile?.name || user?.name || user?.email || "Unknown",
            avatarUrl,
          },
          channelName: channel?.name || "Unknown Channel",
        };
      })
    );

    return messagesWithDetails;
  },
});
