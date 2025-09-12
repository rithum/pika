# Weather Direct Agent Sample

This sample demonstrates how to create and deploy an agent for direct invocation without requiring a chat app. It includes:

1. **CDK Stack**: Deploys the weather agent and tools without creating a chat app
2. **CLI Tool**: Command-line interface for invoking the agent directly via the converse lambda function URL

## Quick Start

You must first deploy the pika back end in `services/pika` before continueing.

### 1. Deploy the Stack

```bash
# Deploy to test stage (default)
npm run cdk:deploy

# Deploy to specific stage
STAGE=dev npm run cdk:deploy
```

### 2. Test Direct Agent Invocation

```bash
# Ask a weather question
npm run cli -- "What's the weather in San Francisco?"

# Specify stage if needed
STAGE=dev npm run cli -- "Will it rain in London tomorrow?"

# Get help
npm run cli -- --help
```

## What This Sample Includes

### Agent-Only Deployment

- **Weather Agent**: Uses the same weather tool as the full sample
- **No Chat App**: Demonstrates agent-only deployment
- **Direct Invocation**: Uses the new `direct-agent-invoke` mode

### CLI Tool Features

- **Direct Lambda Invocation**: Calls converse function URL directly
- **Streaming Support**: Handles streamed responses
- **Automatic Configuration**: Retrieves function URL from SSM
- **Stage Support**: Works with different deployment stages

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   CLI Tool  │───▶│   Converse   │───▶│   Weather   │
│             │    │   Function   │    │   Agent     │
└─────────────┘    └──────────────┘    └─────────────┘
                           │                    │
                           ▼                    ▼
                   ┌──────────────┐    ┌─────────────┐
                   │   Session    │    │   Weather   │
                   │  Management  │    │   Tool      │
                   └──────────────┘    └─────────────┘
```

## Key Differences from Full Weather Sample

| Feature         | Weather Sample | Weather-Direct Sample |
| --------------- | -------------- | --------------------- |
| Chat App        | Yes Created    | No Not created        |
| Agent           | Yes Created    | Yes Created           |
| Tools           | Yes Created    | Yes Created           |
| Frontend        | Yes Works      | No N/A                |
| Direct CLI      | No No          | Yes Included          |
| Invocation Mode | `chat-app`     | `direct-agent-invoke` |

## Files Structure

```
weather-direct/
├── bin/
│   ├── cli.ts              # CLI tool for direct invocation
│   ├── weather-direct.ts   # CDK deployment script
│   └── sts.ts             # AWS STS utilities
├── lib/stacks/
│   ├── index.ts           # Stack exports
│   └── weather-direct-stack.ts  # Modified stack (no chat app)
├── src/lambda/weather/    # Same weather lambda as original
└── package.json           # Includes CLI dependencies
```

## Direct Invocation Example

The CLI tool demonstrates the new direct agent invocation capability:

```typescript
const request = {
    invocationMode: 'direct-agent-invoke',
    message: "What's the weather in Tokyo?",
    agentId: 'weather-direct-agent-test',
    userId: 'cli-user',
    features: {
        verifyResponse: { enabled: false }
    }
};
```

This bypasses the chat app requirement and invokes the agent directly using synthetic session management.
