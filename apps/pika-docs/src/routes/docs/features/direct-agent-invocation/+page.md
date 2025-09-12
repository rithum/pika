---
title: Direct Agent Invocation
description: Invoke agents programmatically without chat apps
outline: [2, 3]
---

Invoke agents directly via API without creating chat applications. Perfect for headless AI, system integrations, and programmatic workflows.

## What is Direct Agent Invocation?

Direct Agent Invocation lets you call agents programmatically through a simple API without the overhead of creating a full chat application. While chat apps provide rich user interfaces, direct invocation gives you the raw power of your agents for integration scenarios.

Note you can invoke an agent either from a chatapp or via direct agent invocation.

## When to use Direct Agent Invocation

### Perfect for:

- **API integrations**: Call agents from existing systems and microservices
- **Batch processing**: Process multiple requests programmatically
- **Headless AI workflows**: Embed intelligence without UI components
- **Testing and automation**: Validate agent behavior in CI/CD pipelines
- **Custom interfaces**: Build your own UI while leveraging Pika's agent infrastructure

### Still need a chat app?

If you want user-facing conversational interfaces with session persistence, file uploads, suggestions, and rich UI components, stick with [Advanced Chat Apps](/docs/features/advanced-chat-apps/).

## How it works

1. **Deploy agent-only**: Define and deploy agents with tools, but skip the chat app creation
2. **Get the function URL**: Pika automatically creates a Lambda function URL for direct access
3. **Make API calls**: Send HTTP requests with your message and agent ID
4. **Receive responses**: Get streaming or complete responses directly from the agent

## Key benefits

### Simplified deployment

- No chat app configuration required
- Focus only on agent logic and tools
- Faster deployment and iteration cycles

### Seamless integration

- Standard HTTP API interface
- JWT authentication using existing secrets
- Works with any programming language or framework

### Full agent capabilities

- All agent features work in direct mode
- Access to tools, reasoning, and streaming responses
- Same reliability and performance as chat apps

### Clean separation

- Direct invocations don't appear in chat app UIs
- Separate session management with synthetic IDs
- Admin visibility for monitoring and debugging

## Architecture

Direct Agent Invocation uses the same underlying infrastructure as chat apps but bypasses the UI layer entirely:

```
Your Application → HTTP Request → Pika Lambda → Bedrock Agent → Tools
                                      ↓
                               Session Storage (Hidden)
```

Sessions are still created for consistency and admin visibility, but use synthetic chat app IDs that won't interfere with real chat applications.

## Example use cases

### Microservice integration

```js
// From your existing API
const response = await fetch(pikaFunctionUrl, {
    method: 'POST',
    headers: { 'x-chat-auth': jwtToken },
    body: JSON.stringify({
        invocationMode: 'direct-agent-invoke',
        message: 'Analyze this customer feedback...',
        agentId: 'feedback-analyzer-agent',
        userId: 'system'
    })
});
```

### Automated workflows

```js
// Process multiple requests
for (const item of batchData) {
    const result = await invokeAgent({
        message: `Process this data: ${JSON.stringify(item)}`,
        agentId: 'data-processor-agent'
    });
    await saveProcessedResult(result);
}
```

### Testing and validation

```js
// In your test suite
describe('Weather Agent', () => {
    it('should provide temperature in both units', async () => {
        const response = await invokeAgent({
            message: 'What is the weather in San Francisco?',
            agentId: 'weather-agent'
        });
        expect(response).toMatch(/°C.*°F|°F.*°C/);
    });
});
```

## Getting started

Ready to implement Direct Agent Invocation? The [Developer Guide](/docs/developer/direct-agent-invocation/) walks you through:

- Setting up agent-only deployments
- Making your first API calls
- Authentication and error handling
- Complete code samples

:::tip[Start with the sample]
The fastest way to understand Direct Agent Invocation is to deploy the weather-direct sample included in the Pika repository. It demonstrates the complete pattern from CDK deployment to API calls.
:::
