# 🧠 Dynamic Agent Definition Framework

## 📝 Purpose

A canonical, enterprise-wide registry of dynamic Agent Definitions, enabling runtime construction of LLM agents with configurable prompts and tools. This registry abstracts agent behavior from vendor-specific implementations (e.g., Amazon Bedrock, LangGraph), allowing centralized governance, dynamic composition, and easy experimentation.

**Current Agent Framework**: Amazon Bedrock inline agents serve as our primary agent execution framework.

---

## 🏗️ Conceptual Model

### 🔎 Responsibility Separation

**AgentDefinition**:

* Unique identity and name
* Base system prompt (template or static)
* Direct references to tools via many-to-many relationship
* Filtering policy and access constraints
* Runtime prompt adapter (optional, future)
* Cache configuration for performance optimization

**ToolDefinition**:

* Tool metadata and invocation config (lambda ARN, etc.)
* Input/output schemas with multiple format support
* Bedrock-specific function schema (auto-generated or provided)
* Execution type (e.g., `lambda`) with timeout configuration
* Versioning and lifecycle management
* Tags for filtering and LLM compatibility
* Feature flags and access policy (account/scoped)

**RuntimePolicy**:

* Expression-based access control with simple condition language
* Static or dynamic filtering capabilities
* Priority-based rule evaluation

> This separation ensures future extensibility, clarity in responsibilities, and reduces coupling between concerns.

---

## 📁 Data Models (DynamoDB)

### AgentDefinitions Table

| Field          | Type    | Description                                                      |
| -------------- | ------- | ---------------------------------------------------------------- |
| agentId        | PK (S)  | Unique agent identifier (e.g., `weather-bot`)                    |
| basePrompt     | S       | System prompt template (can include placeholders)                |
| accessRules    | L       | List of access control rules with conditions                     |
| runtimeAdapter | S       | (Future) Optional Lambda for augmenting prompt/session context   |
| rolloutPolicy  | M       | Rollout gating per account/org/region                            |
| cacheStatus    | S       | `enabled` \| `disabled` for testing and debugging                |
| version        | N       | Agent definition version                                         |
| createdBy      | S       | User who created the definition                                  |
| lastModifiedBy | S       | Last editor user                                                 |
| createdAt      | S (ISO) | Timestamp                                                        |
| updatedAt      | S (ISO) | Timestamp                                                        |

**GSIs:**
- **GSI1**: `createdBy-createdAt-index` - Find agents by creator with time ordering
- **GSI2**: `cacheStatus-agentId-index` - Query agents by cache status for debugging

#### accessRules Example

```json
[
  {
    "condition": "user.scope IN ['admin', 'user'] AND account.type = 'retailer'",
    "effect": "allow",
    "order": 100
  },
  {
    "effect": "deny",
    "order": 200,
    "description": "Default deny rule"
  }
]
```

**Available Objects in Expressions:**
- `user`: User object with properties like `scope`, `email`, `userId`
- `account`: Account object with properties like `type`, `organizationId`, `accountId`
- `context`: Optional runtime context passed to the agent invocation

#### rolloutPolicy Example

```json
{
  "betaAccounts": ["acct-123"],
  "regionRestrictions": ["us-west-2"],
  "toolOverrides": {
    "weather-basic": "weather-advanced"
  }
}
```

### ToolDefinitions Table

| Field             | Type   | Description                                        |
| ----------------- | ------ | -------------------------------------------------- |
| toolId            | PK (S) | Unique tool name/version (e.g., `weather-basic@1`) |
| displayName       | S      | Friendly name                                      |
| description       | S      | For LLM consumption                                |
| executionType     | S      | `lambda` (future: `http`, `inline`)                |
| executionTimeout  | N      | Timeout in seconds (default: 30)                  |
| lambdaArn         | S      | ARN of the Lambda (must have tag `agent-tool`)    |
| inputSchema       | M      | JSON Schema defining inputs                        |
| outputSchema      | M      | JSON Schema defining outputs                       |
| functionSchema    | M      | Bedrock-specific function schema (auto-generated or provided) |
| tsInputType       | S      | Optional TypeScript input definition               |
| tsOutputType      | S      | Optional TypeScript output definition              |
| tags              | M      | Tag map with optional descriptions                 |
| lifecycle         | M      | Lifecycle management (status, deprecation, migration) |
| version           | N      | Tool version                                       |
| accessRules       | L      | List of access control rules                       |
| createdBy         | S      | Creator                                            |
| lastModifiedBy    | S      | Editor                                             |
| createdAt         | S      | Timestamp                                          |
| updatedAt         | S      | Timestamp                                          |

**GSIs:**
- **GSI1**: `executionType-version-index` - Find latest tools by execution type
- **GSI2**: `lifecycle.status-toolId-index` - Query tools by lifecycle status
- **GSI3**: `createdBy-createdAt-index` - Find tools by creator with time ordering

**Schema Provision Options:**
1. **TypeScript → JSON Schema → Function Schema**: Provide `tsInputType`/`tsOutputType`, we generate `inputSchema`/`outputSchema` and `functionSchema`
2. **JSON Schema → Function Schema**: Provide `inputSchema`/`outputSchema`, we generate `functionSchema`
3. **Direct Function Schema**: Provide `functionSchema` directly

#### Tool Tag Example

```json
{
  "weather": "Weather functions",
  "beta": "Beta-only for early users"
}
```

#### lifecycle Example

```json
{
  "status": "active",
  "deprecationDate": "2025-12-01T00:00:00Z",
  "migrationPath": "weather-basic@2"
}
```

**Lifecycle Status Values:**
- `active`: Tool is available for use
- `disabled`: Tool is temporarily unavailable
- `retired`: Tool is permanently decommissioned

### ToolSets Table

| Field          | Type   | Description                                        |
| -------------- | ------ | -------------------------------------------------- |
| toolSetId      | PK (S) | Unique toolset identifier (e.g., `weather-set-v1`) |
| displayName    | S      | Friendly name for the toolset                     |
| description    | S      | Purpose and contents of this toolset              |
| tools          | L      | Denormalized list of tool objects                 |
| accessRules    | L      | Access control rules for the entire set           |
| version        | N      | Toolset version                                    |
| createdBy      | S      | Creator                                            |
| lastModifiedBy | S      | Editor                                             |
| createdAt      | S      | Timestamp                                          |
| updatedAt      | S      | Timestamp                                          |

**GSIs:**
- **GSI1**: `createdBy-createdAt-index` - Find toolsets by creator

#### ToolSet Example

```json
{
  "toolSetId": "weather-set-v1",
  "displayName": "Weather Toolkit",
  "description": "Complete set of weather-related tools",
  "tools": [
    {
      "toolId": "weather-basic@1",
      "displayName": "Basic Weather",
      "description": "Returns current weather for a location",
      "executionType": "lambda",
      "lambdaArn": "arn:aws:lambda:us-west-2:123456789:function:agent-action-weather-basic",
      "functionSchema": { /* Bedrock function schema */ },
      "tags": {"weather": "Weather functions"}
    }
  ],
  "accessRules": [
    {
      "condition": "user.scope IN ['user', 'admin']",
      "effect": "allow"
    }
  ]
}
```

### AgentTools Table (Many-to-Many)

| Field     | Type   | Description                           |
| --------- | ------ | ------------------------------------- |
| agentId   | PK (S) | Agent identifier                      |
| toolId    | SK (S) | Tool identifier                       |
| addedBy   | S      | User who added this tool to the agent |
| addedAt   | S      | Timestamp when tool was added         |

**GSIs:**
- **GSI1**: `toolId-agentId-index` - Find agents using a specific tool

---

## 🌐 Prompt Construction Strategy

**Template Engine**: Handlebars

**Available Template Variables:**
- `user`: Current user object (scope, email, userId, etc.)
- `account`: Account object (type, organizationId, accountId, etc.) 
- `context`: Optional runtime context passed to agent invocation

For now:
* Support `basePrompt` as either a full prompt or a template with placeholders.
* Placeholders can be replaced using runtime values (e.g., user name, org, timestamp).
* TODO: Add templating engine support, runtime augmentation lambdas in future versions.

---

## 🏡 Security and IAM Strategy

* All tools of type `lambda` must point to a Lambda with a `agent-tool` tag.
* This tag is used by Bedrock inline agents to allow safe invocation.
* Tool ARNs are declared explicitly and managed via DynamoDB entry.
* No intermediary executor Lambda is required.

---

## 🚀 Performance and Caching Strategy

**Lambda Context Caching**: Where possible, implement LRU caches within Lambda execution contexts for frequently accessed data such as:
- Agent tool lookups
- Tool definition retrievals
- Access rule evaluations

**Agent-Level Caching**: Each agent definition includes a `cacheStatus` field to enable/disable caching for testing and debugging purposes.

---

## 📆 Auditing and Change History

Each definition includes metadata for `createdBy`, `lastModifiedBy`, `createdAt`, `updatedAt`.

A DynamoDB Stream will trigger a Lambda that:

* Stores previous versions in an `AgentChangeHistory` table.
* Captures diffs, editor identity, and timestamps for traceability.

---

## 🔹 Examples

### Simple Tool

```json
{
  "toolId": "weather-basic@1",
  "displayName": "Basic Weather",
  "description": "Returns current weather for a location",
  "executionType": "lambda",
  "executionTimeout": 30,
  "lambdaArn": "arn:aws:lambda:us-west-2:123456789:function:agent-action-weather-basic",
  "inputSchema": {
    "type": "object",
    "properties": {
      "lat": {"type": "number"},
      "lon": {"type": "number"}
    },
    "required": ["lat", "lon"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "tempF": {"type": "number"},
      "description": {"type": "string"}
    }
  },
  "functionSchema": {
    "name": "weather-basic",
    "description": "Returns current weather for a location",
    "parameters": {
      "type": "object",
      "properties": {
        "lat": {"type": "number", "description": "Latitude"},
        "lon": {"type": "number", "description": "Longitude"}
      },
      "required": ["lat", "lon"]
    }
  },
  "tags": {
    "weather": "Weather functions"
  },
  "lifecycle": {
    "status": "active"
  },
  "accessRules": [
    {
      "condition": "user.scope IN ['user', 'admin']",
      "effect": "allow"
    }
  ]
}
```

### Agent Definition

```json
{
  "agentId": "weather-bot",
  "basePrompt": "You are a helpful assistant for weather information. User: {{user.email}}, Account: {{account.type}}",
  "accessRules": [
    {
      "condition": "user.scope IN ['user'] AND account.type = 'retailer'",
      "effect": "allow",
      "order": 100
    }
  ],
  "runtimeAdapter": null,
  "rolloutPolicy": {
    "betaAccounts": ["acct-123"]
  },
  "cacheStatus": "enabled",
  "version": 1,
  "createdBy": "alice@corp.com",
  "createdAt": "2025-05-27T10:00:00Z"
}
```