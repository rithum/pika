---
title: Direct Agent Invocation
description: How to invoke agents directly without chat apps
outline: [2, 3]
---

Learn how to invoke agents programmatically via API without creating chat applications. Perfect for system integrations and headless AI workflows.

## Overview

Direct Agent Invocation lets you call agents through a simple HTTP API. You deploy only the agent and its tools—no chat app required—then make API calls to get responses.

Note you can invoke an agent either from a chatapp or via direct agent invocation.

## Quick Start

### 1. Deploy an agent-only stack

Instead of creating a chat app, deploy just the agent and tools:

<Tabs activeName="CDK Stack">
<TabPanel name="CDK Stack">

```js
// weather-direct-stack.ts
import { AgentDataRequest } from 'pika-shared/types/chatbot/chatbot-types';

// Create agent without chat app
const agentData: AgentDataRequest = {
    userId: `cloudformation/${this.stackName}`,
    agent: {
        agentId: `weather-agent-${stage}`,
        basePrompt: 'You are a helpful weather assistant...'
    },
    tools: [{
        toolId: `weather-tool-${stage}`,
        name: 'weather-tool',
        displayName: 'Weather Tool',
        description: 'Get current weather information',
        executionType: 'lambda',
        lambdaArn: 'WILL_BE_REPLACED_BY_CUSTOM_RESOURCE',
        functionSchema: weatherFunctionSchema
    }]
};

// Deploy the agent (no chat app custom resource)
new cdk.CustomResource(this, 'WeatherAgentResource', {
    serviceToken: agentCustomResourceArn,
    properties: {
        AgentData: gzipAndBase64EncodeString(JSON.stringify(agentData)),
        ToolIdToLambdaArnMap: {
            [`weather-tool-${stage}`]: weatherLambda.functionArn
        }
    }
});
```

</TabPanel>
<TabPanel name="Serverless Plugin">

```yaml
# serverless.yml using pika-serverless plugin
service: weather-direct

plugins:
    - pika-serverless

custom:
    pika:
        # Define agent without chat app
        agents:
            weather-agent:
                basePrompt: 'You are a helpful weather assistant...'
                tools:
                    - weather-tool

        tools:
            weather-tool:
                name: weather-tool
                displayName: Weather Tool
                description: Get current weather information
                handler: src/weather.handler
                functionSchema:
                    - name: get_weather
                      description: Get current weather
                      parameters:
                          type: object
                          properties:
                              location:
                                  type: string
                                  description: City name
                          required: [location]

        # No chatApps section = agent-only deployment
```

</TabPanel>
</Tabs>

### 2. Get the function URL

After deploying Pika core infrastructure, you can retrieve the converse function URL:

```js
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({ region: 'us-east-1' });

// Get the converse function URL
const urlParam = await ssm.send(
    new GetParameterCommand({
        Name: '/stack/pika/test/function/converse_url'
    })
);

const converseFunctionUrl = urlParam.Parameter.Value;
```

### 3. Make your first API call

**Important**: The Lambda Function URL requires AWS IAM authentication. You must sign requests with your AWS credentials.

<Tabs activeName="JavaScript">
<TabPanel name="JavaScript">

```js
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@smithy/signature-v4';

// Create JWT token (you'll need the JWT secret from SSM)
const jwtToken = createJWT('your-user-id', jwtSecret);

// Parse the Function URL for signing
const url = new URL(converseFunctionUrl);

// Prepare the request for AWS IAM signing
const requestToSign = {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname + url.search,
    protocol: url.protocol,
    headers: {
        Host: url.hostname,
        'Content-Type': 'application/json',
        'x-chat-auth': `Bearer ${jwtToken}`
    },
    body: JSON.stringify({
        invocationMode: 'direct-agent-invoke',
        message: 'What is the weather in San Francisco?',
        agentId: 'weather-agent-test',
        userId: '123', // Default hardcoded user ID
        features: {
            verifyResponse: { enabled: true },
            instructionAugmentation: { enabled: true },
            tags: { tagsEnabled: [] }
        }
    })
};

// Create AWS IAM signer
const signer = new SignatureV4({
    credentials: defaultProvider(),
    region: 'us-east-1',
    service: 'lambda', // Lambda Function URLs use 'lambda' service
    sha256: Sha256
});

// Sign the request
const signedRequest = await signer.sign(requestToSign);

// Make the signed request
const response = await fetch(converseFunctionUrl, {
    method: signedRequest.method,
    headers: signedRequest.headers,
    body: signedRequest.body
});

// Handle streaming response
const reader = response.body.getReader();
const decoder = new TextDecoder();
let content = '';

while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
        if (line.trim()) {
            try {
                const data = JSON.parse(line);
                if (data.content) {
                    content += data.content;
                    process.stdout.write(data.content);
                }
            } catch {
                // Handle non-JSON content
                process.stdout.write(line);
            }
        }
    }
}
```

</TabPanel>

<TabPanel name="cURL">

```bash
# Note: cURL doesn't natively support AWS IAM signing
# Use the AWS CLI or a signing tool instead

# Alternative: Use AWS CLI to invoke the function URL with proper signing
FUNCTION_URL=$(aws ssm get-parameter \
  --name "/stack/pika/test/function/converse_url" \
  --query "Parameter.Value" --output text)

JWT_SECRET=$(aws ssm get-parameter \
  --name "/stack/pika/test/jwt-secret" \
  --with-decryption \
  --query "Parameter.Value" --output text)

# Create JWT token (requires external tool or script)
JWT_TOKEN=$(node -e "
  const jwt = require('jsonwebtoken');
  const payload = {
    userId: '123',  // Default hardcoded user ID
    customUserData: undefined
  };
  console.log(jwt.sign(payload, '$JWT_SECRET', { expiresIn: '1h' }));
")

# Use awscurl (AWS request signing tool) for proper IAM authentication
pip install awscurl

awscurl --service lambda --region us-east-1 \
  -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-chat-auth: $JWT_TOKEN" \
  -d '{
    "invocationMode": "direct-agent-invoke",
    "message": "What is the weather in Tokyo?",
    "agentId": "weather-agent-test",
    "userId": "123"
  }'
```

</TabPanel>
</Tabs>

## Request Format

### Required fields

```js
{
  "invocationMode": "direct-agent-invoke",  // Enables direct mode
  "message": "Your question or instruction",
  "agentId": "your-agent-id",              // Must match deployed agent
  "userId": "123"                          // Must exist in chat-user table
}
```

:::warning[Valid User ID Required]
The `userId` must exist in Pika's chat-user table. The default value `"123"` is a hardcoded user ID that comes with Pika's built-in insecure authentication system (intended to be replaced in production). You can:

- Use `"123"` for testing (works out of the box)
- Create users via auth provider implementation
  :::

### Optional fields

```js
{
  // ... required fields ...
  "features": {                            // Override default features
    "verifyResponse": { "enabled": false },
    "instructionAugmentation": { "enabled": false },
    "tags": { "tagsEnabled": [] }
  },
  "sessionId": "existing-session-id",      // Resume existing session
  "files": [                              // File attachments (if supported)
    {
      "fileName": "data.csv",
      "fileContent": "base64-encoded-content",
      "mimeType": "text/csv"
    }
  ]
}
```

## Authentication

Direct Agent Invocation requires **two layers of authentication**:

1. **AWS IAM Authentication**: Required for the Lambda Function URL
2. **JWT Authentication**: Required by the application logic

### Required Dependencies

```bash
npm install @aws-crypto/sha256-js @aws-sdk/credential-provider-node @smithy/signature-v4 jsonwebtoken
```

### Get JWT secret from SSM

```js
const jwtSecret = await ssm
    .send(
        new GetParameterCommand({
            Name: '/stack/pika/test/jwt-secret',
            WithDecryption: true // Important: Must decrypt SecureString parameters
        })
    )
    .then((result) => result.Parameter.Value);
```

### Create JWT token

<Tabs activeName="Node.js">
<TabPanel name="Node.js">

```js
import jwt from 'jsonwebtoken';

function createJWT(user, secret) {
    // User must be an object with userId and optional customUserData
    return jwt.sign(user, secret, { expiresIn: '1h' });
}

// Usage:
const user = {
    userId: '123', // Must exist in chat-user table
    customUserData: undefined
};
const jwtToken = createJWT(user, jwtSecret);
```

</TabPanel>

</Tabs>

## Response Handling

### Streaming responses

The API returns streaming JSON objects, one per line:

```js
// Example response stream
{"content": "I'll help you get the weather for San Francisco."}
{"content": " Let me fetch that information."}
{"content": "\n\nThe current weather in San Francisco:"}
{"content": "\n- Temperature: 16°C (61°F)"}
{"content": "\n- Condition: Partly cloudy"}
// ... more content chunks
```

### Error responses

```
// Error in stream
{"error": "Agent not found", "code": "AGENT_NOT_FOUND"}

// HTTP errors
// 400: Bad request (missing required fields)
// 401: Unauthorized (invalid JWT)
// 404: Agent not found
// 500: Internal server error
```

## Complete Example: CLI Tool

Here's a complete CLI tool that demonstrates all the concepts including AWS IAM signing:

```js
#!/usr/bin/env node
import { Sha256 } from '@aws-crypto/sha256-js';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@smithy/signature-v4';
import { Command } from 'commander';
import jwt from 'jsonwebtoken';

async function getParameterFromSSM(parameterName, region) {
    const client = new SSMClient({ region });
    const response = await client.send(
        new GetParameterCommand({
            Name: parameterName,
            WithDecryption: true // Important: Must decrypt SecureString parameters
        })
    );

    if (!response.Parameter?.Value) {
        throw new Error(`Parameter ${parameterName} not found`);
    }

    return response.Parameter.Value;
}

function createJWT(user, jwtSecret) {
    return jwt.sign(user, jwtSecret, { expiresIn: '1h' });
}

async function invokeAgent(functionUrl, request, jwtToken, region) {
    // Parse the Function URL for AWS IAM signing
    const url = new URL(functionUrl);

    // Prepare the request for signing
    const requestToSign = {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname + url.search,
        protocol: url.protocol,
        headers: {
            Host: url.hostname,
            'Content-Type': 'application/json',
            'x-chat-auth': `Bearer ${jwtToken}` // Include Bearer prefix
        },
        body: JSON.stringify(request)
    };

    // Create AWS IAM signer
    const signer = new SignatureV4({
        credentials: defaultProvider(),
        region: region,
        service: 'lambda', // Lambda Function URLs use 'lambda' service
        sha256: Sha256
    });

    // Sign the request
    const signedRequest = await signer.sign(requestToSign);

    // Make the signed request
    const response = await fetch(functionUrl, {
        method: signedRequest.method,
        headers: signedRequest.headers,
        body: signedRequest.body
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    console.log('Response:');
    console.log('────────────');

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete JSON objects
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            if (line) {
                try {
                    const data = JSON.parse(line);
                    if (data.content) {
                        process.stdout.write(data.content);
                    } else if (data.error) {
                        console.error('\nError:', data.error);
                    }
                } catch {
                    // Handle non-JSON content
                    process.stdout.write(line);
                }
            }
        }
    }

    // Process any remaining buffer content
    if (buffer.trim()) {
        try {
            const data = JSON.parse(buffer);
            if (data.content) {
                process.stdout.write(data.content);
            }
        } catch {
            process.stdout.write(buffer);
        }
    }

    console.log('\n────────────');
    console.log('Done');
}

async function main() {
    const program = new Command();

    program
        .name('pika-direct-cli')
        .description('CLI tool for direct agent invocation')
        .version('1.0.0')
        .argument('<message>', 'message to send to the agent')
        .option('-s, --stage <stage>', 'deployment stage', 'test')
        .option('-u, --user-id <userId>', 'user ID for the request', '123') // Default hardcoded user ID
        .option('-r, --region <region>', 'AWS region', 'us-east-1')
        .option('--pika-service <name>', 'pika service project name', 'pika')
        .option('--agent-service <name>', 'agent service name', 'my-agent')
        .action(async (message, options) => {
            const { stage, userId, region, pikaService, agentService } = options;

            // Get parameters from SSM
            const converseFunctionUrl = await getParameterFromSSM(`/stack/${pikaService}/${stage}/function/converse_url`, region);
            const agentId = await getParameterFromSSM(`/stack/${agentService}/${stage}/agent_id`, region);
            const jwtSecret = await getParameterFromSSM(`/stack/${pikaService}/${stage}/jwt-secret`, region);

            // Create user object and JWT
            const user = {
                userId,
                customUserData: undefined
            };
            const jwtToken = createJWT(user, jwtSecret);

            // Create the request
            const request = {
                invocationMode: 'direct-agent-invoke',
                message,
                agentId,
                userId,
                features: {
                    verifyResponse: { enabled: true },
                    instructionAugmentation: { enabled: true },
                    tags: { tagsEnabled: [] }
                }
            };

            // Invoke the agent
            await invokeAgent(converseFunctionUrl, request, jwtToken, region);
        });

    program.parse();
}

main().catch(console.error);
```

## Working Sample

The Pika repository includes a complete working sample in `services/samples/weather-direct/`:

- **CDK Stack**: Agent-only deployment without chat app
- **CLI Tool**: Complete implementation with authentication
- **Usage Guide**: Step-by-step instructions

Deploy and test it:

```bash
cd services/samples/weather-direct

# Install dependencies (includes AWS signing libraries)
npm install

# Deploy the stack
npm run cdk:deploy

# Test the CLI tool (note: pnpm vs npm argument differences)
# With npm:
npm run cli -- "What's the weather in Tokyo?"

# With pnpm (note: uses default userId "123"):
pnpm run cli "What's the weather in Tokyo?" --verbose

# To specify a different user ID:
pnpm run cli "What's the weather in Tokyo?" --user-id "your-user-id" --verbose
```

## Best Practices

### Error handling

- Always check HTTP status codes
- Handle streaming connection drops gracefully
- Implement retry logic for transient failures

### Authentication

- **AWS Credentials**: Ensure your environment has valid AWS credentials for IAM signing
- **JWT Secret**: Always use `WithDecryption: true` when retrieving JWT secrets from SSM (they're stored as SecureString)
- **JWT Header**: Include the `Bearer ` prefix in the `x-chat-auth` header
- **User ID**: Must exist in Pika's chat-user table (use `"123"` for testing)
- Cache JWT tokens (they're valid for 1 hour)
- Use the `jsonwebtoken` library for proper JWT handling
- Rotate JWT secrets regularly
- Use secure storage for secrets in production

### Performance

- Reuse HTTP connections when possible
- Buffer streaming responses for better UX
- Set appropriate timeouts

### Monitoring

- Sessions are created for direct invocations
- Use admin tools to monitor usage and errors
- Check CloudWatch logs for debugging

:::tip[Start simple]
Begin with the working sample, then adapt it to your specific use case. The sample demonstrates all the essential patterns you'll need.
:::
