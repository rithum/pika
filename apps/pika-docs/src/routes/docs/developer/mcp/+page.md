# Model Context Protocol (MCP) - Developer Guide

This guide covers how to configure, implement, and use MCP (Model Context Protocol) tools in the Pika platform.

Today, Pika supports MCP Phase I (MCP tool use) with MCP Phase II underway now (publish MCP servers).

**Transport Support**: Currently, Pika supports MCP tools via StreamableHTTP transport only.

## Overview

MCP Phase I enables Pika agents to register and execute tools that connect to external MCP servers. This allows agents to access real-time data, integrate with APIs, and leverage external services without deploying custom Lambda functions.

## MCP Tool Configuration

### Basic MCP Tool Definition

```js
{
  "toolId": "weather-service",
  "name": "weather-lookup",
  "displayName": "Weather Service",
  "description": "Get current weather conditions and forecasts",
  "executionType": "mcp",
  "url": "https://weather-mcp-server.example.com",
  "functionSchema": [
    {
      "name": "get_current_weather",
      "description": "Get current weather for a location",
      "parameters": {
        "location": {
          "type": "string",
          "description": "City name or coordinates",
          "required": true
        }
      }
    }
  ]
}
```

### MCP Tool with Authentication

For secured MCP servers, you can configure OAuth 2.0 client credentials authentication:

```js
{
  "toolId": "customer-database",
  "name": "customer-lookup",
  "displayName": "Customer Database",
  "description": "Access customer records and account information",
  "executionType": "mcp",
  "url": "https://customer-db-mcp.internal.com",
  "auth": {
    "clientId": "${MCP_CUSTOMER_CLIENT_ID}",
    "clientSecret": "${MCP_CUSTOMER_CLIENT_SECRET}",
    "tokenUrl": "https://auth.internal.com/oauth/token"
  },
  "functionSchema": [
    {
      "name": "get_customer",
      "description": "Get customer details by ID or email",
      "parameters": {
        "identifier": {
          "type": "string",
          "description": "Customer ID or email address",
          "required": true
        }
      }
    }
  ]
}
```

## Creating MCP Tools

<Tabs activeName="Create Tool">
  <TabPanel name="Create Tool">

```js
const toolData = {
    name: 'database-lookup',
    displayName: 'Database Lookup Service',
    description: 'Query production database for real-time data',
    executionType: 'mcp',
    url: 'https://db-mcp-server.internal.com',
    auth: {
        clientId: process.env.DB_MCP_CLIENT_ID,
        clientSecret: process.env.DB_MCP_CLIENT_SECRET,
        tokenUrl: 'https://auth.internal.com/oauth/token'
    },
    functionSchema: [
        {
            name: 'query_customers',
            description: 'Query customer records',
            parameters: {
                query: {
                    type: 'string',
                    description: 'SQL-like query string',
                    required: true
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results',
                    required: false
                }
            }
        }
    ]
};

const response = await fetch('/api/admin/tools', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(toolData)
});
```

  </TabPanel>
  <TabPanel name="Update Tool">

```js
const updateData = {
    toolId: 'database-lookup',
    url: 'https://new-db-mcp-server.internal.com',
    functionSchema: [
        {
            name: 'query_customers',
            description: 'Query customer records with enhanced filtering',
            parameters: {
                query: {
                    type: 'string',
                    description: 'Enhanced SQL-like query with JOIN support',
                    required: true
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results (default: 100)',
                    required: false
                },
                include_deleted: {
                    type: 'boolean',
                    description: 'Include soft-deleted records',
                    required: false
                }
            }
        }
    ]
};

const response = await fetch('/api/admin/tools/database-lookup', {
    method: 'PATCH',
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(updateData)
});
```

  </TabPanel>
</Tabs>

## Authentication Configuration

### OAuth 2.0 Client Credentials

The most common authentication method for MCP servers is OAuth 2.0 client credentials flow:

```js
{
  "auth": {
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "tokenUrl": "https://auth-server.com/oauth/token"
  }
}
```

**Environment Variables**
Store credentials securely using environment variables:

```bash
# Set environment variables
export MCP_CLIENT_ID="your-client-id"
export MCP_CLIENT_SECRET="your-client-secret"
```

```js
{
  "auth": {
    "clientId": "${MCP_CLIENT_ID}",
    "clientSecret": "${MCP_CLIENT_SECRET}",
    "tokenUrl": "https://auth-server.com/oauth/token"
  }
}
```

## Tool Schema Definition

### Function Schema Structure

Define the available functions for your MCP tool:

```js
{
  "functionSchema": [
    {
      "name": "function_name",
      "description": "Clear description of what the function does",
      "parameters": {
        "param1": {
          "type": "string|number|boolean|object|array",
          "description": "Parameter description",
          "required": true|false
        },
        "param2": {
          "type": "object",
          "description": "Complex object parameter",
          "required": false,
          "properties": {
            "nested_field": {
              "type": "string",
              "description": "Nested field description"
            }
          }
        }
      }
    }
  ]
}
```

### Parameter Types

Supported parameter types and their handling:

- **string**: Text values, JSON strings are auto-parsed if detected
- **number**: Floating-point numbers
- **integer**: Whole numbers
- **boolean**: true/false values
- **object**: JSON objects, auto-parsed from strings
- **array**: JSON arrays, auto-parsed from strings
- **date**: ISO date strings, converted to Date objects

## Agent Integration

### Associating MCP Tools with Agents

```js
const agentData = {
    agentId: 'customer-support-agent',
    basePrompt: 'You are a customer support agent with access to real-time customer data.',
    toolIds: [
        'customer-database', // MCP tool
        'weather-service', // MCP tool
        'email-sender' // Lambda tool (mixed usage)
    ]
};
```

## Local Development

### OAuth Token Caching

When developing with OAuth-enabled MCP tools, Pika automatically caches tokens locally:

- Tokens are stored in `./oauth-tokens/` directory (gitignored)
- In Lambda environments, tokens are cached in `/tmp/oauth-tokens/`
- Tokens are automatically refreshed when expired
- Cache files are hashed based on client credentials and token URL

**Response Streaming**
Leverage streaming responses for large datasets or real-time data via StreamableHTTP transport.

## Using MCP Tools Alongside Lambda Tools

### Mixed Tool Environments

You can use both Lambda and MCP tools within the same agent - there's no need to migrate existing Lambda tools:

```js
{
  "toolIds": [
    "existing-lambda-tool",  // Keep existing Lambda tools
    "new-mcp-service",      // Add new MCP capabilities
    "another-mcp-tool"      // Expand with more MCP tools
  ]
}
```

### When to Choose MCP vs Lambda

**Choose MCP tools when**:

- Connecting to existing external services with MCP servers
- Need real-time data from third-party APIs
- Want to leverage community MCP server implementations
- Rapid prototyping without Lambda deployment

**Keep Lambda tools when**:

- Custom business logic specific to your application
- Need maximum performance and control
- Existing tools work well and don't need changes
- Complex processing that benefits from Lambda's compute environment

---

Need help with MCP implementation? Check our [Troubleshooting Guide](/docs/developer/troubleshooting/) or reach out to the community.
