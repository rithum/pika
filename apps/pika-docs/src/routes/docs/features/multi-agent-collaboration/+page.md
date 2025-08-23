---
title: Multi Agent Collaboration
description: Enable multiple agents to work together to solve complex tasks
outline: [2, 3]
---

Agents in Pika can collaborate with other agents to handle complex tasks that require multiple areas of expertise. This enables sophisticated multi-agent workflows while maintaining clear accountability and traceability.

## Primary Use Case: The Universal Chat App

The most powerful application of multi-agent collaboration is creating **one comprehensive chat app** that can handle inquiries across your entire organization's domains. Here's how it works:

- **Single Entry Point**: Users interact with one chat app, not dozens of specialized ones
- **Intelligent Routing**: The supervisor agent automatically determines which specialists to consult
- **Seamless Experience**: Users get expert answers without knowing which agents were involved
- **Complete Coverage**: Handle everything from HR questions to technical support to financial analysis

### Example: Enterprise Assistant

```
User: "What's our Q4 revenue and do we have the technical capacity to scale our API?"

Supervisor Agent:
├── Consults Financial Agent → "Q4 revenue was $2.3M, up 15% YoY"
├── Consults Technical Agent → "Current API can handle 50% more load, scaling recommended"
└── Integrates responses → Provides comprehensive answer covering both domains
```

This eliminates the need to create separate chat apps for Finance, Engineering, HR, Sales, etc. Instead, you have one intelligent assistant that routes questions to the right specialists automatically.

## How multi-agent collaboration works

- **Supervisor Mode**: A primary agent orchestrates the conversation and delegates specific tasks to specialist collaborators
- **Specialized Roles**: Each collaborator agent has its own prompt, tools, and knowledge bases optimized for specific domains
- **Seamless Integration**: Collaborator responses are post-processed and integrated into the main conversation flow
- **Full Transparency**: All collaborator invocations are visible in traces, showing which agent handled what

## Key capabilities

### Multi-Agent Orchestration

Configure a primary agent to work with specialized collaborators:

- **Domain Experts**: Route financial questions to a finance agent, technical questions to a dev agent
- **Task Delegation**: Break down complex requests across multiple specialist agents
- **Context Sharing**: Control what conversation history each collaborator receives

### Flexible Collaboration Patterns

- **SUPERVISOR Mode**: Primary agent manages the conversation and calls collaborators as needed
- **History Relay**: Choose whether collaborators see the full conversation (`TO_COLLABORATOR`) or just the current task (`TO_AGENT`)
- **Post-Processing**: Transform and integrate collaborator responses before returning to users

### Complete Traceability

- **Collaborator Traces**: See exactly which agent was invoked and with what parameters
- **Response Processing**: View how collaborator outputs were transformed and integrated
- **Performance Metrics**: Track usage and costs across all agents in the collaboration

## Use cases

### Expert Consultation

Route specialized queries to domain experts while maintaining a unified user experience.

### Complex Problem Solving

Break down multi-step problems across agents with different tools and knowledge bases.

### Quality Assurance

Use collaborators for verification, fact-checking, or response enhancement.

### Workflow Automation

Orchestrate multi-step business processes across different functional areas.

:::tip[Design for clarity]
Keep collaborator roles focused and well-defined. Clear specialization makes the system more maintainable and helps users understand why different agents were involved.
:::

:::note[Performance considerations]
Multi-agent collaboration adds latency and cost. Design your collaboration patterns thoughtfully, and use traces to monitor performance across your multi-agent workflows.
:::
