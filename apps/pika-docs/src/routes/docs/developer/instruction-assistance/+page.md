# Agent Instruction Assistance

The Agent Instruction Assistance feature provides automatic injection of formatting instructions into agent prompts. This developer guide covers the technical implementation details, configuration options, and integration patterns.

## Feature Type Definition

The core feature is defined by the `AgentInstructionAssistanceFeature` interface:

```typescript
export interface AgentInstructionAssistanceFeature {
    /**
     * If enabled, a markdown section titled Output Formatting Requirements will be added into your prompt.
     * If you have a replacement placeholder titled `${prompt-assistance}` then the prompt assistance language will be added at the location of the placeholder, otherwise it will be appended to the end of the prompt.
     */
    enabled: boolean;

    /**
     * If true, then the instructions for tags that are available for the agent will be injected into the prompt at
     * `{{tag-instructions}}` if found in the prompt. If not found, then the instructions will be appended to the end of the prompt.
     */
    includeInstructionsForTags?: boolean;

    /**
     * If true, a line will be added to the prompt assistance language that instructs the agent to include a complete example of the tag structure.
     */
    completeExampleInstructionLine?: {
        enabled: boolean;
        mdLine?: string;
    };

    /**
     * If true, a line will be added to the prompt assistance language that instructs the agent to only respond with valid JSON.
     */
    jsonOnlyImperativeInstructionLine?: {
        enabled: boolean;
        line: string;
    };
}
```

## Configuration Hierarchy

### Site-wide Configuration

Configure the default behavior in your `pika-config.ts`:

```typescript
export const siteFeatures: SiteFeatures = {
    agentInstructionAssistance: {
        enabled: true,
        includeInstructionsForTags: true,
        completeExampleInstructionLine: {
            enabled: true
        },
        jsonOnlyImperativeInstructionLine: {
            enabled: true,
            line: 'BE ABSOLUTELY CERTAIN ANY JSON INCLUDED IS 100% VALID (especially for charts). Invalid JSON will break the user experience.'
        }
    }
    // ... other features
};
```

### Chat App Override

Override settings for specific chat apps:

```typescript
const chatAppFeatures: ChatAppOverridableFeatures = {
    agentInstructionAssistance: {
        enabled: true,
        includeInstructionsForTags: false, // Disable tag instructions for this app
        completeExampleInstructionLine: {
            enabled: true,
            mdLine: 'Custom example format for this app'
        }
    }
};
```

## Prompt Injection Mechanism

### Default Injection Structure

When enabled, the system injects this basic structure:

```markdown
**Output Formatting Requirements:**

**Output Response Enclosure**: All response output MUST be completely enclosed within <answer></answer> tags, including supported custom tags.

**Output Content Format**: All responses MUST be in Markdown with supported custom tags.

{{tag-instructions}}

{{complete-example-instruction-line}}

{{json-only-imperative-instruction-line}}
```

### Placeholder Replacement

#### ${prompt-assistance} Placeholder

For precise control over where instructions appear in your prompt:

```typescript
const myPrompt = `
You are a specialized customer service agent.

${prompt - assistance}

Remember to be helpful and friendly.
`;
```

#### {{tag-instructions}} Placeholder

This placeholder gets replaced with structured instructions for all enabled tags:

```markdown
- **Pika Charts:**
    - To include a pika chart, use the '<pika.chart></pika.chart>' tags.
    - The content within the tags MUST be valid Chart.js version 4 JSON, including 'type' and 'data' properties.
    - **Example:** '<pika.chart>{"type":"line","data":{"labels":["May","June","July","August"],"datasets":[{"label":"Avg Temperature (°C)","data":[2,3,7,12]}]}}</pika.chart>'
    - **Usage:** Include pika charts whenever they can visually represent data, trends, or comparisons effectively.
```

## Tag Instruction Integration

### How Tag Instructions Are Generated

1. **Retrieve Enabled Tags**: System queries all tag definitions enabled for the current chat app
2. **Extract LLM Instructions**: Pulls the `llmInstructions` field from each tag definition
3. **Format According to Standards**: Converts structured instructions to markdown format
4. **Inject into Prompt**: Replaces the `{{tag-instructions}}` placeholder or appends to prompt

### Tag Instruction Structure

Tag definitions include structured LLM instructions:

```typescript
const tagDefinition: TagDefinition<ChartWidgetTagDefinition> = {
    tag: 'chart',
    scope: 'builtin',
    llmInstructions: [
        {
            type: 'line',
            mdLine: 'To include a chart, use the `<chart></chart>` tags.'
        },
        {
            type: 'line',
            title: 'Example',
            mdLine: '`<chart>{"type":"bar","data":{"labels":["A","B"],"datasets":[{"data":[1,2]}]}}</chart>`'
        },
        {
            type: 'block',
            title: 'Chart Types',
            lines: [
                {
                    type: 'line',
                    title: 'Bar Charts',
                    mdLine: 'Use for comparing categories or discrete data points'
                }
            ]
        }
    ]
    // ... other properties
};
```

## Implementation Details

### Runtime Processing

When an agent is invoked through the Pika chat app UI:

1. **Feature Resolution**: System determines which `AgentInstructionAssistanceFeature` configuration is active (site-wide vs chat app override)
2. **Tag Context Loading**: Retrieves all enabled tag definitions for the current chat app
3. **Instruction Generation**: Builds the complete instruction text with all placeholders resolved
4. **Prompt Injection**: Injects instructions at the specified location or appends to prompt
5. **Agent Invocation**: Passes the enhanced prompt to the LLM

### Direct API Usage

For custom clients invoking agents directly:

```typescript
const instructionAssistance: AgentInstructionAssistanceFeature = {
    enabled: true,
    includeInstructionsForTags: false // Disable for direct API usage
};

// Pass to your agent invocation
await invokeAgent(prompt, instructionAssistance);
```

## Advanced Configuration

### Custom Example Lines

Provide specific examples for your use case:

```typescript
completeExampleInstructionLine: {
    enabled: true,
    mdLine: "<answer>## Customer Service Response\nHere's your order status: <order-status>{'id': '12345', 'status': 'shipped'}</order-status>\nIs there anything else I can help with?</answer>"
}
```

### Custom JSON Validation Messages

Tailor validation instructions to your domain:

```typescript
jsonOnlyImperativeInstructionLine: {
    enabled: true,
    line: "CRITICAL: All financial data JSON must be validated. Invalid JSON will cause regulatory compliance issues."
}
```

### Conditional Instruction Loading

Control which tags get instructions based on context:

```typescript
// In your chat app configuration
const chatAppFeatures = {
    tags: {
        // Only enable specific tags for this app
        tagsEnabled: [
            { tag: 'chart', scope: 'builtin' },
            { tag: 'order-status', scope: 'custom' }
        ]
    },
    agentInstructionAssistance: {
        enabled: true,
        includeInstructionsForTags: true // Only includes instructions for enabled tags
    }
};
```

## Testing and Debugging

### Verifying Instruction Injection

To see what instructions are being generated:

1. Enable debug logging in your agent configuration
2. Check the final prompt that gets sent to the LLM
3. Verify that placeholders are properly replaced
4. Test LLM responses for compliance with injected instructions

### Common Issues

**Missing Tag Instructions**:

- Verify tags are enabled in your chat app configuration
- Check that tag definitions include `llmInstructions` field
- Ensure `includeInstructionsForTags` is set to `true`

**Instruction Formatting Problems**:

- Review tag definition instruction structure
- Validate markdown formatting in custom instruction lines
- Check for proper JSON escaping in examples

## Performance Considerations

### Caching

The system caches generated instructions to avoid regenerating them on every request:

- Instructions are cached per chat app configuration
- Cache invalidation occurs when tag definitions are updated
- Custom instruction lines are cached separately

### Prompt Length Management

Long instruction sets can impact context window usage:

- Monitor total prompt length when using many tags
- Consider disabling instruction assistance for simple use cases
- Use targeted tag enablement rather than enabling all available tags

## Migration and Updates

### Upgrading Tag Definitions

When updating tag definitions:

1. Update the `llmInstructions` field in your tag definitions
2. Cache invalidation happens automatically for admin-updated tags
3. Test agent responses to ensure proper instruction following

### Feature Configuration Changes

When modifying instruction assistance settings:

1. Update your site-wide or chat app configuration
2. Test with representative prompts
3. Monitor agent response quality for any regressions

## Best Practices

### Instruction Design

- **Keep Instructions Concise**: LLMs perform better with clear, brief instructions
- **Use Consistent Formatting**: Follow Pika's structured instruction patterns
- **Include Clear Examples**: Provide working examples for complex tags
- **Test Thoroughly**: Validate that LLMs follow the generated instructions

### Configuration Management

- **Start Simple**: Begin with basic enablement before customizing
- **Use Hierarchy**: Leverage site-wide defaults with chat app overrides as needed
- **Monitor Performance**: Track instruction effectiveness and adjust as needed
- **Document Changes**: Keep track of custom instruction modifications

### Integration Patterns

- **Placeholder Usage**: Use `${prompt-assistance}` for precise control over instruction placement
- **Selective Enablement**: Only enable instruction assistance where it adds value
- **Custom Examples**: Tailor example instruction lines to your specific use cases
- **Validation Messages**: Customize JSON validation messages for your domain requirements
