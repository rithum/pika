# Pika Serverless Plugin Examples

This directory contains complete working examples of how to use the Pika Serverless Plugin with different configuration approaches.

## Available Examples

### 1. YAML Example (`yaml-example/`)

- **Configuration**: Pure YAML `serverless.yml`
- **Best For**: Simple projects, teams preferring YAML
- **Features**: Complete weather service with agent and chat app
- **Language**: JavaScript/TypeScript for Lambda functions only

### 2. TypeScript Example (`typescript-example/`)

- **Configuration**: TypeScript `serverless.ts` with full type safety
- **Best For**: Large projects, teams wanting type safety
- **Features**: Comprehensive weather service with advanced functions
- **Language**: Full TypeScript with `@serverless/typescript`

## What These Examples Demonstrate

Both examples show the complete integration pattern:

- **AI Agent Configuration**: Custom prompts and behavior
- **Tool Definition**: Lambda functions as Bedrock agent tools
- **Chat App Setup**: Complete UI configuration with features
- **SSM Integration**: Dynamic resource ARN resolution
- **Auto-Tagging**: Automatic Lambda function tagging
- **Permissions**: Bedrock invoke permissions setup
- **Error Handling**: Production-ready error handling

## Key Differences

| Feature              | YAML Example      | TypeScript Example        |
| -------------------- | ----------------- | ------------------------- |
| Configuration Format | `serverless.yml`  | `serverless.ts`           |
| Type Safety          | Runtime only      | Compile-time + Runtime    |
| IntelliSense         | Limited           | Full support              |
| Weather Functions    | 3 basic functions | 5 comprehensive functions |
| Complexity           | Simple, focused   | Feature-complete          |
| Learning Curve       | Easier to start   | More powerful long-term   |

## Quick Start

Choose the example that matches your preferences:

### For YAML Configuration

```bash
cd yaml-example
npm install
npm run deploy:dev
```

### For TypeScript Configuration

```bash
cd typescript-example
npm install
npm run build
npm run deploy:dev
```

## Common Prerequisites

Both examples require:

- Node.js 22.x or higher
- Serverless Framework v3.x
- AWS CLI configured with appropriate permissions
- **Deployed Pika Infrastructure** (agent and chat app custom resources)
- SSM parameters with custom resource ARNs

## SSM Parameters Required

Your Pika infrastructure must have these SSM parameters:

```bash
/stack/pika/{stage}/lambda/agent_custom_resource_arn
/stack/pika/{stage}/lambda/chat_app_custom_resource_arn
/stack/pika/{stage}/s3/pika_bucket_name
```

## Testing Your Deployment

After successful deployment:

1. **Check CloudFormation Stack**: Verify resources were created
2. **Test Lambda Function**: Use `serverless invoke local`
3. **Access Chat UI**: Use your deployed Pika chat application
4. **Ask Weather Questions**:
    - "What's the weather in San Francisco?"
    - "Will it rain in London tomorrow?"
    - "Show me the forecast for Tokyo"

## Configuration Patterns

### Agent Configuration

```yaml
agents:
    - userId: 'cloudformation/${self:service}'
      agent:
          agentId: '${self:service}-agent-${self:provider.stage}'
          basePrompt: 'Your agent instructions...'
      tools:
          - toolId: '${self:service}-tool-${self:provider.stage}'
            name: 'your-tool'
            lambdaFunctionLogicalId: 'yourFunction'
            functionSchema: [...]
```

### Chat App Configuration

```yaml
chatApps:
    - userId: 'cloudformation/${self:service}'
      chatApp:
          chatAppId: 'your-chat'
          title: 'Your Assistant'
          agentId: '${self:service}-agent-${self:provider.stage}'
          features:
              suggestions: { ... }
              fileUpload: { ... }
```

## Extending the Examples

You can extend these examples by:

- Adding more Lambda functions as tools
- Creating multi-agent configurations
- Adding custom chat app features
- Integrating with external APIs
- Adding authentication and authorization

## Need Help?

- Review the individual README files in each example directory
- Check the main plugin [README.md](../README.md) for detailed documentation
- Enable debug mode: `SLS_DEBUG=* serverless deploy`
- Verify your Pika infrastructure is properly deployed
