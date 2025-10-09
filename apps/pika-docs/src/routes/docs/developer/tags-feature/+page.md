# Tags Feature (BETA)

The Tags feature enables AI-driven UI components that can be dynamically rendered within chat responses. This powerful system allows LLMs to create contextual, interactive user interfaces on-demand.

:::info[Evolution of Custom Message Tags]
This Tags Feature system is the evolution of Pika's [Custom Message Tags](/docs/developer/custom-message-tags) system. While the original system required compiled-in renderers registered directly in code, this new system introduces formal tag definitions, API management, and support for dynamic web components. Existing custom renderers continue to work and serve as the foundation for this evolved approach.
:::

## Overview

Tags are special markup elements that the LLM can include in responses to render interactive UI components. Each tag is defined by a `TagDefinition` that specifies its behavior, data structure, and rendering instructions.

## Configuration

### Site-wide Configuration

Enable the tags feature in your `pika-config.ts`:

```js
export const siteFeatures: SiteFeatures = {
    tags: {
        enabled: true
        // Tag visibility is controlled at the tag definition level via:
        // - TagDefinition.chatAppId: 'chat-app-global' = available to all chat apps
        // - TagDefinition.chatAppId: 'weather' = available only to 'weather' chat app
        // - TagDefinition.status: 'enabled' | 'disabled' | 'retired' = lifecycle state
    }
    // ... other features
};
```

### Tag Visibility Model

Tag visibility is controlled by fields on the `TagDefinition` itself, not through site or chat app configuration:

**Global Tags** - Available to all chat apps:

```js
{
    tag: 'chart',
    scope: 'pika',
    chatAppId: 'chat-app-global',  // Special value for global tags
    status: 'enabled',              // Active and visible
    // ... rest of definition
}
```

**App-Specific Tags** - Available to specific chat app(s):

```js
{
    tag: 'order-status',
    scope: 'acme',
    chatAppId: 'sales-chat',       // Only visible in 'sales-chat' app
    status: 'enabled',
    // ... rest of definition
}
```

**Status Lifecycle:**

- `'enabled'` - Active and available for use
- `'disabled'` - Temporarily hidden but not removed
- `'retired'` - Permanently archived/deprecated

## Tag Definition Types

### Built-in Tags

Built-in tags are provided by Pika and include common UI components:

- **Chart**: Renders various chart types (bar, line, pie, etc.)
- **Image**: Shows images with captions
- **Prompt**: Renders a button with a follow-up prompt recommended by the LLM

### Custom Compiled-in Tags

Custom Svelte components that are compiled into your application code. These leverage the existing [Custom Message Tags](/docs/developer/custom-message-tags) renderer system:

```js
{
  tag: 'product-form',
  scope: 'acme_company',
  widget: {
    type: 'custom-compiled-in',
    // This references a renderer from your customRenderers registry
    // in apps/pika-chat/src/lib/client/features/chat/message-segments/custom-components/
  }
}
```

The `custom-compiled-in` widget type bridges the gap between the legacy custom renderer system and the new tag definitions. Your existing custom renderers (registered in the `customRenderers` object) can be used with tag definitions by specifying this widget type.

### Web Component Tags

Standalone web components that can be uploaded and dynamically loaded:

```js
{
  tag: 'advanced-calculator',
  scope: 'acme_company',
  widget: {
    type: 'web-component',
    webComponent: {
      s3Bucket: 'my-components-bucket',
      s3Key: 'calculator-component.js',
      encoding: 'gzip'
    }
  }
}
```

### Pass-through Tags

Tags that are passed through without UI rendering, useful for semantic markup:

```js
{
  tag: 'metadata',
  scope: 'system',
  widget: {
    type: 'pass-through'
  }
}
```

## Tag Definition Structure

A complete tag definition includes:

```js
interface TagDefinition<T extends TagDefinitionWidget> {
    tag: string; // The tag name (e.g., 'chart')
    scope: string; // Namespace/scope (e.g., 'builtin', 'custom')
    widget: T; // Widget configuration
    llmInstructions: TagInstructionForLlm[]; // Instructions for the LLM
    enabled: boolean; // Whether this tag is active
    dontCacheThis?: boolean; // Whether to skip caching
    createdBy: string; // User who created the definition
    lastUpdatedBy: string; // User who last updated it
    createDate: string; // ISO 8601 creation timestamp
    lastUpdate: string; // ISO 8601 last update timestamp
}
```

## LLM Instructions

The `llmInstructions` field provides structured guidance to the LLM about when and how to use the tag:

```js
const instructions: TagInstructionForLlm[] = [
    {
        type: 'line',
        text: 'Use the chart tag when you need to visualize numerical data'
    },
    {
        type: 'block',
        title: 'Chart Types',
        lines: [
            { type: 'line', text: '- bar: For comparing categories' },
            { type: 'line', text: '- line: For showing trends over time' },
            { type: 'line', text: '- pie: For showing proportions' }
        ]
    },
    {
        type: 'line',
        text: 'Example: <chart type="bar" data=\'{"labels":["A","B"],"datasets":[{"data":[1,2]}]}\' title="Sample Chart" />'
    }
];
```

## Creating Web Components

Web components offer the most flexibility for custom UI elements:

```javascript
// calculator-widget.js
class CalculatorWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        const { principal, rate, term } = this.getAttributes();
        this.render(principal, rate, term);
    }

    getAttributes() {
        return {
            principal: parseFloat(this.getAttribute('principal') || '0'),
            rate: parseFloat(this.getAttribute('rate') || '0'),
            term: parseInt(this.getAttribute('term') || '0')
        };
    }

    render(principal, rate, term) {
        const monthlyPayment = this.calculatePayment(principal, rate, term);

        this.shadowRoot.innerHTML = `
      <style>
        .calculator { 
          border: 1px solid #ccc; 
          padding: 16px; 
          border-radius: 8px; 
        }
      </style>
      <div class="calculator">
        <h3>Loan Calculator</h3>
        <p>Principal: $${principal.toLocaleString()}</p>
        <p>Rate: ${rate}%</p>
        <p>Term: ${term} years</p>
        <p><strong>Monthly Payment: $${monthlyPayment.toFixed(2)}</strong></p>
      </div>
    `;
    }

    calculatePayment(principal, rate, term) {
        const monthlyRate = rate / 100 / 12;
        const numPayments = term * 12;
        return (principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
    }
}

customElements.define('calculator-widget', CalculatorWidget);
```

## Management APIs

### Admin APIs (Full Access)

```js
// Create or update a tag definition
POST /api/chat-admin/tagdef
{
  "tagDefinition": {
    "tag": "calculator",
    "scope": "custom",
    "widget": { "type": "web-component", ... },
    "llmInstructions": [...],
    "enabled": true
  },
  "userId": "admin-user"
}

// Delete a tag definition
DELETE /api/chat-admin/tagdef
{
  "tagDefinition": { "tag": "calculator", "scope": "custom" },
  "userId": "admin-user"
}

// Search all tag definitions (including disabled)
POST /api/chat-admin/tagdef/search
{
  "includeInstructions": true,
  "paginationToken": null
}
```

### Chat APIs (Read-only, Enabled Only)

```js
// Search enabled tag definitions only
POST /api/chat/tagdef/search
{
  "includeInstructions": false,
  "paginationToken": null
}
```

## Best Practices

### LLM Instruction Guidelines

1. **Be Specific**: Provide clear examples of when to use each tag
2. **Include Examples**: Show properly formatted tag usage
3. **Document Attributes**: Explain required and optional attributes
4. **Set Boundaries**: Specify when NOT to use the tag

### Tag Naming

- Use descriptive, kebab-case names: `loan-calculator`, not `calc`
- Include scope prefixes for organization: `finance/loan-calculator`
- Avoid conflicts with HTML elements

### Performance Considerations

- Set `dontCacheThis: true` for tags with sensitive or highly dynamic content
- Use appropriate cache TTLs for tag definition searches
- Minimize web component bundle sizes

### Security

- Validate all tag attributes on the frontend
- Sanitize user inputs in web components
- Use Content Security Policy (CSP) headers appropriately
- Avoid exposing sensitive data through tag attributes

## Migration from Custom Message Tags

If you have existing custom renderers using the [Custom Message Tags system](/docs/developer/custom-message-tags), you can easily integrate them with tag definitions:

### Step 1: Create Tag Definition

For an existing custom renderer registered as:

```js
// In customRenderers object
export const customRenderers: Record<string, Component<any>> = {
    'data-table': MyDataTableRenderer,
    'order-form': OrderFormRenderer
};
```

Create a corresponding tag definition:

```js
{
  tag: 'data-table',
  scope: 'custom',
  widget: {
    type: 'custom-compiled-in'
  },
  llmInstructions: [
    {
      type: 'line',
      text: 'Use the data-table tag to display tabular data with headers and rows'
    },
    {
      type: 'line',
      text: 'Example: <data-table>{"headers":["Name","Age"],"rows":[["John","30"],["Jane","25"]]}</data-table>'
    }
  ],
  enabled: true,
  createdBy: 'admin',
  lastUpdatedBy: 'admin',
  createDate: new Date().toISOString(),
  lastUpdate: new Date().toISOString()
}
```

### Step 2: Register Tag Definition

Use the Admin API to register your tag definition:

```js
POST /api/chat-admin/tagdef
{
  "tagDefinition": { /* your tag definition */ },
  "userId": "admin-user"
}
```

### Step 3: Enhanced LLM Instructions

Your tag definition now provides structured instructions to the LLM about when and how to use your custom renderer, making it more discoverable and useful.

### Future Web Component Migration

When ready, you can evolve your custom-compiled-in tags to web components by:

1. Converting your Svelte component to a web component
2. Uploading it to S3
3. Updating the tag definition to use `widget.type: 'web-component'`

No changes to your existing renderer code are required during the transition period.

## Integration Examples

### Frontend Integration

```js
// In your chat app state
const chatAppState = appState.addChatApp(
    chatApp,
    ComponentRegistry.create(),
    userDataOverrideSettings,
    userIsContentAdmin,
    features,
    customDataUiRepresentation,
    mode,
    tagDefinitions // <- Tag definitions are now available
);

// Access tag definitions
const tags = chatAppState.tagDefs;
```

### Message Processing

The message segment processor automatically handles tag rendering based on the available tag definitions. When the LLM includes a tag in its response, the system:

1. Parses the tag and extracts attributes
2. Looks up the corresponding tag definition
3. Renders the appropriate widget type
4. Handles user interactions within the widget

## Troubleshooting

### Common Issues

**Tag not rendering**: Check that the tag is enabled in both site-wide and chat app configurations.

**Web component not loading**: Verify S3 bucket permissions and component file encoding.

**LLM not using tags**: Review and refine the `llmInstructions` for clarity and examples.

**Cache issues**: Use `dontCacheThis: true` during development, or clear caches manually.

For additional help, see the [Troubleshooting Guide](/docs/developer/troubleshooting) or check the [customization documentation](/docs/developer/customization) for related configuration options.
