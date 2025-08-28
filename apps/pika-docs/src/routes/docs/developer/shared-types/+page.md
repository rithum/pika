# Pika Shared Types

The `pika-shared` library provides TypeScript types and utilities for building Pika-compatible applications.

## Installation

```bash
npm install -D pika-shared
```

## Core Types

### Agent Types

```js {:.no-twoslash}
import type {
  AgentDataRequest,
  ChatAgent,
  Tool,
  FunctionSchema
} from 'pika-shared/types/chatbot/chatbot-types';

// Define an agent
const agent: ChatAgent = {
  agentId: 'my-agent',
  basePrompt: 'You are a helpful assistant.',
  // ... other properties
};

// Define a tool
const tool: Tool = {
  toolId: 'my-tool',
  name: 'my-tool',
  displayName: 'My Tool',
  description: 'A helpful tool',
  executionType: 'lambda',
  lambdaArn: 'arn:aws:lambda:...',
  functionSchema: [...],
  supportedAgentFrameworks: ['bedrock']
};
```

### Chat App Types

```js {:.no-twoslash}
import type { ChatAppForIdempotentCreateOrUpdate, ChatAppFeatures } from 'pika-shared/types/chatbot/chatbot-types';

const chatApp: ChatAppForIdempotentCreateOrUpdate = {
    chatAppId: 'my-chat',
    title: 'My Assistant',
    description: 'A helpful chat assistant',
    agentId: 'my-agent',
    modesSupported: ['standalone', 'embedded'],
    userTypes: ['internal-user'],
    features: {
        suggestions: {
            featureId: 'suggestions',
            enabled: true,
            suggestions: ['Help me with...', 'Show me...'],
            randomize: true,
            maxToShow: 3
        }
    },
    enabled: true
};
```

### Bedrock Types

```js {:.no-twoslash}
import type { BedrockActionGroupLambdaEvent, BedrockActionGroupLambdaResponse } from 'pika-shared/types/chatbot/bedrock';

export const handler = async (event: BedrockActionGroupLambdaEvent): Promise<BedrockActionGroupLambdaResponse> => {
    // Your handler logic with full type safety
    return {
        response: {
            actionGroup: event.actionGroup,
            function: event.function,
            functionResponse: {
                responseBody: {
                    TEXT: {
                        body: 'Your response here'
                    }
                }
            }
        }
    };
};
```

### Utility Functions

```js {:.no-twoslash}
import { convertBedrockParamsToCorrectType, createBedrockLambdaResponse, handleBedrockError, normalizeSessionAttributes } from 'pika-shared/util/bedrock';

// Convert and validate Bedrock parameters
const params = convertBedrockParamsToCorrectType(event.parameters);

// Create properly formatted responses
const response = createBedrockLambdaResponse('Response text', event.actionGroup, event.messageVersion, event.function);

// Handle errors consistently
const errorResponse = handleBedrockError(error, event, sessionData);
```

## Server Utilities

```js {:.no-twoslash}
import { gzipAndBase64EncodeString, gunzipBase64EncodedString } from 'pika-shared/util/server-utils';

// Compress data for custom resources
const compressed = gzipAndBase64EncodeString(JSON.stringify(data));

// Decompress received data
const decompressed = JSON.parse(gunzipBase64EncodedString(compressed));
```

## Session Management

```js {:.no-twoslash}
import type { SessionData, SessionDataWithChatUserCustomDataSpreadIn } from 'pika-shared/types/chatbot/chatbot-types';

// Handle session data in your Lambda functions
export const handler = async (event: BedrockActionGroupLambdaEvent) => {
    const sessionData = normalizeSessionAttributes(event.sessionAttributes);

    // Your logic with typed session data
    if (sessionData?.userId) {
        // Handle authenticated users
    }
};
```

## Feature Types

Complete type definitions for all chat app features:

```js {:.no-twoslash}
import type { SuggestionsFeature, FileUploadFeature, PromptInputFieldLabelFeature, AgentInstructionAssistanceFeature } from 'pika-shared/types/chatbot/chatbot-types';

const features: ChatAppFeatures = {
    suggestions: {
        featureId: 'suggestions',
        enabled: true,
        suggestions: ['Example 1', 'Example 2'],
        randomize: true,
        maxToShow: 3
    },
    fileUpload: {
        featureId: 'fileUpload',
        enabled: true,
        mimeTypesAllowed: ['text/csv', 'application/json']
    }
    // ... other features
};
```

## Type Safety Benefits

Using `pika-shared` provides:

- **Compile-time validation** of your agent and chat app configurations
- **IntelliSense support** in your IDE
- **Consistent interfaces** across your application
- **Automatic refactoring** when types change
- **Documentation** through type definitions

## Common Patterns

### Lambda Handler Template

```js {:.no-twoslash}
import { Handler } from 'aws-lambda';
import type { BedrockActionGroupLambdaEvent, BedrockActionGroupLambdaResponse } from 'pika-shared/types/chatbot/bedrock';
import { createBedrockLambdaResponse, handleBedrockError, convertBedrockParamsToCorrectType } from 'pika-shared/util/bedrock';

export const handler: Handler = async (event: BedrockActionGroupLambdaEvent): Promise<BedrockActionGroupLambdaResponse> => {
    try {
        const params = convertBedrockParamsToCorrectType(event.parameters);

        // Your business logic here
        const result = await processRequest(event.function, params);

        return createBedrockLambdaResponse(result, event.actionGroup, event.messageVersion, event.function);
    } catch (error) {
        return handleBedrockError(error, event);
    }
};
```

## Need Help?

- **Source Code** - [View types on GitHub](https://github.com/your-org/pika/tree/main/packages/shared/)
- **Examples** - [See usage in examples](https://github.com/your-org/pika/tree/main/packages/pika-serverles/examples/)
- **Issues** - [Report issues or ask questions](https://github.com/your-org/pika/issues)
