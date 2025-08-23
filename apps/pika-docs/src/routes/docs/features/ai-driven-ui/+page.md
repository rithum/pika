# AI Driven UI Tags (BETA)

Pika includes advanced widgets that can render inline in the body of the chat response from the LLM. This revolutionary approach represents a shift away from canned UI experiences to UI experiences that materialize in the moment, guided by the LLM.

## Dynamic UI Generation

Traditional chatbots provide static responses with pre-built UI components. Pika's AI Driven UI feature allows the LLM to dynamically create and embed interactive widgets directly within chat responses, creating context-aware user interfaces that adapt to the conversation flow.

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

## Getting Started

**NOTE:** To use the AI Driven UI (Tags) feature, it must first be enabled in your site-wide `pika-config.ts` file. Without this enablement, chat apps cannot use tags regardless of their individual configuration.

To start using AI Driven UI in your chat app:

1. Enable the tags feature in your site-wide configuration
2. Define which tag definitions your chat app should use
3. Create custom widgets if needed (optional)
4. Configure the LLM with proper instructions for tag usage

For detailed implementation instructions, see the [Tags Feature Developer Guide](/docs/developer/tags-feature).
