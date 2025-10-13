# Agent Instruction Assistance

The Agent Instruction Assistance feature automatically injects formatting instructions into agent prompts, ensuring consistent and structured responses from your LLMs. This powerful system streamlines prompt engineering by automatically managing output formatting requirements and tag-specific instructions.

## Overview

Traditional LLM implementations require manually crafting complex prompts with detailed formatting instructions. Pika's Agent Instruction Assistance feature automates this process by dynamically injecting structured formatting requirements directly into your agent prompts, ensuring consistent output formatting across all interactions.

## How It Works

When enabled, the Agent Instruction Assistance feature automatically adds an "Output Formatting Requirements" section to your agent prompts. This section includes:

1. **Response Enclosure Requirements**: Ensures all output is wrapped in `<answer></answer>` tags
2. **Content Format Guidelines**: Specifies that responses must be in Markdown format
3. **Dynamic Tag Instructions**: Automatically injects instructions for enabled tags
4. **Example Formatting**: Provides complete examples of proper tag usage
5. **JSON Validation**: Includes strict JSON validation requirements for data-driven components

## Placeholder System

The instruction assistance system uses several placeholders that get replaced with dynamic content:

### tag-instructions placeholder

`{{tag-instructions}}`

When you enable the `includeInstructionsForTags` option, this placeholder gets replaced with detailed instructions for all tags that are available to your chat app. The system automatically:

- Discovers tags based on `chatAppId` (both app-specific and `'chat-app-global'` tags)
- Filters to only `status === 'enabled'` tags with `contexts.inline.enabled === true`
- Formats their LLM instructions according to Pika's structured format
- Injects them at the placeholder location (or appends them if no placeholder exists)

Tag visibility is controlled at the tag definition level via the `chatAppId` and `status` fields, not through site-level configuration.

### typescript-backed-output-formatting-requirements placeholder

`{{typescript-backed-output-formatting-requirements}}`

This specialized placeholder is used in **component invocation instructions** (stored in `componentAgentInstructionsMd`) to ensure structured JSON output that conforms to TypeScript interfaces. When you enable `includeTypescriptBackedOutputFormattingRequirements`, this placeholder gets replaced with detailed formatting instructions that tell the LLM to:

1. Locate the `<output_schema>` element containing TypeScript interface definitions
2. Use the **first interface** as the response structure specification
3. Generate a structured response inside <answer></answer> tags
4. Generate valid JSON that strictly conforms to the interface of `output_schema` and put it inside the `<answer>` tag
5. Include all required properties with correct types
6. Optionally omit properties marked with `?` if data is unavailable

This is particularly useful for web components that invoke the agent directly to request structured data in specific formats.

### complete-example-instruction-line placeholder

`{{complete-example-instruction-line}}`

This placeholder provides a complete example showing proper tag usage structure:

```markdown
<answer>## Example markdown
Normal text and an <image>http://some.url</image> and some **bold text**
<chart>(...)</chart></answer>
```

The system intelligently excludes examples for tags that aren't enabled in your configuration.

### json-only-imperative-instruction-line placeholder

`{{json-only-imperative-instruction-line}}`

Adds critical JSON validation instructions to prevent malformed data:

```markdown
BE ABSOLUTELY CERTAIN ANY JSON INCLUDED IS 100% VALID (especially for charts). Invalid JSON will break the user experience.
```

## Relationship with Tags Feature

Agent Instruction Assistance works hand-in-hand with the [AI Driven UI (tags)](/docs/features/ai-driven-ui) feature:

1. **Tags Define Available Components**: The tags feature determines which UI components are available
2. **Instruction Assistance Teaches Usage**: This feature automatically teaches the LLM how to use those components
3. **Dynamic Instruction Generation**: Instructions are generated based on your specific tag configuration
4. **Consistent Formatting**: Ensures all tag usage follows Pika's structured formatting standards

## Configuration Options

The Agent Instruction Assistance feature uses an opt-in approach - simply enabling the main feature does not automatically activate all sub-features. You must explicitly enable each instruction type you want to use, providing precise control over your agent's behavior.

### Basic Enablement

```js
agentInstructionAssistance: {
    enabled: true;
}
```

### Advanced Configuration

```js
agentInstructionAssistance: {
    enabled: true,
    includeOutputFormattingRequirements: {
        enabled: true
    },
    includeInstructionsForTags: {
        enabled: true
    },
    completeExampleInstructionLine: {
        enabled: true,
        mdLine: "Custom example: <answer>Your content here</answer>"
    },
    jsonOnlyImperativeInstructionLine: {
        enabled: true,
        line: "CRITICAL: Validate all JSON before output"
    }
}
```

## Benefits

### Automated Prompt Engineering

- **Consistency**: Every agent gets the same high-quality formatting instructions
- **Maintenance-Free**: Instructions automatically update when you change your tag configuration
- **Best Practices**: Built-in formatting standards based on extensive LLM research

### Dynamic Tag Integration

- **Contextual Instructions**: Only includes instructions for tags enabled in your chat app
- **Structured Format**: Uses proven formatting patterns that LLMs understand well
- **Scalable**: Automatically handles new tags without manual prompt updates

### Improved User Experience

- **Reliable Output**: Consistent formatting reduces parsing errors
- **Rich Interactions**: Proper tag usage enables dynamic UI components
- **Error Prevention**: Built-in validation instructions prevent malformed responses

## Prompt Integration

### Automatic Placement

By default, instruction assistance content is appended to the end of your prompt. For precise control, use the `{{prompt-assistance}}` placeholder:

```markdown
You are a helpful assistant.

Core instructions here...

{{prompt-assistance}}

Additional context...
```

For even more precise control, you can use fine-grained placeholders like `{{output-formatting-requirements}}`, `{{tag-instructions}}`, `{{complete-example-instruction-line}}`, and `{{json-only-imperative-instruction-line}}` to control exactly where each component is placed.

### Custom Integration

The system respects existing formatting in your prompts and integrates seamlessly with your custom instruction structure.

## Use Cases

### E-commerce Chat App

Automatically teaches the LLM to use product widgets, order status components, and payment forms:

```markdown
**Output Formatting Requirements:**

- **Product Display:** Use `<product-card>` for showing product information
- **Order Status:** Use `<order-status>` to display shipping information
- **Charts:** Use `<chart>` for sales analytics and trends
```

### Financial Services

Ensures proper formatting for financial data, calculators, and compliance information:

```markdown
**Output Formatting Requirements:**

- **Loan Calculator:** Use `<loan-calc>` with validated JSON data
- **Portfolio Charts:** Use `<chart>` for investment visualizations
- **Compliance:** All financial advice must include proper disclaimers
```

## Getting Started

**NOTE:** To use the Agent Instruction Assistance feature, it must first be enabled in your site-wide `pika-config.ts` file. Without this enablement, chat apps cannot use instruction assistance regardless of their individual configuration.

1. **Enable the Feature**: Add `agentInstructionAssistance: { enabled: true }` to your site configuration
2. **Configure Sub-Features**: Enable specific instruction types like `includeOutputFormattingRequirements: { enabled: true }` and `includeInstructionsForTags: { enabled: true }`
3. **Test Your Agent**: Verify that responses follow the expected formatting
4. **Customize as Needed**: Override default instructions for specific chat apps

For detailed implementation instructions, see the [Agent Instruction Assistance Developer Guide](/docs/developer/instruction-assistance).

## Best Practices

- **Start Simple**: Begin with basic enablement before adding custom instruction lines
- **Test Thoroughly**: Verify that your LLM follows the generated instructions correctly
- **Monitor Performance**: Watch for formatting issues and adjust configuration as needed
- **Stay Consistent**: Use the same configuration across similar chat apps for consistency
