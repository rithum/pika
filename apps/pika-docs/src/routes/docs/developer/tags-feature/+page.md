# Tags Feature

The Tags feature enables AI-driven UI components that can be dynamically rendered within chat responses. This powerful system allows LLMs to create contextual, interactive user interfaces on-demand.

## Overview

Tags are special markup elements that the LLM can include in responses to render interactive UI components. Each tag is defined by a `TagDefinition` that specifies its behavior, data structure, and rendering instructions.

## Configuration

### Site-wide Configuration

Enable the tags feature in your `pika-config.ts`:

```typescript
export const siteFeatures: SiteFeatures = {
    tags: {
        enabled: true,
        tagsEnabled: [
            { tag: 'chart', scope: 'builtin' },
            { tag: 'table', scope: 'builtin' },
            { tag: 'order-status', scope: 'custom' }
        ],
        tagsProhibited: [
            // Tags that should never be used
        ]
    }
    // ... other features
};
```

### Chat App Level Configuration

Override tag settings for specific chat apps:

```typescript
const chatAppFeatures: ChatAppOverridableFeatures = {
    tags: {
        tagsEnabled: [
            { tag: 'chart', scope: 'pika' },
            { tag: 'product-form', scope: 'acme_company' }
        ]
    }
};
```

## Tag Definition Types

### Built-in Tags

Built-in tags are provided by Pika and include common UI components:

- **Chart**: Renders various chart types (bar, line, pie, etc.)
- **Image**: Shows images with captions
- **Prompt**: Renders a button with a follow-up prompt recommended by the LLM

### Svelte Custom Tags

Custom Svelte components defined in your application code:

```typescript
{
  tag: 'product-form',
  scope: 'acme_company',
  widget: {
    type: 'custom-compiled-in',
    // Component will be loaded from your custom components directory
  }
}
```

### Web Component Tags

Standalone web components that can be uploaded and dynamically loaded:

```typescript
{
  tag: 'advanced-calculator',
  scope: 'acme_company',
  widget: {
    type: 'web-component',
    webComponent: {
      s3Bucket: 'my-components-bucket',
      s3Key: 'calculator-component.js',
      encoding: 'gzip+base64'
    }
  }
}
```

### Pass-through Tags

Tags that are passed through without UI rendering, useful for semantic markup:

```typescript
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

```typescript
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

```typescript
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

```typescript
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

```typescript
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

## Integration Examples

### Frontend Integration

```typescript
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
