# Convex Workflow Guide

Use the Workflow component (`@convex-dev/workflow`) for durable, long-running orchestration in Convex.

## When to Use Workflow

Use Workflow for:
- multi-step jobs with retries and backoff
- jobs that must survive restarts and run for long durations
- cancelable background orchestration
- human-in-the-loop flows waiting on external events

Avoid Workflow for:
- simple one-step background tasks (use scheduler directly)
- tightly-coupled synchronous request flows

## Install and Register

Install required packages:

```bash
npm install @convex-dev/workflow @convex-dev/workpool convex-helpers
```

Register the component:

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import workflowComponent from "@convex-dev/workflow/convex.config.js";

const app = defineApp();
app.use(workflowComponent);
export default app;
```

## Create a Shared Workflow Manager

```typescript
// convex/workflow.ts
import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

export const workflow = new WorkflowManager(components.workflow);
```

## Define Workflows

```typescript
// convex/onboarding.ts
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { workflow } from "./workflow";

export const userOnboarding = workflow.define({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.users.initializeProfile, args);
    await ctx.runAction(internal.notifications.sendWelcomeEmail, args, {
      retry: true,
    });
  },
});
```

Notes:
- Keep handlers deterministic.
- Push non-deterministic/external work into `runQuery`, `runMutation`, and `runAction` steps.
- Prefer explicit return types on handlers (`Promise<void>` / `Promise<T>`) to avoid type cycles.

## Start Workflows

```typescript
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { workflow } from "./workflow";

export const kickoffOnboarding = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await workflow.start(ctx, internal.onboarding.userOnboarding, args);
  },
});
```

## Runtime Operations

- `workflow.start(ctx, workflowRef, args)` launches a workflow and returns `workflowId`.
- `workflow.status(ctx, workflowId)` gets current status.
- `workflow.cancel(ctx, workflowId)` cancels execution.
- `workflow.cleanup(ctx, workflowId)` deletes completed workflow state.
- `workflow.list(ctx, paginationOpts)` and `workflow.listSteps(ctx, workflowId)` support inspection and debugging.

## Events and Human-in-the-Loop

Use `ctx.awaitEvent(...)` inside workflows and `workflow.sendEvent(...)` from a mutation/action to resume blocked workflows.

```typescript
// In workflow handler
await ctx.awaitEvent({ name: "approval" });

// In mutation/action
await workflow.sendEvent(ctx, { name: "approval", workflowId });
```

Use shared validators for event payloads when values must be typed and validated.

## Workpool and Retry Tuning

You can tune defaults with `WorkflowManager` options:
- `defaultRetryBehavior`
- `retryActionsByDefault`
- `maxParallelism`

Keep `maxParallelism` conservative to avoid starving other scheduled work.

## Constraints and Gotchas

- Workflow state has size limits; store large outputs in Convex tables/storage and pass IDs between steps.
- Completed workflows are not auto-cleaned; call `workflow.cleanup(...)` where appropriate.
- Events must be sent on the same workflow component and correct `workflowId`.

## References

- Component directory: https://www.convex.dev/components
- Workflow docs: https://www.convex.dev/components/workflow
