# MCP (Model Context Protocol) Support

Pika Framework now supports **Model Context Protocol (MCP)**, extending your AI agents beyond traditional AWS Lambda tools to connect with a rich ecosystem of third-party integrations and local development tools.

## What is MCP?

Model Context Protocol is an open standard created by Anthropic that enables AI assistants to securely connect with external data sources and tools. MCP provides a standardized way for AI models to interact with various systems, from databases and APIs to local development environments.

## Key Benefits

### **Expanded Tool Ecosystem**

- Access hundreds of existing MCP servers and tools
- Integrate with popular services like GitHub, databases, file systems, and more
- Connect to custom MCP servers built by your team or the community

### **Enhanced Local Development**

- Run MCP servers locally during development for immediate testing
- Debug tool interactions without deploying to AWS
- Iterate quickly on agent behavior with local tools

### **Unified Tool Architecture**

- Seamlessly mix Lambda tools and MCP tools in the same agent
- Consistent developer experience across different tool types
- Single framework managing multiple tool protocols

### **Better Development Experience**

- Live reload of tool changes during development
- Rich debugging and tracing for MCP tool invocations
- Easy switching between local and production tool configurations

## How It Works

### **Hybrid Tool Execution**

Pika Framework now supports two execution models:

**Traditional Lambda Tools:**

- Tools deployed as AWS Lambda functions
- Executed directly by Bedrock Agents
- Managed entirely by AWS infrastructure

**MCP Tools:**

- Tools provided by MCP servers (local or remote)
- Executed through Pika's "return control" mechanism
- Results fed back into the agent conversation flow

### **Return Control Mechanism**

When an agent needs to use an MCP tool:

1. Bedrock Agent returns control to Pika Framework
2. Pika connects to the appropriate MCP server
3. Tool is executed locally or remotely via MCP
4. Results are formatted and sent back to the agent
5. Agent continues with the tool results

## Use Cases

### **Development & Debugging**

- Connect agents to local development databases
- Integrate with local file systems for document processing
- Test API integrations before deployment

### **Data Integration**

- Connect to PostgreSQL, MySQL, or other databases via MCP
- Access Google Drive, Notion, or other cloud storage
- Integrate with CRM systems and business applications

### **DevOps & Automation**

- Connect to GitHub for repository management
- Integrate with Kubernetes for container orchestration
- Access monitoring and logging systems

### **Custom Business Logic**

- Build custom MCP servers for proprietary systems
- Create specialized tools for your industry or workflow
- Maintain tool logic outside of AWS Lambda constraints

## Security Considerations

### **Local Development**

- MCP tools run in your local environment with your permissions
- Ensure MCP servers are from trusted sources
- Review tool schemas before enabling in production

### **Production Deployment**

- Use secure, audited MCP servers in production
- Configure proper network isolation for MCP server communication
- Monitor MCP tool usage through Pika's tracing system

## Compatibility

### **Backward Compatibility**

- Existing Lambda tools continue to work unchanged
- No migration required for current Pika installations
- Gradual adoption of MCP tools as needed

### **Mixed Deployments**

- Single agents can use both Lambda and MCP tools
- Tool type is transparent to the AI model
- Consistent debugging and tracing across tool types

## Getting Started

MCP support is available in all new Pika installations. To start using MCP tools:

1. **Enable MCP in your agent configuration**
2. **Add MCP tools to your tool definitions**
3. **Configure MCP servers for development and production**
4. **Test locally before deploying**

For detailed implementation instructions, see the [MCP Developer Guide](../developer/mcp-tools/).

## Next Steps

- [MCP Developer Guide](../developer/mcp-tools/) - Learn how to implement MCP tools in your agents
- [Tool Configuration](../developer/tool-configuration/) - Understand tool types and configurations
- [Local Development](../developer/local-development/) - Set up your local MCP development environment

---

**Note**: MCP support requires Pika Framework version 2.0 or later. Ensure your installation is up to date to access these features.
