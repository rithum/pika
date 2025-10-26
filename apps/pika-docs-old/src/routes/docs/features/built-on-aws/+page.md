---
title: Built on Amazon Web Services
description: Describes how the platform is built on AWS
outline: [2, 3]
---

Pika runs on proven AWS services so you inherit scalability, security, and operational maturity from day one.

## Architecture essentials

- **Amazon Bedrock**: Executes the LLM and inline agents (e.g., Anthropic Claude) with native function calling.
- **AWS Lambda (Function URL)**: Stateless compute for chat orchestration and streamed responses.
- **Amazon API Gateway**: REST APIs for sessions, messages, titles, and suggestions.
- **Amazon DynamoDB**: Durable storage for chat sessions, messages, users, and dynamic agent/tool definitions.
- **Amazon S3**: Stores generated insights as JSON; optional asset storage.
- **Amazon OpenSearch Service**: Indexed sessions, feedback, and insights for search and analysis.
- **Amazon EventBridge**: Schedules the insights runner and other background jobs.
- **AWS IAM**: Least‑privilege access; tools are tagged (e.g., `agent-tool`) for safe Bedrock invocation.

## What this gives you

- **Operational simplicity**: No servers to manage; CDK sets up infra and wiring.
- **Elastic scale**: Spikes in chat traffic are handled automatically.
- **Security by default**: IAM, VPC options, and encrypted cookies minimize risk.
- **Clear observability**: Traces, usage, and costs are captured per message.

:::note[Deployment]
You deploy with AWS CDK: separate frontend and backend stacks, plus hooks for adding your own IAM policies and resources.
:::

:::warning[Replace mock auth before production]
The default dev auth is intentionally insecure. Implement your provider and assign user types and roles before going live.
:::
