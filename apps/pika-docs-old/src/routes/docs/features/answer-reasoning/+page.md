---
title: Answer Reasoning (Traces)
description: See how your AI agent thinks through problems step-by-step
outline: [2, 3]
---

Ever wonder how your AI agent arrives at its answers? The Answer Reasoning feature lets you peek behind the curtain to see the agent's thought process in real-time. Reasoning begins streaming back long before the answer itself is returned from the AI.

![Traces](/assets/img/traces.png 'Traces')

## What you get

When enabled, users can see:

- **How the agent thinks** - Step-by-step reasoning as it works through problems
- **When things go wrong** - Clear explanations if the agent can't answer something
- **Tool usage** - Which external tools the agent used and why
- **Quality checks** - How confident the agent is in its response

## Who can see traces?

You control who gets access to reasoning traces:

- **Basic traces** - Show general thought process (good for most users)
- **Detailed traces** - Include technical parameters (typically for admins only)

:::tip[Great for debugging]
Traces help you understand why an agent gave a particular answer, making it easier to improve prompts and troubleshoot issues.
:::

:::note[Privacy control]
You can enable traces for specific user roles (like content admins) while keeping them hidden from regular users.
:::

:::warning[Configuration Required]
The Answer Reasoning (Traces) feature must be enabled in your site-wide `pika-config.ts` file before chat apps can use it. Without this enablement, traces will not be available regardless of individual chat app settings.
:::
