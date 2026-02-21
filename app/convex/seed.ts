import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";

const TEST_PASSWORD = "testtest123";

const SEED_USERS = {
  ownerA: {
    email: "seed.owner.a@chatwave.test",
    name: "Seed Owner A",
  },
  memberA: {
    email: "seed.member.a@chatwave.test",
    name: "Seed Member A",
  },
  ownerB: {
    email: "seed.owner.b@chatwave.test",
    name: "Seed Owner B",
  },
  memberB: {
    email: "seed.member.b@chatwave.test",
    name: "Seed Member B",
  },
} as const;

const WORKSPACE_CHANNELS = ["general", "product", "random"] as const;

async function ensureUser(ctx: ActionCtx, email: string, password: string) {
  let user = await ctx.runQuery(internal.seed.findUserByEmail, { email });

  if (!user) {
    await ctx.runAction(api.auth.signIn, {
      provider: "password",
      params: {
        email,
        password,
        flow: "signUp",
      },
    });

    user = await ctx.runQuery(internal.seed.findUserByEmail, { email });
  }

  if (!user) {
    throw new Error(`Failed to ensure user: ${email}`);
  }

  return user;
}

async function ensureWorkspace(
  ctx: ActionCtx,
  name: string,
  createdBy: Id<"users">,
) {
  const existing = await ctx.runQuery(internal.seed.findWorkspaceByName, { name });
  if (existing) {
    return existing;
  }

  const workspaceId = await ctx.runMutation(internal.workspaces.createWorkspace, {
    name,
    createdBy,
  });

  const workspace = await ctx.runQuery(internal.seed.findWorkspaceByName, { name });
  if (!workspace || workspace._id !== workspaceId) {
    throw new Error(`Failed to create workspace: ${name}`);
  }

  return workspace;
}

async function ensureChannel(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  name: string,
  createdBy: Id<"users">,
) {
  const existing = await ctx.runQuery(internal.seed.findChannelByWorkspaceAndName, {
    workspaceId,
    name,
  });
  if (existing) {
    return existing;
  }

  const channelId = await ctx.runMutation(internal.seed.createChannelForSeed, {
    workspaceId,
    name,
    createdBy,
  });

  const channel = await ctx.runQuery(internal.seed.findChannelByWorkspaceAndName, {
    workspaceId,
    name,
  });

  if (!channel || channel._id !== channelId) {
    throw new Error(`Failed to create channel: ${name}`);
  }

  return channel;
}

function buildSeedMessages(workspaceName: string, channelName: string) {
  return [
    `Welcome to ${workspaceName}.`,
    `Use #${channelName} for focused updates.`,
    `Posting a seeded message so this channel has history.`,
    `ChatWave seed completed for #${channelName}.`,
  ];
}

export default internalAction(async (ctx) => {
  const ownerA = await ensureUser(ctx, SEED_USERS.ownerA.email, TEST_PASSWORD);
  const memberA = await ensureUser(ctx, SEED_USERS.memberA.email, TEST_PASSWORD);
  const ownerB = await ensureUser(ctx, SEED_USERS.ownerB.email, TEST_PASSWORD);
  const memberB = await ensureUser(ctx, SEED_USERS.memberB.email, TEST_PASSWORD);

  await ctx.runMutation(internal.seed.upsertProfileForUser, {
    userId: ownerA._id,
    name: SEED_USERS.ownerA.name,
  });
  await ctx.runMutation(internal.seed.upsertProfileForUser, {
    userId: memberA._id,
    name: SEED_USERS.memberA.name,
  });
  await ctx.runMutation(internal.seed.upsertProfileForUser, {
    userId: ownerB._id,
    name: SEED_USERS.ownerB.name,
  });
  await ctx.runMutation(internal.seed.upsertProfileForUser, {
    userId: memberB._id,
    name: SEED_USERS.memberB.name,
  });

  const workspaceA = await ensureWorkspace(ctx, "Seed Workspace A", ownerA._id);
  const workspaceB = await ensureWorkspace(ctx, "Seed Workspace B", ownerB._id);

  await ctx.runMutation(internal.workspaces.addMember, {
    workspaceId: workspaceA._id,
    userId: ownerA._id,
    role: "owner",
  });
  await ctx.runMutation(internal.workspaces.addMember, {
    workspaceId: workspaceA._id,
    userId: memberA._id,
    role: "member",
  });
  await ctx.runMutation(internal.workspaces.addMember, {
    workspaceId: workspaceB._id,
    userId: ownerB._id,
    role: "owner",
  });
  await ctx.runMutation(internal.workspaces.addMember, {
    workspaceId: workspaceB._id,
    userId: memberB._id,
    role: "member",
  });

  for (const workspace of [
    { data: workspaceA, ownerId: ownerA._id, memberId: memberA._id },
    { data: workspaceB, ownerId: ownerB._id, memberId: memberB._id },
  ]) {
    for (const channelName of WORKSPACE_CHANNELS) {
      const channel = await ensureChannel(
        ctx,
        workspace.data._id,
        channelName,
        workspace.ownerId,
      );

      const messageCount = await ctx.runQuery(internal.seed.countMessagesForChannel, {
        channelId: channel._id,
      });

      if (messageCount > 0) {
        continue;
      }

      const contents = buildSeedMessages(workspace.data.name, channelName);
      const authors = [workspace.ownerId, workspace.memberId, workspace.ownerId, workspace.memberId];

      for (let i = 0; i < contents.length; i += 1) {
        await ctx.runMutation(internal.seed.insertMessageForSeed, {
          workspaceId: workspace.data._id,
          channelId: channel._id,
          authorId: authors[i],
          content: contents[i],
        });
      }
    }
  }

  console.log("\n========== ChatWave Seed Complete ==========");
  console.log(`Password for all users: ${TEST_PASSWORD}`);
  console.log("Workspace A:");
  console.log(`  owner: ${SEED_USERS.ownerA.email}`);
  console.log(`  member: ${SEED_USERS.memberA.email}`);
  console.log("Workspace B:");
  console.log(`  owner: ${SEED_USERS.ownerB.email}`);
  console.log(`  member: ${SEED_USERS.memberB.email}`);
  console.log("Channels per workspace: #general, #product, #random");
  console.log("============================================\n");
});

export const findUserByEmail = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const findWorkspaceByName = internalQuery({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaces")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

export const findChannelByWorkspaceAndName = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channels")
      .withIndex("by_workspace_and_name", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("name", args.name),
      )
      .first();
  },
});

export const countMessagesForChannel = internalQuery({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();

    return messages.length;
  },
});

export const createChannelForSeed = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    createdBy: v.id("users"),
  },
  returns: v.id("channels"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("channels", {
      workspaceId: args.workspaceId,
      name: args.name,
      createdBy: args.createdBy,
    });
  },
});

export const insertMessageForSeed = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    channelId: v.id("channels"),
    authorId: v.id("users"),
    content: v.string(),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      workspaceId: args.workspaceId,
      channelId: args.channelId,
      authorId: args.authorId,
      content: args.content,
    });
  },
});

export const upsertProfileForUser = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
      });
      return;
    }

    await ctx.db.insert("profiles", {
      userId: args.userId,
      name: args.name,
    });
  },
});
