# MCP Tools - Developer Guide

This guide shows you how to add MCP (Model Context Protocol) tools to your Pika agents, set up local development environments, and deploy MCP-enabled agents to production.

## Prerequisites

Before you begin, ensure you have:

- Pika Framework 2.0 or later
- Node.js 22+ with pnpm
- Basic understanding of [Pika agent configuration](./agent-configuration/)

## Quick Start

### 1. Enable MCP in Your Agent

Add MCP tools to your agent definition in your chat app stack:

```js
// In your chat app stack (e.g., services/custom/my-app/chatApps.ts)
import { ChatApp, AgentDefinition, McpToolDefinition } from 'pika-shared/types/chatbot/chatbot-types';

const myMcpTools: McpToolDefinition[] = [
    {
        toolId: 'filesystem-tool',
        name: 'filesystem',
        description: 'Access and manipulate local filesystem',
        executionType: 'mcp',
        mcpServerConfig: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
            env: {
                // Optional environment variables for the MCP server
            }
        }
    },
    {
        toolId: 'github-tool',
        name: 'github',
        description: 'Interact with GitHub repositories',
        executionType: 'mcp',
        mcpServerConfig: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: {
                GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN
            }
        }
    }
];

const myAgent: AgentDefinition = {
    agentId: 'my-mcp-agent',
    basePrompt: 'You are a helpful assistant with access to filesystem and GitHub tools.',
    foundationModel: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    toolIds: ['filesystem-tool', 'github-tool'] // Reference the MCP tools
    // ... other agent configuration
};

export const myChatApp: ChatApp = {
    chatAppId: 'my-mcp-app',
    title: 'MCP Demo App',
    agents: [myAgent],
    tools: myMcpTools // Include MCP tools here
    // ... other chat app configuration
};
```

### 2. Test Locally

Start your local development server:

```bash
cd my-chat-app
pnpm dev
```

Your MCP tools will automatically start when the agent session begins and stop when it ends.

## MCP Tool Configuration

### Tool Definition Structure

```js
interface McpToolDefinition {
    toolId: string; // Unique identifier for the tool
    name: string; // Display name
    description: string; // What the tool does
    executionType: 'mcp'; // Must be 'mcp' for MCP tools
    mcpServerConfig: {
        command: string; // Command to start MCP server
        args: string[]; // Arguments for the command
        env?: Record<string, string>; // Environment variables
        cwd?: string; // Working directory (optional)
    };
}
```

### Popular MCP Servers

Here are some commonly used MCP servers you can integrate:

#### **Filesystem Access**

```js
{
    toolId: 'filesystem',
    name: 'filesystem',
    description: 'Read and write files on the local filesystem',
    executionType: 'mcp',
    mcpServerConfig: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/documents'],
    }
}
```

#### **GitHub Integration**

```js
{
    toolId: 'github',
    name: 'github',
    description: 'Interact with GitHub repositories and issues',
    executionType: 'mcp',
    mcpServerConfig: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN
        }
    }
}
```

#### **Database Access**

```js
{
    toolId: 'postgres',
    name: 'postgres',
    description: 'Query and modify PostgreSQL databases',
    executionType: 'mcp',
    mcpServerConfig: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        env: {
            POSTGRES_CONNECTION_STRING: process.env.DATABASE_URL
        }
    }
}
```

## Local Development Setup

### Environment Variables

Create a `.env.local` file in your project root for development:

```bash
# .env.local
GITHUB_TOKEN=your_github_personal_access_token
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
NOTION_API_KEY=your_notion_api_key
```

### Local MCP Server Testing

You can test MCP servers independently before integrating them:

```bash
# Test filesystem server
npx -y @modelcontextprotocol/server-filesystem /tmp

# Test GitHub server (in another terminal)
GITHUB_PERSONAL_ACCESS_TOKEN=your_token npx -y @modelcontextprotocol/server-github
```

### Debug Mode

Enable verbose logging to debug MCP interactions:

```js
// In your local development configuration
process.env.PIKA_MCP_DEBUG = 'true';
```

This will show detailed logs of MCP server startup, tool discoveries, and execution traces.

## Mixing Lambda and MCP Tools

You can use both Lambda and MCP tools in the same agent:

```js
const mixedTools = [
    // Lambda tool
    {
        toolId: 'weather-lambda',
        name: 'weather',
        description: 'Get weather information',
        executionType: 'lambda',
        lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:weather-tool',
        functionSchema: [
            /* ... */
        ]
    },
    // MCP tool
    {
        toolId: 'filesystem-mcp',
        name: 'filesystem',
        description: 'Access local files',
        executionType: 'mcp',
        mcpServerConfig: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
        }
    }
];

const myAgent: AgentDefinition = {
    agentId: 'mixed-tools-agent',
    basePrompt: 'You can check weather and access local files.',
    toolIds: ['weather-lambda', 'filesystem-mcp'] // Use both tool types
    // ... other configuration
};
```

## Production Deployment

### Security Considerations

**Environment Variables**: Store sensitive credentials in AWS Systems Manager Parameter Store or AWS Secrets Manager:

```js
// Use AWS SDK to retrieve secrets in production
const mcpServerConfig = {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: await getSecret('github-token')
    }
};
```

**MCP Server Isolation**: Consider running MCP servers in isolated containers or separate processes for security.

**Audit MCP Servers**: Only use MCP servers from trusted sources in production environments.

### Performance Optimization

**Connection Pooling**: MCP servers are started per agent session and reused across tool invocations within that session.

**Resource Limits**: Configure appropriate timeouts and resource limits:

```js
// Custom MCP server with timeout configuration
{
    toolId: 'slow-service',
    name: 'slow-service',
    description: 'Service that may take time to respond',
    executionType: 'mcp',
    mcpServerConfig: {
        command: 'node',
        args: ['my-custom-mcp-server.js'],
        timeout: 30000, // 30 second timeout
    }
}
```

## Building Custom MCP Servers

### Basic MCP Server Structure

Create a custom MCP server for your specific needs:

```js
// my-custom-mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
    {
        name: 'my-custom-server',
        version: '0.1.0'
    },
    {
        capabilities: {
            tools: {}
        }
    }
);

// Define your custom tools
server.setRequestHandler('tools/list', async () => {
    return {
        tools: [
            {
                name: 'my_custom_tool',
                description: 'Does something custom',
                inputSchema: {
                    type: 'object',
                    properties: {
                        input: {
                            type: 'string',
                            description: 'The input parameter'
                        }
                    },
                    required: ['input']
                }
            }
        ]
    };
});

server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'my_custom_tool') {
        // Implement your custom logic here
        return {
            content: [
                {
                    type: 'text',
                    text: `Custom tool executed with input: ${args.input}`
                }
            ]
        };
    }

    throw new Error(`Unknown tool: ${name}`);
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Integrating Custom MCP Server

```js
{
    toolId: 'my-custom-tool',
    name: 'custom-business-logic',
    description: 'Custom business logic for our application',
    executionType: 'mcp',
    mcpServerConfig: {
        command: 'node',
        args: ['./custom-servers/my-custom-mcp-server.js'],
        cwd: process.cwd(),
        env: {
            API_KEY: process.env.CUSTOM_API_KEY
        }
    }
}
```

## Debugging and Troubleshooting

### Common Issues

**MCP Server Won't Start**:

- Check that the command and arguments are correct
- Verify environment variables are set
- Ensure the MCP server package is installed

**Tool Not Found**:

- Verify the tool is included in your agent's `toolIds` array
- Check that the `toolId` matches between tool definition and agent configuration

**Permission Errors**:

- Ensure the MCP server has necessary permissions (file access, API keys, etc.)
- Check environment variable configuration

### Debug Traces

Enable MCP debugging in your local environment:

```bash
export PIKA_MCP_DEBUG=true
export PIKA_TRACE_LEVEL=verbose
pnpm dev
```

This will show detailed information about:

- MCP server startup and shutdown
- Tool discovery and schema validation
- Tool execution requests and responses
- Error details and stack traces

## Best Practices

### Development Workflow

1. **Start Simple**: Begin with well-established MCP servers like filesystem or GitHub
2. **Test Locally First**: Always test MCP tools locally before deploying
3. **Use Environment Variables**: Keep configuration flexible with environment variables
4. **Monitor Performance**: Watch for slow MCP servers that might impact user experience

### Production Considerations

1. **Security**: Audit MCP servers and limit their permissions
2. **Reliability**: Have fallback mechanisms for critical tools
3. **Monitoring**: Track MCP tool usage and performance
4. **Updates**: Keep MCP servers updated for security and features

## Next Steps

- [Agent Configuration](./agent-configuration/) - Learn more about configuring Pika agents
- [Tool Security](./tool-security/) - Best practices for secure tool deployment
- [Local Development](./local-development/) - Advanced local development techniques
- [MCP Server Registry](https://github.com/modelcontextprotocol/servers) - Find more MCP servers

---

**Need Help?** Check the [Troubleshooting Guide](./troubleshooting/) or visit our [GitHub Issues](https://github.com/rithum/pika/issues) for community support.
