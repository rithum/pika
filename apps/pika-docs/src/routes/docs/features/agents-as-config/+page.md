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

## Simple config example

```js
// TypeScript types are shown here but the fence is `js` due to an editor bug.
type ExecutionType = 'lambda';
type LifecycleStatus = 'active' | 'disabled' | 'retired';

interface FunctionSchemaProperty {
    type: 'number' | 'string' | 'boolean';
    description?: string;
}

interface FunctionSchema {
    name: string;
    parameters: {
        type: 'object';
        properties: Record<string, FunctionSchemaProperty>;
        required?: string[];
    };
}

interface ToolDefinition {
    toolId: string;
    displayName: string;
    description: string;
    executionType: ExecutionType;
    lambdaArn: string;
    functionSchema: FunctionSchema;
    tags?: Record<string, string>;
    lifecycle: { status: LifecycleStatus };
}

interface AccessRule {
    condition: string; // e.g., "user.userType === 'external-user'"
    effect: 'allow' | 'deny';
    order?: number;
}

interface AgentDefinition {
    agentId: string;
    basePrompt: string;
    tools: string[]; // toolIds
    accessRules?: AccessRule[];
    rolloutPolicy?: { betaAccounts?: string[]; regionRestrictions?: string[] };
    cacheStatus: 'enabled' | 'disabled';
}

type ChatAppMode = 'standalone' | 'embedded';

interface FeatureTraces {
    featureId: 'traces';
    enabled: boolean;
    userRoles?: string[]; // e.g., ['pika:content-admin']
    detailedTraces?: { enabled: boolean; userRoles?: string[] };
}

interface FeatureVerifyResponse {
    featureId: 'verifyResponse';
    enabled: boolean;
    autoRepromptThreshold?: 'A' | 'B' | 'C' | 'F';
}

interface ChatAppFeatures {
    traces?: FeatureTraces;
    verifyResponse?: FeatureVerifyResponse;
}

interface ChatAppDefinition {
    chatAppId: string;
    title: string;
    mode: ChatAppMode;
    agentId: string;
    userTypesAllowed?: Array<'internal-user' | 'external-user'>;
    features?: ChatAppFeatures;
}

// Chat app, agent, and tool definitions (seed file or CDK custom resource)
const tool: ToolDefinition = {
    toolId: 'weather-basic@1',
    displayName: 'Basic Weather',
    description: 'Returns current weather for a location',
    executionType: 'lambda',
    lambdaArn: 'arn:aws:lambda:us-west-2:123456789:function:agent-action-weather-basic',
    functionSchema: {
        name: 'weather-basic',
        parameters: {
            type: 'object',
            properties: { lat: { type: 'number' }, lon: { type: 'number' } },
            required: ['lat', 'lon']
        }
    },
    tags: { weather: 'Weather functions' },
    lifecycle: { status: 'active' }
};

const agent: AgentDefinition = {
    agentId: 'support-bot',
    basePrompt: 'You are a helpful assistant for ACME customers.',
    tools: ['weather-basic@1'],
    accessRules: [{ condition: "user.userType === 'external-user'", effect: 'allow' }],
    rolloutPolicy: { betaAccounts: ['acct-123'] },
    cacheStatus: 'enabled'
};

const chatApp: ChatAppDefinition = {
    chatAppId: 'customer-support',
    title: 'Customer Support',
    mode: 'embedded',
    agentId: 'support-bot',
    userTypesAllowed: ['external-user'],
    features: {
        traces: { featureId: 'traces', enabled: true, userRoles: ['pika:content-admin'] },
        verifyResponse: { featureId: 'verifyResponse', enabled: true, autoRepromptThreshold: 'C' }
    }
};

// During deploy, write these objects into the registry tables (e.g., via CDK CustomResource or a seed Lambda).
```

:::note[Why config?]
Separating definitions from code lets you review changes, roll out safely, and evolve agents without touching the UI.
:::
