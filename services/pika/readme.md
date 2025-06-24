# Pika Chatbot Service

This service provides a chatbot API that integrates with AWS Bedrock for AI interactions.

## Prerequisites

You must have an ssm param named `/stack/${chat-service-proj-name-kebab-case}/${stage}/jwt-secret` whose values comes by
running `pnpm run jwt-secret`. Use the generated 64 bit string as the value. Be sure
to mark the ssm param's type as SecretString.

## Features

- Chat session management
- Message history storage
- Integration with AWS Bedrock for AI responses
- RESTful API for chat interactions

## Architecture

The service uses the following AWS resources:

- AWS Lambda for serverless compute
- Amazon API Gateway for HTTP endpoints
- Amazon DynamoDB for data storage
- AWS Bedrock for AI interactions

## Development

### Prerequisites

- Node.js (20.x recommended)
- pnpm package manager
- AWS CDK CLI (for deployment)
- AWS CLI configured with appropriate credentials

### Local Development

```bash
# Install dependencies
pnpm install

# Start local development (watches for changes)
pnpm watch

# Build the project
pnpm build

# Run linting
pnpm lint
```

## Deployment

```bash
# Ensure you're authenticated with AWS
aws sts get-caller-identity

# Build the project
pnpm build

# Synthesize CloudFormation template
pnpm cdk:synth

# Check what changes will be made
pnpm cdk:diff

# Deploy the stack
pnpm cdk:deploy
```

You can specify the deployment stage using context:

```bash
pnpm cdk:deploy --context stage=prod
```

Available stages:

- `dev` (default)
- `staging`
- `prod`

## API Endpoints

| Method | Endpoint                 | Description                       |
| ------ | ------------------------ | --------------------------------- |
| POST   | /chats                   | Create a new chat session         |
| GET    | /chats                   | List all chat sessions for a user |
| GET    | /chats/{chatId}          | Get a specific chat session       |
| POST   | /chats/{chatId}/messages | Send a message to a chat          |
| GET    | /chats/{chatId}/messages | List messages in a chat           |

## Example Requests

### Create a new chat

```bash
curl -X POST https://your-api-endpoint/dev/chats \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "title": "My Chat"}'
```

### Send a message

```bash
curl -X POST https://your-api-endpoint/dev/chats/{chatId}/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello, assistant!"}'
```

### Making an agent action group

When you make an agent action group, there are two ways to do it. You can do it with openapi or you can do it with params.

```ts


export interface BedrockActionGroupFunctions: {
    functions: BedrockActionGroupFunctionSchema[];
}

/**
   Note: each description below should be just detailed enough to achieve the desired goal of the description attribute.

   Even though parameters isn't required, always set to `{}` if no parameters needed for the function.

   Explicitly include requireConfirmation even though not required and set to false
*/
export interface BedrockActionGroupFunctionSchema {
    // A name for the function, use snake case.  Here's the regex pattern allowed: ^([0-9a-zA-Z][_-]?){1,100}$
    name: string;

    // Describe the purpose of the function such that an LLM will know when to use this function.
    // Details necessary to call the function.  Details about the result returned from the function.
    // If the function returns multi-page data, explain how to page through the data.  If there are
    // combinations of dependent parameters for different purposes, explain them.
    // Max 1200 characters in length.
    description: string;

    // Function parameters.  The string key is the name of the parameter which must conform to ^([0-9a-zA-Z][_-]?){1,100}$
    parameters?: Record<string, BedrockActionGroupFunctionSchemaParameterDetail>;

    // Contains information if user confirmation is required to invoke the function.
    requireConfirmation?: 'ENABLED' | 'DISABLED';
}

export interface BedrockActionGroupFunctionSchemaParameterDetail {
    // Whether the parameter is required or not.  Even though not required, you should always include this to be explicit.
    required?: boolean;

    // The type of the parameter.
    type: 'string' | 'integer' | 'array' | 'number' | 'boolean';

    // A description of the parameter. Helps the foundation model determine how to elicit the parameters from the user.
    // Maximum length of 500 characters.
    description?: string;
}
```
