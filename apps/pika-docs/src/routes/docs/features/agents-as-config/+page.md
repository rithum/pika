---
title: Agents as Config
description: Explains how agents and chat apps can be defined as config
outline: [2, 3]
---

Define chat apps, agents, and tools declaratively. Version them, review them, and roll them out with confidence.

## What you declare

- **Tools**: Display name, description, Lambda ARN, function schema, tags, lifecycle.
- **Agents**: Base prompt, tool list, access rules, rollout policy, cache status.
- **Chat apps**: Title, mode (standalone/embedded), target agent, and feature overrides.

## How it works

Define your agents in your CDK/CloudFormation stack. The configuration gets stored in Pika's registry database. Once deployed, your chat app is live and accessible through the Pika infrastructure for only the users you allowed (internal/external/specific users/specific companies/accounts, etc.).

This approach decouples your agent definitions from Pika's core infrastructure, letting you manage agents within your own microservices and deployment pipelines.

You can define agents for use in two ways:

- **Chat apps**: Rich user interfaces with session management and UI features
- **Direct invocation**: API-based access for headless workflows and system integrations

## Simple config example

```js
import type { FunctionDefinition } from '@aws-sdk/client-bedrock-agent-runtime';

// Example weather tool function schema (AWS Bedrock format)
const weatherFunctionSchema: FunctionDefinition[] = [{
    name: 'get_weather',
    description: 'Get current weather for a location',
    parameters: {
        type: 'object',
        properties: {
            lat: { type: 'number', description: 'Latitude coordinate' },
            lon: { type: 'number', description: 'Longitude coordinate' },
            location: { type: 'string', description: 'City name or address' }
        },
        required: ['lat', 'lon']
    }
}];

// Example 1: Agent with NEW tool definitions  (used in CDK custom resource)
const agentDataWithNewTools: AgentDataRequest = {
    userId: 'cloudformation/my-weather-stack',
    agent: {
        agentId: 'weather-agent-prod',
        basePrompt: 'You are a helpful weather assistant. Use the weather tool to get current conditions for any location the user asks about.'
    },
    tools: [{
        toolId: 'weather-tool-prod',
        displayName: 'Weather Tool',
        name: 'weather-tool',
        description: 'Provides current weather information for any location worldwide',
        executionType: 'lambda',
        lambdaArn: 'arn:aws:lambda:us-west-2:123456789:function:weather-tool',
        supportedAgentFrameworks: ['bedrock'],
        functionSchema: weatherFunctionSchema,
        tags: { category: 'weather', environment: 'production' },
        lifecycle: { status: 'enabled' }
    }]
};

// Example 2: Agent referencing EXISTING tools by ID  (used in CDK custom resource)
const agentDataWithExistingTools: AgentDataRequest = {
    userId: 'cloudformation/my-weather-stack',
    agent: {
        agentId: 'weather-agent-prod',
        basePrompt: 'You are a helpful weather assistant. Use the weather tool to get current conditions for any location the user asks about.',
        toolIds: ['weather-tool-prod', 'geocoding-tool-prod'] // Reference existing tools
    }
};

// Example 3: Agent with BOTH new tools and existing tool references
const agentDataMixed: AgentDataRequest = {
    userId: 'cloudformation/my-weather-stack',
    agent: {
        agentId: 'weather-agent-prod',
        basePrompt: 'You are a helpful weather assistant.',
        toolIds: ['existing-geocoding-tool-prod'] // Reference an existing tool
    },
    tools: [{
        // Define a NEW tool
        toolId: 'weather-tool-prod',
        displayName: 'Weather Tool',
        name: 'weather-tool',
        description: 'Provides current weather information',
        executionType: 'lambda',
        lambdaArn: 'arn:aws:lambda:us-west-2:123456789:function:weather-tool',
        supportedAgentFrameworks: ['bedrock'],
        functionSchema: weatherFunctionSchema
    }]
};

// Complete example: Chat app (used in CDK custom resource)
const chatAppData: ChatAppDataRequest = {
    userId: 'cloudformation/my-weather-stack',
    chatApp: {
        chatAppId: 'weather-chat',
        modesSupported: ['standalone', 'embedded'],
        dontCacheThis: false,
        title: 'Weather Assistant',
        description: 'Get current weather information for any location worldwide',
        agentId: 'weather-agent-prod',
        enabled: true,
        userTypes: ['internal-user', 'external-user'],
        features: {
            fileUpload: {
                featureId: 'fileUpload',
                enabled: true,
                mimeTypesAllowed: ['text/csv', 'application/json']
            },
            suggestions: {
                featureId: 'suggestions',
                enabled: true,
                suggestions: [
                    'What\'s the weather like in New York?',
                    'Tell me about today\'s weather in London',
                    'Is it raining in Tokyo right now?'
                ],
                randomize: true,
                maxToShow: 3
            },
            traces: {
                featureId: 'traces',
                enabled: true,
                userRoles: ['pika:content-admin'],
                detailedTraces: {
                    enabled: true,
                    userRoles: ['pika:content-admin']
                }
            },
            verifyResponse: {
                featureId: 'verifyResponse',
                enabled: true,
                userTypes: ['internal-user'],
                autoRepromptThreshold: 'C'
            }
        }
    }
};

type ExecutionType = 'lambda' | 'http' | 'inline';
type LifecycleStatus = 'enabled' | 'disabled' | 'retired';
type AgentFramework = 'bedrock';
type UserType = 'internal-user' | 'external-user';
type UserRole = 'pika:content-admin' | 'pika:site-admin';
type VerifyResponseClassification = 'A' | 'B' | 'C' | 'F';
type ChatAppMode = 'standalone' | 'embedded';

interface KnowledgeBase {
    knowledgeBaseId: string;
    description?: string;
}

interface ChatAppOverride {
    // Simplified for example - stores access control overrides
    userTypes?: UserType[];
    userRoles?: UserRole[];
}

interface AccessRules {
    enabled: boolean;
    userTypes?: UserType[];
    userRoles?: UserRole[];
}

interface ToolLifecycle {
    status: LifecycleStatus;
}

interface ToolDefinitionForIdempotentCreateOrUpdate {
    toolId: string;
    displayName: string;
    name: string; // Must not have spaces and no punctuation except _ and -
    description: string; // MUST BE LESS THAN 500 CHARACTERS
    executionType: ExecutionType;
    executionTimeout?: number; // default: 30
    lambdaArn: string;
    supportedAgentFrameworks: AgentFramework[];
    functionSchema: FunctionDefinition[];
    tags?: Record<string, string>;
    lifecycle?: ToolLifecycle;
    accessRules?: AccessRules[];
}

interface AgentDefinitionForIdempotentCreateOrUpdate {
    agentId: string;
    basePrompt: string;
    toolIds?: string[]; // Optional: Reference existing tools by ID
    accessRules?: AccessRules[];
    rolloutPolicy?: {
        betaAccounts?: string[];
        regionRestrictions?: string[]
    };
    dontCacheThis?: boolean;
    knowledgeBases?: KnowledgeBase[];
}

interface AgentDataRequest {
    userId: string; // Should be prefixed with 'cloudformation/' for CDK deployments
    agent: AgentDefinitionForIdempotentCreateOrUpdate;
    /**
     * Optional array to define NEW tools. Tool IDs are automatically added to the agent.
     * Can be combined with agent.toolIds to mix new tool definitions with existing tool references.
     */
    tools?: ToolDefinitionForIdempotentCreateOrUpdate[];
}

interface TracesFeatureForChatApp extends AccessRules {
    featureId: 'traces';
    detailedTraces?: AccessRules;
}

interface VerifyResponseFeatureForChatApp extends AccessRules {
    featureId: 'verifyResponse';
    autoRepromptThreshold?: Exclude<VerifyResponseClassification, 'A'>; // Cannot be 'A'
}

interface FileUploadFeatureForChatApp {
    featureId: 'fileUpload';
    enabled: boolean;
    mimeTypesAllowed: string[];
}

interface SuggestionsFeatureForChatApp {
    featureId: 'suggestions';
    enabled: boolean;
    suggestions: string[];
    randomize?: boolean;
    randomizeAfter?: number;
    maxToShow?: number;
}

interface PromptInputFieldLabelFeatureForChatApp {
    featureId: 'promptInputFieldLabel';
    enabled: boolean;
    promptInputFieldLabel?: string;
}

type ChatAppFeature =
    | TracesFeatureForChatApp
    | VerifyResponseFeatureForChatApp
    | FileUploadFeatureForChatApp
    | SuggestionsFeatureForChatApp
    | PromptInputFieldLabelFeatureForChatApp;

interface ChatAppForIdempotentCreateOrUpdate extends AccessRules {
    chatAppId: string;
    modesSupported?: ChatAppMode[];
    dontCacheThis?: boolean;
    title: string;
    description: string; // Must be less than 300 characters
    agentId: string;
    override?: ChatAppOverride;
    features?: Partial<Record<string, ChatAppFeature>>;
}

interface ChatAppDataRequest {
    userId: string; // Should be prefixed with 'cloudformation/' for CDK deployments
    chatApp: ChatAppForIdempotentCreateOrUpdate;
}

// During deploy, these objects are processed by CDK custom resources or seed Lambdas
```

## Tool Definition Patterns

You can define agents with tools in three ways:

### Pattern 1: Define New Tools

Use the `tools` array to create and associate new tools with your agent. The system automatically adds these tool IDs to the agent.

```js
const agentData: AgentDataRequest = {
    userId: 'cloudformation/my-stack',
    agent: {
        agentId: 'my-agent',
        basePrompt: '...'
        // No toolIds needed - automatically populated from tools array
    },
    tools: [{
        toolId: 'my-new-tool',
        name: 'my-tool',
        // ... tool definition
    }]
};
```

**Use when**: Creating a new tool that doesn't exist yet, or updating an existing tool's definition.

### Pattern 2: Reference Existing Tools

Use `agent.toolIds` to reference tools that are already defined in the system (by other agents or previous deployments).

```js
const agentData: AgentDataRequest = {
    userId: 'cloudformation/my-stack',
    agent: {
        agentId: 'my-agent',
        basePrompt: '...',
        toolIds: ['existing-tool-1', 'existing-tool-2']
    }
    // No tools array - just referencing existing tools
};
```

**Use when**: Reusing tools defined elsewhere, sharing tools across multiple agents, or using shared utility tools.

### Pattern 3: Mixed Approach

Combine both patterns to define some new tools while referencing others. The system merges the tool IDs automatically.

```js
const agentData: AgentDataRequest = {
    userId: 'cloudformation/my-stack',
    agent: {
        agentId: 'my-agent',
        basePrompt: '...',
        toolIds: ['shared-geocoding-tool', 'shared-time-tool'] // Existing tools
    },
    tools: [{
        // Define new tool specific to this agent
        toolId: 'specialized-weather-tool',
        name: 'specialized-weather',
        // ... tool definition
    }]
};
// Agent will have access to all three tools
```

**Use when**: An agent needs both shared common tools and specialized tools unique to its purpose.

:::tip[Key Benefits of Config-Based Approach]
Separating definitions from code enables:

- **Review & Version Control**: Track changes like any other code
- **Safe Rollouts**: Test configurations before production deployment
- **Agent Evolution**: Modify behavior without UI changes
- **Infrastructure as Code**: Deploy agents with CDK/CloudFormation
- **Tool Reuse**: Share tools across multiple agents to avoid duplication
  :::

:::important[Required Structure]
Note the wrapper objects `AgentDataRequest` and `ChatAppDataRequest` - these are required when using CDK custom resources or API calls. The `userId` field should be prefixed with `cloudformation/` for CDK deployments.

When using the mixed approach (both `tools` and `agent.toolIds`), the system automatically combines all tool IDs, so the agent has access to both newly defined and referenced tools.
:::
