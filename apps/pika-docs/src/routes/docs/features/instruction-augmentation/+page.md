# Instruction Augmentation (Semantic Directives)

The Instruction Augmentation feature enables dynamic, context-aware prompt enhancement through semantic directives. Instead of manually crafting complex prompts for every edge case, you can define targeted instructions that are automatically included only when relevant to the user's question and context.

Put another way, the Instruction Augmentation feature transforms how you handle complex, context-dependent AI interactions - turning reactive prompt engineering into proactive, intelligent instruction management.

## What Are Semantic Directives?

Semantic directives are contextual instruction fragments that augment your agent's base prompt dynamically. They solve a common problem: most of the time your agent works well, but occasionally you need specific instructions for particular situations, tools, or contexts.

Rather than bloating your base prompt with every possible edge case, semantic directives let you:

- **Store specialized instructions separately** from your main prompt
- **Scope instructions by context** (chat app, agent, tool, entity)
- **Let the LLM decide** which instructions are relevant for each specific question
- **Maintain clean, focused base prompts** while handling complex scenarios

## How It Works

The system operates in two phases:

### Phase 1: Context-Aware Retrieval

Based on the user's question and current context, the system:

1. **Identifies relevant scopes** (current chat app, agent, tools being used, entities mentioned)
2. **Queries semantic directives** that match those scopes
3. **Retrieves candidate instructions** that might be relevant

### Phase 2: LLM Decision Making

A lightweight LLM reviews the user's question and candidate directives to:

1. **Determine relevance** of each directive to the specific question
2. **Select which instructions** should be included in the final prompt if any apply
3. **Inject selected instructions** into the main agent's prompt
4. **Process the enhanced prompt** with the main LLM

## Use Cases

### E-commerce Platform

**Base Prompt**: "You are a helpful shopping assistant."

**Semantic Directives**:

```js
// Directive for handling premium customers (specific entity)
{
  scope: "agent#shopping-assistant#entity#123",
  id: "premium-perks",
  description: "Instructions for premium account 123 interactions",
  instructions: "Always mention free shipping, priority support, and exclusive discounts available to premium customers. Emphasize the value of their membership."
}

// Directive for return policy questions (applies to all users)
{
  scope: "chatapp#shopping-app",
  id: "return-policy-details",
  description: "Detailed return policy information",
  instructions: "Our return policy allows 30 days for most items, 60 days for premium members. Electronics have a 14-day window. Always check if the customer is premium for extended return periods."
}
```

**Result**: Premium customers automatically get personalized service mentions, and return policy questions trigger detailed policy information - but only when relevant.

### Financial Services

**Base Prompt**: "You are a financial advisor assistant."

**Semantic Directives**:

```js
// Investment advice directive
{
  scope: "tool#portfolio-analyzer",
  id: "risk-disclaimers",
  description: "Required risk disclaimers for investment advice",
  instructions: "Always include appropriate risk disclaimers: 'Past performance does not guarantee future results. All investments carry risk of loss.' For high-risk strategies, emphasize the potential for significant losses."
}

// High-net-worth client directive
{
  scope: "agent#financial-advisor#entity#high-net-worth",
  id: "tax-optimization-focus",
  description: "Tax optimization strategies for high-net-worth clients",
  instructions: "Focus on tax-efficient investment strategies, estate planning considerations, and wealth preservation techniques. Mention tax-loss harvesting and asset location strategies."
}
```

### Customer Support

**Base Prompt**: "You are a customer support representative."

**Semantic Directives**:

```js
// Billing issue directive
{
  scope: "chatapp#support-app",
  id: "billing-escalation",
  description: "Billing dispute handling procedures",
  instructions: "For billing disputes over $100, offer immediate escalation to a supervisor. For subscription cancellations, first offer a 50% discount for 3 months. Always verify account ownership before discussing billing details."
}

// Product defect directive
{
  scope: "tool#warranty-checker",
  id: "defect-handling",
  description: "Product defect resolution process",
  instructions: "If warranty check shows active coverage, immediately offer free replacement or repair. For out-of-warranty items, offer 20% discount on replacement. Always apologize for the inconvenience and offer expedited shipping."
}
```

## Benefits

### Dynamic Context Awareness

- **Automatically relevant**: Instructions only appear when they match the user's question and context
- **Reduced prompt bloat**: Keep base prompts clean and focused
- **Better performance**: LLMs work better with targeted, relevant instructions

### Scalable Instruction Management

- **Modular approach**: Add new edge cases without modifying base prompts
- **Team collaboration**: Different teams can contribute specialized instructions
- **Version control**: Track and manage instruction changes independently

### Intelligent Automation

- **LLM-powered relevance**: Let the AI decide which instructions are needed
- **Context-sensitive**: Same directive behaves differently based on user context
- **Failure resilience**: System gracefully handles directive failures

## Getting Started

:::warning[Configuration Required]
The Instruction Augmentation feature must be enabled in your site-wide `pika-config.ts` file before chat apps can use semantic directives. Without this enablement, directives will not be processed regardless of how they're defined.
:::

### 1. Enable the Feature

Add Instruction Augmentation to your site configuration:

```js
export const siteFeatures: SiteFeatures = {
    instructionAugmentation: {
        enabled: true
    }
    // ... other features
};
```

### 2. Create Semantic Directives

Use the admin interface to create your first directive:

1. **Navigate to Admin** → **Site Administration** → **Semantic Directives**
2. **Create New Directive** with:
    - **Scope**: `chatapp#your-app-id`
    - **ID**: `helpful-introduction`
    - **Description**: "Friendly introduction for new users"
    - **Instructions**: "Start responses with a warm welcome and briefly explain what you can help with."

### 3. Test and Refine

1. **Test your chat app** to see directive injection in action
2. **Monitor effectiveness** through the admin interface
3. **Refine descriptions** to improve LLM selection accuracy
4. **Add more directives** for specific scenarios as needed

For detailed implementation guidance, see the [Instruction Augmentation Developer Guide](/docs/developer/instruction-augmentation).

## Management and Administration

### Admin Interface

- **Create, edit, and delete** semantic directives through the web interface
- **Search and filter** directives by scope, creator, or content
- **Track usage and performance** of individual directives
- **Bulk operations** for managing large sets of directives

### Infrastructure as Code

- **CloudFormation integration** for defining directives in your stack
- **Serverless plugin support** for Serverless Framework users
- **Version control friendly** with gzipped directive definitions
- **Automated deployment** through CI/CD pipelines

## Best Practices

### Directive Design

- **Clear descriptions**: Write descriptions that help the LLM understand when to use the directive
- **Focused instructions**: Keep individual instructions specific and actionable
- **Test thoroughly**: Validate that directives trigger in appropriate contexts
- **Monitor impact**: Track how directives affect response quality

### Scope Management

- **Start broad, get specific**: Begin with simple scopes, add compound scopes as needed
- **Use consistent naming**: Establish clear naming conventions for scopes and IDs
- **Document purpose**: Maintain clear documentation of what each directive handles
- **Regular cleanup**: Remove unused or redundant directives

For detailed technical implementation, API usage, and advanced configuration options, see the [Instruction Augmentation Developer Guide](/docs/developer/instruction-augmentation).
