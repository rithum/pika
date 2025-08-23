---
title: Multi Agent Collaboration
description: Configure agents to work together for complex multi-domain tasks
outline: [2, 3]
---

The Multi Agent Collaboration feature enables you to create sophisticated multi-agent workflows where a primary agent can delegate specific tasks to specialized collaborator agents. This allows you to build agents that leverage domain expertise across multiple areas while maintaining a unified user experience.

## Overview

Multi-agent collaboration works through a supervisor model where:

- **Primary Agent**: Orchestrates the conversation and decides when to invoke collaborators
- **Collaborator Agents**: Specialized agents with their own prompts, tools, and knowledge bases
- **Post-Processing**: Optional response transformation before integration into the main conversation
- **Trace Visibility**: Complete transparency of all collaborator invocations

## Configuration

### 1. Define Collaborator Agents

First, create your specialized collaborator agents in your CDK stack. Each collaborator should be focused on a specific domain:

```js
// Example: Financial analysis collaborator
const financialAnalystAgent: AgentDefinitionForIdempotentCreateOrUpdate = {
    agentId: 'financial-analyst-agent',
    foundationModel: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    basePrompt: `You are a financial analysis specialist. Analyze financial data, calculate metrics, and provide insights on business performance. Focus only on financial aspects and be precise with numbers.`,
    toolIds: ['financial-calculator-tool', 'market-data-tool'],
    knowledgeBases: [
        {
            id: 'financial-documents-kb',
            description: 'Company financial reports and market data'
        }
    ]
};

// Example: Technical documentation collaborator
const techWriterAgent: AgentDefinitionForIdempotentCreateOrUpdate = {
    agentId: 'tech-writer-agent',
    foundationModel: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    basePrompt: `You are a technical documentation specialist. Create clear, comprehensive documentation for technical systems, APIs, and processes. Focus on accuracy and clarity.`,
    toolIds: ['documentation-tool', 'code-analyzer-tool'],
    knowledgeBases: [
        {
            id: 'technical-docs-kb',
            description: 'Technical documentation and code repositories'
        }
    ]
};
```

### 2. Configure the Primary Agent with Collaborators

Define your primary agent with collaborator configurations:

```js
const primaryAgent: AgentDefinitionForIdempotentCreateOrUpdate = {
    agentId: 'business-analyst-agent',
    foundationModel: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    basePrompt: `You are a senior business analyst. Help users with business questions by leveraging specialized collaborators when needed:

- For financial analysis, calculations, or market data: use the financial-analyst-agent
- For technical documentation or system questions: use the tech-writer-agent
- For general business strategy: handle directly

Always explain which specialist you're consulting and integrate their expertise into comprehensive responses.`,

    toolIds: ['business-tools'], // Primary agent's own tools

    // Collaborator configuration
    agentCollaboration: 'SUPERVISOR', // Can also be 'DISABLED'
    collaborators: [
        {
            agentId: 'financial-analyst-agent',
            instruction: 'Analyze the financial aspects of this question and provide detailed calculations and insights.',
            historyRelay: 'TO_COLLABORATOR' // or 'TO_AGENT'
        },
        {
            agentId: 'tech-writer-agent',
            instruction: 'Create comprehensive technical documentation for this system or process.',
            historyRelay: 'TO_AGENT' // Only current question, not full history
        }
    ]
};
```

### 3. Deploy All Agents

Deploy all agents (primary and collaborators) in your CDK stack:

```js
const agentData: AgentDataRequest = {
    userId: 'cloudformation/my-business-stack',
    agent: primaryAgent,
    tools: [
        // Tools for all agents
        ...businessTools,
        ...financialTools,
        ...documentationTools
    ]
};

// Also deploy collaborator agent definitions
const financialAgentData: AgentDataRequest = {
    userId: 'cloudformation/my-business-stack',
    agent: financialAnalystAgent,
    tools: [] // Tools already included above
};

const techWriterAgentData: AgentDataRequest = {
    userId: 'cloudformation/my-business-stack',
    agent: techWriterAgent,
    tools: [] // Tools already included above
};
```

## Configuration Options

### Collaboration Types

- **`SUPERVISOR`**: Primary agent orchestrates and delegates to collaborators
- **`DISABLED`**: No collaboration (default if not specified)

### History Relay Options

Understanding the difference between history relay options is crucial for effective multi-agent collaboration:

#### `TO_COLLABORATOR` - Full Context

The collaborator receives the entire conversation history, giving them complete context.

**Example scenario:**

```
Conversation:
User: "I'm planning our 2024 budget"
Agent: "I'll help you with budget planning. What areas do you need to focus on?"
User: "Can you calculate the ROI if we increase marketing spend by 30%?"

With TO_COLLABORATOR, the financial agent sees:
- "I'm planning our 2024 budget"
- "I'll help you with budget planning. What areas do you need to focus on?"
- "Can you calculate the ROI if we increase marketing spend by 30%?"
```

**Use when:** The collaborator needs full context to provide accurate responses (complex multi-turn conversations, contextual analysis).

#### `TO_AGENT` - Current Task Only

The collaborator only sees the current question/task, not the full conversation history.

**Example scenario:**

```
Same conversation as above...

With TO_AGENT, the financial agent only sees:
- "Can you calculate the ROI if we increase marketing spend by 30%?"
```

**Use when:** The task is self-contained (calculations, simple analyses, independent operations).

### History Relay Configuration

```js
collaborators: [
    {
        agentId: 'specialist-agent',
        instruction: 'Handle the specialized aspects of this request.',
        historyRelay: 'TO_COLLABORATOR' // Full context
    }
];
```

### Foundation Model Override

Each collaborator can use a different model:

```js
const collaboratorAgent = {
    agentId: 'cost-effective-collaborator',
    foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0', // Faster, cheaper model
    basePrompt: '...'
    // ... rest of config
};
```

## Post-Processing (Advanced)

The system automatically configures post-processing for multi-agent responses. Collaborator outputs are wrapped in `<final_response>` tags and integrated into the primary agent's response stream.

### How Post-Processing Works

1. **Collaborator Response**: Specialist agent provides raw response
2. **Post-Processing**: System extracts content from `<final_response>` tags
3. **Integration**: Primary agent receives processed response and integrates it
4. **User Experience**: Seamless conversation flow with specialist insights

## Tracing and Monitoring

### Collaboration Traces

When collaborators are invoked, traces show:

- **Collaborator Invocation**: Which agent was called and with what parameters
- **Collaborator Response**: The specialist agent's output
- **Post-Processing**: How the response was transformed
- **Integration**: How it was incorporated into the main response

### Performance Monitoring

Monitor multi-agent performance:

```js
// Traces show usage for each agent
{
    "agent": "business-analyst-agent",
    "collaborators": [
        {
            "agentId": "financial-analyst-agent",
            "tokensUsed": 1250,
            "responseTime": "2.3s"
        }
    ],
    "totalCost": "$0.0045"
}
```

## Best Practices

### Designing Collaborator Roles

```js
// Good: Focused, specific role
const dataAnalystAgent = {
    agentId: 'data-analyst',
    basePrompt: 'You are a data analyst. Focus only on statistical analysis, data interpretation, and insights. Be precise with calculations.',
    toolIds: ['statistics-tool', 'visualization-tool']
};

// Poor: Too broad, overlaps with primary agent
const generalHelperAgent = {
    agentId: 'helper',
    basePrompt: 'You help with various business questions and general assistance.',
    toolIds: ['everything-tool']
};
```

### Collaboration Instructions

```js
//  Good: Clear, specific instructions
collaborators: [
    {
        agentId: 'financial-analyst',
        instruction: 'Calculate ROI, profit margins, and cash flow metrics for the scenario described. Provide specific numbers and financial recommendations.',
        historyRelay: 'TO_COLLABORATOR'
    }
];

// Poor: Vague instructions
collaborators: [
    {
        agentId: 'financial-analyst',
        instruction: 'Help with this financial question.',
        historyRelay: 'TO_COLLABORATOR'
    }
];
```

### History Relay Strategy

- **Use `TO_COLLABORATOR`** when the specialist needs full context (complex multi-turn conversations)
- **Use `TO_AGENT`** when the task is self-contained (calculations, single analyses)

## Troubleshooting

### Collaborator Not Being Invoked

1. **Check Agent Definition**: Ensure collaborator agent is properly deployed
2. **Verify Primary Agent Config**: Confirm `agentCollaboration: 'SUPERVISOR'` is set
3. **Review Instructions**: Make sure collaboration instructions are clear and specific
4. **Check Traces**: Look for collaboration attempts in trace logs

### Performance Issues

1. **Minimize Collaborators**: Only use when domain expertise is truly needed
2. **Optimize History Relay**: Use `TO_AGENT` when full context isn't required
3. **Model Selection**: Use faster models for simple collaborative tasks
4. **Monitor Costs**: Track usage across all agents in the collaboration

### Response Quality Issues

1. **Refine Instructions**: Make collaboration instructions more specific
2. **Improve Prompts**: Ensure collaborator prompts are focused and clear
3. **Test Individually**: Verify each collaborator works well in isolation
4. **Review Integration**: Check how responses are being integrated by the primary agent

## Related Documentation

- **[Features: Multi Agent Collaboration](/docs/features/multi-agent-collaboration/)**: High-level overview of collaboration capabilities
- **[LLM-based Agents](/docs/features/llm-based-agents/)**: Understanding the underlying agent architecture
- **[Agents as Config](/docs/features/agents-as-config/)**: How to define and deploy agents
- **[Traces Feature](/docs/developer/traces-feature/)**: Monitoring and debugging agent interactions
