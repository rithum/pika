---
title: LLM-based Agents
description: Describes agents in the platform
outline: [2, 3]
---

Agents in Pika run on Amazon Bedrock. They stream answers, call tools with typed inputs, and operate under clear access rules.

## How agents work

- **Base prompt** defines role and guardrails.
- **Tool references** give the agent capabilities (each tool has an input/output schema).
- **Access rules and rollout** control who can use what, and where.
- **Caching** can be enabled per agent for performance and testing.

Chat app, agent and tool definitions live in a centralized registry (DynamoDB), so you can evolve capabilities without redeploying the Pika infrastructur and future-proof your agents as new technologies come online (e.g. MCP).

## Tool calling with schemas

Tools run in Lambda and declare JSON function schemas. The agent validates inputs and returns typed results, improving reliability and transparency.

## Streaming responses

Users see answers as they’re generated. The platform updates history and usage metrics when the turn completes.

## Bring your knowledge

Augment agents with your data sources and domain tools. Use the registry to experiment safely while keeping a clear audit trail of changes.

:::tip[Design prompts for maintainability]
Keep prompts focused and let tools handle data retrieval and actions. This keeps agents adaptable as your system grows.
:::
