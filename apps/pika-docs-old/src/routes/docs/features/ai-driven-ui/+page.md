# Multi-Context Widget System

Pika's Widget System enables rich, interactive UI components that can render in multiple contexts: inline within chat responses, in persistent spotlight dashboards, as modal dialogs, or in split-screen canvas views. This revolutionary approach represents a shift away from canned UI experiences to dynamic interfaces that materialize in the moment.

:::info[Web Components & Tag Definitions]
This feature is powered by Pika's [Web Components system](/docs/features/web-components) and [Tag Definitions](/docs/developer/tags-feature). Learn more about building and deploying widgets in those guides.
:::

## Dynamic Multi-Context Rendering

Traditional chatbots provide static responses with pre-built UI components. Pika's Widget System allows widgets to render in four different contexts:

- **Inline**: Embedded directly in chat responses (AI-driven)
- **Spotlight**: Persistent dashboard above the chat input (always visible)
- **Dialog**: Modal overlays for focused interactions
- **Canvas**: Split-screen workspace for complex interfaces (like Claude Artifacts)

## Built-in Components

Pika comes with several built-in UI components that can be rendered inline:

### Chart Component

The built-in chart component allows the LLM to visualize data in real-time:

```markdown
<chart type="bar" data='{"labels": ["Q1", "Q2", "Q3", "Q4"], "datasets": [{"data": [100, 150, 200, 175]}]}' title="Quarterly Revenue" />
```

This tag would render an interactive bar chart showing quarterly revenue data, created dynamically based on the conversation context.

### Prompt Component

The built-in prompt componnent allows the LLM to provided recommended follow-up queries that the user may click on to continue the conversation.

```markdown
<prompt>Compare the weather last year also.</prompt>
```

## Custom Widget Development

Chat app authors can define their own custom UI widgets which can then be rendered by the UI in the flow of the chat session. This opens up endless possibilities for creating contextual, interactive experiences.

### Example Custom Widgets

**Order Visualization Widget:**
Create a widget that graphically represents order details, status, and timeline:

```markdown
<order-status orderId="12345" status="shipped" estimatedDelivery="2024-01-15" />
```

**Product Definition Form:**
Allow users to create product definitions inline within the chat:

```markdown
<product-form category="electronics" prefill='{"brand": "Acme", "warranty": "2 years"}' />
```

**Interactive Calculator:**
Embed specialized calculators for specific use cases:

```markdown
<loan-calculator principal="100000" rate="3.5" term="30" />
```

## How It Works

The AI Driven UI system works through tag definitions that specify:

1. **Widget Type**: What kind of UI component to render
2. **Data Structure**: How data should be formatted and passed to the widget
3. **Rendering Instructions**: How the widget should appear and behave
4. **LLM Instructions**: Guidelines for when and how the LLM should use the widget

## Benefits

- **Context-Aware**: UI components are generated based on the current conversation context
- **Dynamic**: No need to pre-define all possible UI scenarios
- **Interactive**: Users can interact with widgets directly in the chat flow
- **Flexible**: Support for both built-in and custom components
- **Developer-Friendly**: Easy to create and deploy custom widgets

## Integration with Chat Flow

AI-driven UI components integrate seamlessly with the natural conversation flow. The LLM can:

- Analyze user needs and determine appropriate widgets
- Generate properly formatted tags with relevant data
- Explain the widget's purpose and how to interact with it
- Respond to user interactions with the widget

This creates a fluid experience where the UI adapts to serve the user's needs in real-time, rather than forcing users into predefined interaction patterns.

## Widget Visibility Model

Widget visibility uses a two-tier model combining tag definitions and chat app configuration:

**Tag Definitions** specify availability model via `usageMode`:

```js
{
    usageMode: 'global',  // Available to all chat apps by default
    status: 'enabled'
}
```

or

```js
{
    usageMode: 'chat-app',  // Requires explicit enablement per chat app
    status: 'enabled'
}
```

**Chat Apps** control which tags they use:

```js
features: {
    tags: {
        enabled: true,
        tagsEnabled: [
            { scope: 'mycompany', tag: 'dashboard' }  // Enable specific chat-app tags
        ],
        tagsDisabled: [
            { scope: 'pika', tag: 'download' }  // Disable specific global tags
        ]
    }
}
```

**Status Lifecycle:**

- `'enabled'` - Active and available
- `'disabled'` - Temporarily hidden
- `'retired'` - Permanently archived

## Getting Started

**NOTE:** To use the Widget System, the tags feature must be enabled in your site-wide `pika-config.ts` file.

To start using widgets in your chat app:

1. Enable the tags feature in site configuration: `tags: { enabled: true }`
2. Create tag definitions with appropriate `usageMode` and `status` values
3. Configure chat app to enable desired tags via `features.tags.tagsEnabled`
4. Build custom web components if needed (optional)
5. Configure rendering contexts (`spotlight`, `inline`, `dialog`, `canvas`)
6. Enable instruction assistance for inline widgets

For detailed implementation instructions:

- [Web Components Overview](/docs/features/web-components) - Learn about all rendering contexts
- [Building Web Components](/docs/developer/building-web-components) - Create custom widgets
- [Tags Feature Developer Guide](/docs/developer/tags-feature) - Manage tag definitions
