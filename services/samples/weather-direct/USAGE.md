# Weather Direct Agent - Usage Guide

This sample demonstrates direct agent invocation without a chat app. Follow these steps to deploy and test.

## Prerequisites

1. **Pika Core Service Deployed**: The main Pika service must be deployed first
2. **AWS CLI Configured**: With appropriate permissions
3. **Node.js 22+**: Required for building and running

## Step 1: Deploy the Weather Direct Stack

```bash
# Navigate to the weather-direct directory
cd services/samples/weather-direct

# Install dependencies
npm install

# Deploy to test stage (default)
npm run cdk:deploy

# Or deploy to a specific stage
STAGE=dev npm run cdk:deploy
```

This will create:

- Weather agent with direct invocation support
- Weather tool lambda function
- **NO chat app** (this is the key difference)

## Step 2: Test Direct Agent Invocation

Use the included CLI tool to test direct agent invocation:

```bash
# Basic weather query
npm run cli -- "What's the weather in Tokyo?"

# More complex queries
npm run cli -- "Will it rain in San Francisco this weekend?"
npm run cli -- "What's the temperature difference between New York and London?"

# With verbose output
npm run cli -- "What's the weather in Paris?" --verbose

# Specify different stage
STAGE=dev npm run cli -- "What's the weather in Berlin?"

# Get CLI help
npm run cli -- --help
```

## What Happens Behind the Scenes

### 1. CLI Tool Flow

```
CLI Tool → SSM (get converse URL) → SSM (get agent ID) → SSM (get JWT secret) → Converse Function
```

### 2. Direct Invocation Request

```json
{
    "invocationMode": "direct-agent-invoke",
    "message": "What's the weather in Tokyo?",
    "agentId": "weather-direct-agent-test",
    "userId": "cli-user",
    "features": {
        "verifyResponse": { "enabled": false }
    }
}
```

### 3. Session Management

- **Synthetic `chatAppId`**: `direct-agent-weather-direct-agent-test`
- **Real session**: Created in DynamoDB with synthetic ID
- **No UI impact**: Sessions won't appear in chat app frontend
- **Admin visibility**: Sessions visible in admin tools

## CLI Options

| Option            | Default          | Description             |
| ----------------- | ---------------- | ----------------------- |
| `--stage`         | `test`           | Deployment stage        |
| `--user-id`       | `cli-user`       | User ID for the request |
| `--region`        | `us-east-1`      | AWS region              |
| `--pika-service`  | `pika`           | Pika service name       |
| `--agent-service` | `weather-direct` | Agent service name      |
| `--verbose`       | `false`          | Verbose output          |

## Example Session

```bash
$ npm run cli -- "What's the weather in San Francisco?"

Getting converse function URL from SSM: /stack/pika/test/function/converse_url
Getting agent ID from SSM: /stack/weather-direct/test/agent_id
Getting JWT secret from SSM: /stack/pika/test/jwt-secret
Invoking agent: weather-direct-agent-test
Message: What's the weather in San Francisco?
Function URL: https://abcd1234.lambda-url.us-east-1.on.aws/

Response:
────────────
I'll help you get the current weather for San Francisco. Let me fetch that information for you.

The current weather in San Francisco is:
- **Temperature**: 16°C (61°F)
- **Condition**: Partly cloudy
- **Humidity**: 78%
- **Wind**: 12 km/h from the west
- **Visibility**: 16 km

It's a pleasant day with partly cloudy skies. The temperature is quite comfortable for this time of year in San Francisco.
────────────
Done
```

## Troubleshooting

### Common Issues

1. **"Parameter not found"**: Make sure the Pika service is deployed first
2. **"Agent not found"**: Ensure the weather-direct stack deployed successfully
3. **"JWT verification failed"**: Check that JWT secret is accessible
4. **"HTTP 403"**: Verify AWS credentials and IAM permissions

### Debug Mode

```bash
# Enable verbose output to see all parameters and requests
npm run cli -- "What's the weather?" --verbose
```

### Manual Testing

You can also test using curl (with proper JWT):

```bash
curl -X POST "https://YOUR-FUNCTION-URL.lambda-url.us-east-1.on.aws/" \
  -H "Content-Type: application/json" \
  -H "x-chat-auth: YOUR-JWT-TOKEN" \
  -d '{
    "invocationMode": "direct-agent-invoke",
    "message": "Whats the weather in Tokyo?",
    "agentId": "weather-direct-agent-test",
    "userId": "test-user"
  }'
```

## Comparison with Full Weather Sample

| Feature              | Weather Sample | Weather-Direct Sample |
| -------------------- | -------------- | --------------------- |
| **Agent**            | Yes            | Yes                   |
| **Tools**            | Yes            | Yes                   |
| **Chat App**         | Yes            | No                    |
| **Frontend UI**      | Yes            | No                    |
| **Direct CLI**       | No             | Yes                   |
| **Session Storage**  | Real chatAppId | Synthetic chatAppId   |
| **Admin Visibility** | Yes            | Yes                   |

## Next Steps

1. **Custom Agent**: Modify the agent prompt and tools for your use case
2. **Production CLI**: Enhance the CLI tool with better error handling
3. **API Integration**: Use the direct invocation pattern in your applications
4. **Multiple Agents**: Deploy multiple agent-only stacks for different purposes
