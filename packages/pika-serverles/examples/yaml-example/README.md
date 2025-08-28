# Weather Service - YAML Example

This example demonstrates how to use the Pika Serverless Plugin with a standard YAML `serverless.yml` configuration file.

## What This Example Shows

- **Complete Weather Service**: A working AI weather assistant
- **YAML Configuration**: Pure YAML setup without TypeScript configuration files
- **Agent & Chat App**: Both AI agent definition and chat UI configuration
- **Tool Integration**: Lambda function that serves as a Bedrock agent tool
- **Vanilla Serverless Framework**: No additional plugins beyond Pika

## Prerequisites

- Node.js 22.x or higher
- Serverless Framework v3.x
- AWS CLI configured
- Deployed Pika infrastructure (agent and chat app custom resources)

## Quick Start

1. **Install dependencies**:

    ```bash
    npm install
    ```

2. **Deploy the service**:
    ```bash
    npm run deploy:dev
    ```

## Configuration Structure

The configuration is defined directly in `serverless.yml` under the `custom.pika` section:

```yaml
custom:
    pika:
        # Custom resource ARNs from your Pika infrastructure
        agentCustomResourceArn: '...'
        chatAppCustomResourceArn: '...'

        # Agent definitions
        agents:
            - userId: 'cloudformation/${self:service}'
              agent: { ... }
              tools: [...]

        # Chat app definitions
        chatApps:
            - userId: 'cloudformation/${self:service}'
              chatApp: { ... }
```

## What Gets Deployed

1. **Lambda Function**: `weatherFunction` that handles weather requests
2. **Bedrock Agent**: AI agent configured with weather tools
3. **Chat Application**: Web UI for interacting with the weather agent
4. **IAM Permissions**: Bedrock invoke permissions for the Lambda function
5. **Function Tags**: `agent-tool: true` tags for identification

## Functions Available

The weather service provides these functions to the AI agent:

- **`getCurrentWeather`**: Get current weather for coordinates
- **`getWeatherForecast`**: Get multi-day forecast for coordinates
- **`getGeocoding`**: Convert city names to coordinates

## Testing

After deployment, you can:

1. **Use the Chat UI**: Access your deployed Pika chat application
2. **Test Queries**: Ask questions like:
    - "What's the weather in San Francisco?"
    - "Will it rain in London tomorrow?"
    - "Show me the 5-day forecast for Tokyo"
