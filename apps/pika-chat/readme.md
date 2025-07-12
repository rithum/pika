# Pika Chat Developer Guide

## Architecture Overview

- **Single Frontend/Backend**: One shared chatbot service handles all chat applications
- **Developer-Defined Components**: Use CDK to define `ChatApp`, `AgentDefinition`, and `Tools`
- **Access Pattern**: Users access chatbots at `/chat/<chat-app-id>` on the deployed frontend

## Core Components

### 1. Tools (Lambda Functions)

Each tool becomes a Bedrock action group that your agent can invoke.

```typescript
// One lambda per tool
const weatherLambda = new nodejs.NodejsFunction(this, 'WeatherToolLambda', {
    // ... lambda configuration
});

// Required tag for agent tools
cdk.Tags.of(weatherLambda).add('agent-tool', 'true');

// Allow bedrock agents to invoke
weatherLambda.addPermission('allowAgentInvokeFn', {
    action: 'lambda:invokeFunction',
    principal: new iam.ServicePrincipal('bedrock.amazonaws.com'),
});
```

**Required Lambda Permissions:**

- SSM Parameters: `ssm:GetParameter`, `ssm:GetParameters`
- S3 (if file uploads feature used): `s3:GetObject`, `s3:ListBucket`

### 2. Agent Definition

Defines the LLM agent that orchestrates your tools.

```typescript
const agentData: AgentDataRequest = {
    userId: `cloudformation/${this.stackName}`,
    agent: {
        agentId: `weather-agent-${this.stage}`,
        basePrompt: "Your agent's system prompt here...",
    },
    tools: [
        {
            toolId: `weather-tool-${this.stage}`,
            name: 'weather-tool',
            displayName: 'Weather Tool',
            description: 'Tool description for LLM (max 500 chars)',
            executionType: 'lambda',
            lambdaArn: 'WILL_BE_REPLACED_BY_CUSTOM_RESOURCE_LAMBDA_WHEN_DEPLOYED',
            functionSchema: weatherFunctions, // Bedrock function schema
            supportedAgentFrameworks: ['bedrock'],
        },
    ],
};
```

**Key Fields:**

- `agentId`: Unique identifier for your agent
- `basePrompt`: System prompt (supports handlebars templates like `{{user.email}}`)
- `toolIds`: Array of tool IDs this agent can use
- `functionSchema`: Required for Bedrock - defines tool parameters/responses

**Not Yet Implemented:** `accessRules`, `rolloutPolicy`, `runtimeAdapter`

### 3. Chat App

Defines the user-facing chat interface.

```typescript
const chatAppData: ChatAppDataRequest = {
    userId: `cloudformation/${this.stackName}`,
    chatApp: {
        chatAppId: 'weather', // Used in URL: /chat/weather
        mosupportedModes: ['standalone'], // 'standalone' | 'embedded'
        title: 'Weather Chat', // Display title
        agentId: `weather-agent-${this.stage}`,
        enabled: true,
        features: {
            // Configure available features here
        },
    },
};
```

## Chat App Features

All features are **disabled by default** except `promptInputFieldLabel`.

### File Upload

```typescript
fileUpload: {
  featureId: 'fileUpload',
  enabled: true,
  mimeTypesAllowed: ['text/csv', 'application/pdf'] // or ['*'] for all
}
```

**S3 Bucket Access Required:**

```typescript
const uploadBucketNameParam = ssm.StringParameter.fromStringParameterName(
    this,
    'UploadBucketNameParam',
    `/stack/chatbot/${this.stage}/s3/upload_bucket_name`
);
```

### Suggestions

```typescript
suggestions: {
  featureId: 'suggestions',
  enabled: true,
  suggestions: ['What is the weather like?', 'Show me tomorrow\'s forecast'],
  maxToShow: 5,           // Default: 5
  randomize: true,        // Default: false
  randomizeAfter: 0       // Default: 0
}
```

### Prompt Input Field Label

```typescript
promptInputFieldLabel: {
  featureId: 'promptInputFieldLabel',
  enabled: true,          // Default: true
  promptInputFieldLabel: 'Ready to chat',  // Default text
  hidePromptInputFieldLabel: false         // Default: false
}
```

### UI Customization

```typescript
uiCustomization: {
  featureId: 'uiCustomization',
  enabled: true,
  showChatHistoryInStandaloneMode: true,  // Default: true
  showUserRegionInLeftNav: true         // Default: true
}
```

## CDK Implementation

### Custom Resources

Use the deployed custom resource lambdas to create agents and chat apps.

**IMPORTANT**: Both `AgentData` and `ChatAppData` must be gzipped and base64 encoded before passing to custom resources.

```typescript
// Agent creation
const customResourceArn = ssm.StringParameter.valueForStringParameter(
    this,
    `/stack/chatbot/${this.stage}/lambda/agent_custom_resource_arn`
);

// REQUIRED: Compress and encode the agent data
const agentDataCompressed = gzipAndBase64EncodeString(JSON.stringify(agentData));

const customResource = new cdk.CustomResource(this, 'WeatherAgentCustomResource', {
    serviceToken: customResourceArn,
    properties: {
        Stage: this.stage,
        AgentData: agentDataCompressed, // Must be gzipped + base64 encoded
        ToolIdToLambdaArnMap: {
            [`weather-tool-${this.stage}`]: cdk.Lazy.string({
                produce: () => weatherLambda.functionArn,
            }),
        },
        Timestamp: String(Date.now()), // Forces updates
    },
});

// Chat app creation
const chatAppCustomResourceArn = ssm.StringParameter.valueForStringParameter(
    this,
    `/stack/chatbot/${this.stage}/lambda/chat_app_custom_resource_arn`
);

// REQUIRED: Compress and encode the chat app data
const chatAppDataCompressed = gzipAndBase64EncodeString(JSON.stringify(chatAppData));

const chatAppCustomResource = new cdk.CustomResource(this, 'WeatherChatAppCustomResource', {
    serviceToken: chatAppCustomResourceArn,
    properties: {
        Stage: this.stage,
        ChatAppData: chatAppDataCompressed, // Must be gzipped + base64 encoded
        Timestamp: String(Date.now()),
    },
});
```

### Dependencies

```typescript
customResource.node.addDependency(weatherLambda);
chatAppCustomResource.node.addDependency(customResource);
```

## Sample Implementation

See `services/weather/lib/stacks/weather-stack.ts` for a complete working example that demonstrates:

- Lambda tool creation with proper permissions
- Agent definition with weather tool
- Chat app with file upload and suggestions features
- Custom resource orchestration

## Limitations

### AWS Bedrock Constraints

When developing chatbots with AWS Bedrock, be aware of these platform limitations:

- **Function Descriptions**: Tool function descriptions are limited to **300 characters maximum**
- **Functions per Tool**: Each tool (action group) can contain **no more than 11 functions**
- **Function Parameters**: Each function can accept **no more than 5 parameters**
    - **Workaround**: Use the `jsonParams` pattern (see `weather-functions.ts`) - make the 5th parameter a JSON string containing additional optional parameters
- **Agent Instructions**: Agent base prompts are limited to **20,000 characters maximum** (see `weather-instructions.ts`)

These constraints are enforced by AWS Bedrock and will cause deployment failures if exceeded.

## Development Notes

- Set `dontCacheThis: true` on ChatApp during active development
- Use `test: true` for temporary agents/tools/apps (auto-deleted after 1 day)
- Compress large data with `gzipAndBase64EncodeString()` for custom resources
- Tool descriptions must be ≤500 characters for LLM consumption
- Chat app IDs become URL paths, so use appropriate characters (-, \_ allowed)
