# Agent Instruction Assistance

The Agent Instruction Assistance feature provides automatic injection of formatting instructions into agent prompts. This developer guide covers the technical implementation details, configuration options, and integration patterns.

## Feature Type Definition

The core feature is defined by the `AgentInstructionAssistanceFeature` interface:

```js
export interface AgentInstructionAssistanceFeature {
    /**
     * If enabled, a markdown section titled Output Formatting Requirements will be added into your prompt. You can control where the prompt assistance language is added in
     * by using a replacement placeholder titled `{{prompt-assistance}}` in your prompt. If found, the prompt assistance language will be added at the location of the placeholder.
     * The injected prompt assistance language will first add the output formatting requirements, then the instructions for tags,
     * then the complete example instruction line, and finally the json only imperative instruction line.
     *
     * If `{{prompt-assistance}}` is not found, then we look for more fine-grained control by looking for these specific placeholder tags:
     * `{{output-formatting-requirements}}`, `{{tag-instructions}}`, `{{complete-example-instruction-line}}` and `{{json-only-imperative-instruction-line}}`. Of course,
     * if you haven't turned on the `includeInstructionsForTags` feature, then we will not inject the tag instructions.
     *
     * If neither `{{prompt-assistance}}` nor any of the specific placeholder tags are found, then the prompt assistance language will be appended to the end of the prompt
     * in this order: output formatting requirements, tag instructions, complete example instruction line, and json only imperative instruction line. If `{{prompt-assistance}}`
     * is not found and you did not specify all of the specific placeholder tags but you did turn on a feature that means we should inject instructions then we
     * will add the corresponding instructions to the end of the prompt.
     */
    enabled: boolean;

    /**
     * If enabled, basic output formatting requirements will be injected into the prompt at
     * `{{output-formatting-requirements}}` if found in the prompt. If not found, then the requirements will be appended to the end of the prompt.
     * This provides foundational formatting guidance for the agent's responses.
     */
    includeOutputFormattingRequirements?: {
        enabled: boolean;
    };

    /**
     * If enabled, then the instructions for tags that are available for the agent will be injected into the prompt at
     * `{{tag-instructions}}` if found in the prompt. If not found, then the instructions will be appended to the end of the prompt.
     */
    includeInstructionsForTags?: {
        enabled: boolean;
    };

    /**
     * If enabled, a line will be added to the prompt assistance language that instructs the agent to include a complete example of the tag structure.
     */
    completeExampleInstructionLine?: {
        enabled: boolean;
        mdLine?: string;
    };

    /**
     * If enabled, a line will be added to the prompt assistance language that instructs the agent to only respond with valid JSON.
     */
    jsonOnlyImperativeInstructionLine?: {
        enabled: boolean;
        line: string;
    };
}
```

## Configuration Hierarchy

The Agent Instruction Assistance feature uses an opt-in approach for each sub-feature. Simply enabling the main feature (`enabled: true`) does not automatically activate all sub-features - you must explicitly enable each one you want to use. This provides granular control over exactly which instruction assistance behaviors are active.

### Site-wide Configuration

Configure the default behavior in your `pika-config.ts`:

```js
export const siteFeatures: SiteFeatures = {
    agentInstructionAssistance: {
        enabled: true,
        includeOutputFormattingRequirements: {
            enabled: true
        },
        includeInstructionsForTags: {
            enabled: true
        },
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

```js
const chatAppFeatures: ChatAppOverridableFeatures = {
    agentInstructionAssistance: {
        enabled: true,
        includeOutputFormattingRequirements: true,
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
// If includeOutputFormattingRequirements.enabled is true
{{output-formatting-requirements}}

// If includeInstructionsForTags.enabled is true
{{tag-instructions}}

// If completeExampleInstructionLine.enabled is true
{{complete-example-instruction-line}}

// If jsonOnlyImperativeInstructionLine.enabled is true
{{json-only-imperative-instruction-line}}
```

### Placeholder Replacement

#### prompt-assistance Placeholder

For simple, complete control over where all instruction assistance content appears in your prompt:

```js
const myPrompt = `
You are a specialized customer service agent.

{{prompt-assistance}}

Remember to be helpful and friendly.
`;
```

When `{{prompt-assistance}}` is found, the system injects all enabled instruction content in this order:

1. Output formatting requirements (if `includeOutputFormattingRequirements.enabled` is true)
2. Tag instructions (if `includeInstructionsForTags.enabled` is true)
3. Complete example instruction line (if `completeExampleInstructionLine.enabled` is true)
4. JSON validation instruction line (if `jsonOnlyImperativeInstructionLine.enabled` is true)

#### Fine-Grained Placeholder Control

For precise control over individual instruction components, use these specific placeholders:

##### output-formatting-requirements Placeholder

Controls where the basic output formatting requirements are injected:

```js
const myPrompt = `
You are a customer service agent.

{{output-formatting-requirements}}

Additional context and instructions here.
`;
```

This placeholder is only populated when `includeOutputFormattingRequirements.enabled` is set to `true`. It provides foundational formatting guidance that ensures consistent response structure across all agents.

##### complete-example-instruction-line Placeholder

Controls where the complete example instruction is placed:

```js
const myPrompt = `
Base instructions here...

{{complete-example-instruction-line}}

Additional guidance...
`;
```

##### json-only-imperative-instruction-line Placeholder

Controls where JSON validation instructions are placed:

```js
const myPrompt = `
Your main instructions...

{{json-only-imperative-instruction-line}}

Final context...
`;
```

##### tag-instructions Placeholder

This placeholder gets replaced with instructions for all enabled tags, wrapped in XML tags:

```markdown
- **Pika Charts:**
  <tag-instructions type="chart">
  To include a pika chart, use the `<pika.chart></pika.chart>` tags.
  The content within the tags MUST be valid Chart.js version 4 JSON, including `type` and `data` properties.

**Example:** `<pika.chart>{"type":"line","data":{"labels":["May","June","July","August"],"datasets":[{"label":"Avg Temperature (°C)","data":[2,3,7,12]}]}}</pika.chart>`

**Usage:** Include pika charts whenever they can visually represent data, trends, or comparisons effectively.
</tag-instructions>
```

#### Fallback Behavior

The system uses a hierarchical approach to determine where to inject instruction content:

1. **Primary Placeholder**: If `{{prompt-assistance}}` is found, all instruction content is injected at that location
2. **Fine-Grained Placeholders**: If `{{prompt-assistance}}` is not found, the system looks for individual component placeholders (`{{output-formatting-requirements}}`, `{{tag-instructions}}`, etc.)
3. **Automatic Append**: If neither `{{prompt-assistance}}` nor the specific placeholders are found, content is automatically appended to the end of the prompt in the standard order

This approach provides maximum flexibility while ensuring instruction content is always included when the feature is enabled.

## Tag Instruction Integration

### How Tag Instructions Are Generated

1. **Retrieve Enabled Tags**: System queries all tag definitions enabled for the current chat app
2. **Extract LLM Instructions**: Pulls the `llmInstructionsMd` field from each tag definition
3. **Format with XML Wrapper**: Wraps the markdown content in XML tags for consistent formatting
4. **Inject into Prompt**: Replaces the `{{tag-instructions}}` placeholder or appends to prompt

### Tag Instruction Structure

Tag definitions now include simple markdown instructions:

```js
const tagDefinition: TagDefinition<ChartWidgetTagDefinition> = {
    tag: 'chart',
    scope: 'builtin',
    llmInstructionsMd: `To include a chart, use the \`<chart></chart>\` tags.

**Example:** \`<chart>{"type":"bar","data":{"labels":["A","B"],"datasets":[{"data":[1,2]}]}}</chart>\`

**Chart Types:**
- **Bar Charts:** Use for comparing categories or discrete data points
- **Line Charts:** Best for showing trends over time
- **Pie Charts:** Effective for showing proportional data`
    // ... other properties
};
```

## Component Instruction Integration

### Direct Component Invocations

Tag definitions can also include `componentAgentInstructionsMd` for web components that need to invoke the agent directly with specialized instructions. This enables components to request structured data in specific formats.

### Component Instruction Structure

Component instructions are stored as a record of named instruction sets:

```js
const tagDefinition: TagDefinition<WebComponentTagDefinition> = {
    tag: 'weather-widget',
    scope: 'weather',
    componentAgentInstructionsMd: {
        'get-current-weather': `You are a weather data assistant. When invoked, you should:

1. Extract the location(s) from the user's request
2. Always use the appropriate tool(s) to fetch real-time data; NEVER MAKE UP WEATHER INFORMATION
3. Return the weather information in a structured format

<output_schema>
interface WeatherDataResponse {
    locations: WeatherData[];
}

interface WeatherData {
    // The location name
    location: string;
    // Longitude
    lon: number;
    // Latitude
    lat: number;
    // Temperature in Fahrenheit
    tempF: number;
    // Temperature in Celsius
    tempC: number;
    // ISO 8601 timestamp
    timestamp: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
    }
    // ... other properties
};
```

### TypeScript-Backed Output Formatting

Component instructions support the `{{typescript-backed-output-formatting-requirements}}` placeholder, which provides structured guidance for generating JSON output that conforms to TypeScript interfaces defined in `<output_schema>` blocks.

When `includeTypescriptBackedOutputFormattingRequirements.enabled` is set to `true`, this placeholder is replaced with detailed instructions that tell the LLM to:

1. Locate the `<output_schema>` element containing TypeScript interface definitions
2. Use the **first interface** as the response structure specification
3. Generate a structured response inside <answer></answer> tags
4. Generate valid JSON that strictly conforms to the interface of `output_schema` and put it inside the `<answer>` tag
5. Include all required properties with correct types
6. Optionally omit properties marked with `?` if data is unavailable

This ensures components receive data in the exact format they expect, improving reliability and reducing parsing errors.

Here's the actual markdown that the placeholder is replaced with as of 10/10/2025

```md
**Output Formatting Requirements:**

1. **Locate the Schema**: Find the \`<output_schema>\` element in this prompt, which contains TypeScript interface definitions.

2. **Identify Response Type**: The **first interface** defined in the \`<output_schema>\` element specifies the exact structure your response must follow.

3. **Generate Valid JSON**: Create a JSON object that strictly conforms to that first interface definition. Ensure:

    - All required properties are included
    - Property types match the TypeScript definitions
    - Optional properties (marked with ? may be omitted if data is unavailable
    - String values are properly quoted
    - The JSON is valid and parseable

4. **Enclose Response**: Your entire response MUST be wrapped in \`<answer></answer>\` tags with ONLY the JSON inside - no other text, explanations, or markdown.

**Example Output:**
\`<answer>{"property":"value","property2":"value2"}</answer>\`
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

```js
const instructionAssistance: AgentInstructionAssistanceFeature = {
    enabled: true,
    includeOutputFormattingRequirements: { enabled: true },
    includeInstructionsForTags: { enabled: false } // Disable for direct API usage
};

// Pass to your agent invocation
await invokeAgent(prompt, instructionAssistance);
```

## Advanced Configuration

### Custom Example Lines

Provide specific examples for your use case:

```js
completeExampleInstructionLine: {
    enabled: true,
    mdLine: "<answer>## Customer Service Response\nHere's your order status: <order-status>{'id': '12345', 'status': 'shipped'}</order-status>\nIs there anything else I can help with?</answer>"
}
```

### Custom JSON Validation Messages

Tailor validation instructions to your domain:

```js
jsonOnlyImperativeInstructionLine: {
    enabled: true,
    line: "CRITICAL: All financial data JSON must be validated. Invalid JSON will cause regulatory compliance issues."
}
```

### Conditional Instruction Loading

Tag visibility is automatically determined by the tag definition's `chatAppId` and `status` fields:

```js
// Tag definitions control which tags are available
// Example tag definition:
{
    tag: 'chart',
    scope: 'pika',
    chatAppId: 'chat-app-global',  // Available to all chat apps
    status: 'enabled',              // Active and visible
    renderingContexts: {
        inline: { enabled: true }   // Available for inline rendering
    },
    llmInstructionsMd: '...'        // Instructions for the LLM
}

// The instruction assistance feature automatically discovers tags:
// 1. Queries for tags with matching chatAppId (and 'chat-app-global')
// 2. Filters to status === 'enabled'
// 3. Filters to contexts.inline.enabled === true
// 4. Injects instructions for matching tags

const chatAppFeatures = {
    agentInstructionAssistance: {
        enabled: true,
        includeOutputFormattingRequirements: { enabled: true },
        includeInstructionsForTags: { enabled: true }
    }
};
```

To make a tag available to a specific chat app, set its `chatAppId` field to match the chat app ID. To make it available to all chat apps, use `chatAppId: 'chat-app-global'`.

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
- Check that tag definitions include `llmInstructionsMd` field
- Ensure `includeInstructionsForTags.enabled` is set to `true`

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

1. Update the `llmInstructionsMd` field in your tag definitions with well-formatted markdown
2. Cache invalidation happens automatically for admin-updated tags
3. Test agent responses to ensure proper instruction followin

### Feature Configuration Changes

When modifying instruction assistance settings:

1. Update your site-wide or chat app configuration
2. Test with representative prompts
3. Monitor agent response quality for any regressions

## Best Practices

### Instruction Design

- **Keep Instructions Concise**: LLMs perform better with clear, brief instructions
- **Use Standard Markdown**: Write your instructions in well-formatted markdown - the system handles the XML wrapping
- **Include Clear Examples**: Provide working examples for complex tags using code blocks
- **Test Thoroughly**: Validate that LLMs follow the generated instructions
- **Leverage Markdown Features**: Use headers, lists, bold text, and code blocks for better readability

### Configuration Management

- **Start Simple**: Begin with basic enablement before customizing
- **Use Hierarchy**: Leverage site-wide defaults with chat app overrides as needed
- **Monitor Performance**: Track instruction effectiveness and adjust as needed
- **Document Changes**: Keep track of custom instruction modifications

### Integration Patterns

- **Placeholder Usage**: Use `{{prompt-assistance}}` for complete control or fine-grained placeholders for precise component placement
- **Selective Enablement**: Only enable instruction assistance where it adds value
- **Custom Examples**: Tailor example instruction lines to your specific use cases
- **Validation Messages**: Customize JSON validation messages for your domain requirements
