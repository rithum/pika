# Pika Serverless Plugin

The Pika Serverless Plugin enables seamless integration of AI agents and chat applications with your existing [Serverless Framework v3](https://www.serverless.com/) projects.

## Installation

```bash
npm install --save-dev pika-serverless
```

## Quick Start

Add the plugin to your `serverless.yml`:

```yaml {:.no-twoslash}
service: my-service

plugins:
    - pika-serverless

provider:
    name: aws
    runtime: nodejs22.x

custom:
    pika:
        # Custom resource ARNs
        agentCustomResourceArn: '{{resolve:ssm:/stack/pika/${self:provider.stage}/lambda/agent_custom_resource_arn}}'
        chatAppCustomResourceArn: '{{resolve:ssm:/stack/pika/${self:provider.stage}/lambda/chat_app_custom_resource_arn}}'

        # Define your agents
        agents:
            - userId: 'cloudformation/${self:service}'
              agent:
                  agentId: '${self:service}-agent'
                  basePrompt: 'You are a helpful assistant.'
              tools:
                  - toolId: '${self:service}-tool'
                    name: 'my-tool'
                    displayName: 'My Tool'
                    description: 'A tool for my service'
                    executionType: 'lambda'
                    lambdaFunctionLogicalId: 'myFunction'
                    functionSchema: [...]
                    supportedAgentFrameworks: ['bedrock']

        # Define your chat apps
        chatApps:
            - userId: 'cloudformation/${self:service}'
              chatApp:
                  chatAppId: 'my-chat'
                  title: 'My Assistant'
                  agentId: '${self:service}-agent'
                  enabled: true

functions:
    myFunction:
        handler: src/lambda/index.handler
        timeout: 30
```

## What the Plugin Does

The plugin automatically:

1. **Tags Lambda Functions** - Adds `agent-tool: true` tags
2. **Adds Permissions** - Enables Bedrock to invoke your functions
3. **Creates Custom Resources** - Registers agents and chat apps
4. **Handles ARN Resolution** - Maps function logical IDs to ARNs

## Examples

We provide complete working examples:

- **[YAML Example](https://github.com/your-org/pika/tree/main/packages/pika-serverles/examples/yaml-example)** - Pure YAML configuration
- **[TypeScript Example](https://github.com/your-org/pika/tree/main/packages/pika-serverles/examples/typescript-example)** - Type-safe configuration

## Configuration Options

### Agent Configuration

Define AI agents that can use your Lambda functions as tools:

```yaml
agents:
    - userId: 'cloudformation/${self:service}'
      agent:
          agentId: 'my-agent'
          basePrompt: 'System prompt for your agent'
      tools:
          - toolId: 'my-tool'
            name: 'tool-name'
            displayName: 'Human Readable Name'
            description: 'What this tool does'
            executionType: 'lambda'
            lambdaFunctionLogicalId: 'functionName' # References functions section
            functionSchema: [...] # Bedrock function schema
            supportedAgentFrameworks: ['bedrock']
```

### Chat App Configuration

Create chat interfaces for your agents:

```yaml
chatApps:
    - userId: 'cloudformation/${self:service}'
      chatApp:
          chatAppId: 'my-chat'
          title: 'My Assistant'
          description: 'Helpful description'
          agentId: 'my-agent' # References agent above
          modesSupported: ['standalone', 'embedded']
          features:
              suggestions:
                  featureId: 'suggestions'
                  enabled: true
                  suggestions: ['Example question 1', 'Example question 2']
              fileUpload:
                  featureId: 'fileUpload'
                  enabled: true
                  mimeTypesAllowed: ['text/csv', 'application/json']
          enabled: true
```

## Lambda Handler Format

Your Lambda functions should return responses in Bedrock agent format:

```typescript
export const handler = async (event, context) => {
    const { function: functionName, parameters } = event;

    // Your business logic here
    const result = await processRequest(parameters);

    return {
        response: {
            actionGroup: event.actionGroup,
            function: functionName,
            functionResponse: {
                responseBody: {
                    TEXT: {
                        body: result
                    }
                }
            }
        }
    };
};
```

## Prerequisites

- Serverless Framework v3.x
- Node.js 22.x or higher
- Deployed Pika infrastructure (custom resource functions)
- SSM parameters with custom resource ARNs

## Need Help?

- **Full Documentation** - [Complete plugin documentation](https://github.com/your-org/pika/tree/main/packages/pika-serverles/)
- **Examples** - [Working examples](https://github.com/your-org/pika/tree/main/packages/pika-serverles/examples/)
- **Issues** - [Report bugs or get help](https://github.com/your-org/pika/issues)
