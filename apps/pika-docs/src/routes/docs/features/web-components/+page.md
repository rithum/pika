---
title: Web Components & Multi-Context Widget System
description: Build dynamic, reusable widgets that can render in multiple contexts including spotlight, canvas, dialog, and inline message rendering
outline: [2, 3]
---

This guide introduces Pika's web component system, which allows you to create rich, interactive widgets that can be rendered in multiple contexts throughout the chat interface.

## Overview

The Web Components feature extends Pika's [Tags Feature](/docs/developer/tags-feature) to support dynamic, reusable widgets that can render in four different contexts:

- **Spotlight**: Persistent dashboard above the chat input
- **Inline**: Embedded in chat messages (traditional tag rendering)
- **Dialog**: Modal overlays for focused interactions
- **Canvas**: Split-screen view for rich, interactive content (like Claude Artifacts)

## Key Concepts

### Widgets vs Tags vs Web Components

- **Widget**: A reusable UI component that can render in multiple contexts
- **Tag**: An XML element in LLM responses that triggers widget rendering (e.g., `<acme.dashboard>`)
- **Web Component**: A standard browser custom element that implements the widget's UI

### Widget Contexts

Each widget can support one or more rendering contexts:

#### Spotlight Context

Spotlight widgets appear in a horizontal carousel above the chat input, providing quick access to frequently used tools and information.

**Use Cases:**

- Quick actions (e.g., create new ticket, search documentation)
- At-a-glance information (e.g., current weather, recent activity)
- Navigation shortcuts

**Features:**

- Persistent across chat sessions
- User can pin/unpin widgets
- Supports card mode (full widget) and thumbnail mode (compact)
- Responsive carousel navigation

#### Inline Context

Inline widgets render within chat messages, providing rich visualizations and interactive content as part of the conversation flow.

**Use Cases:**

- Data visualizations (charts, graphs)
- Interactive forms
- Image galleries
- Rich media previews

**Features:**

- Rendered by the LLM in response content
- Supports streaming (progressive rendering)
- Markdown-compatible
- Accessible from chat history

#### Dialog Context

Dialog widgets appear as modal overlays, ideal for focused interactions that can size to a popup or be nearly full-screen.

**Use Cases:**

- Confirmation dialogs
- Forms and data entry
- Quick details view
- Settings panels
- Large view of a spotlight card

**Features:**

- Modal overlay with backdrop
- Dismissible (click outside or close button)
- Can open other widgets (including canvas)
- Customizable size

#### Canvas Context

Canvas widgets render in a split-screen layout similar to Claude's Artifacts feature, providing a dedicated workspace alongside the chat.

**Use Cases:**

- Code editors
- Complex data visualizations
- Document editors
- Multi-step workflows
- Rich application interfaces

**Features:**

- Split-screen layout (resizable)
- Persistent across chat interactions
- Can get/put context into chat with LLM
- Can be minimized/maximized
- Full-height dedicated space

## Architecture

### Tag Definitions

Each widget is defined by a `TagDefinition` that includes:

```js
{
  "tag": "dashboard",
  "scope": "acme",
  "tagTitle": "Sales Dashboard",
  "chatAppId": "sales-chat",  // or "chat-app-global" for all chat apps
  "status": "enabled",  // "enabled", "disabled", or "retired"
  "renderingContexts": {
    "spotlight": { "enabled": true, "isDefault": true },
    "canvas": { "enabled": true },
    "dialog": { "enabled": true }
  },
  "widget": {
    "type": "web-component",
    "webComponent": {
      "url": "https://cdn.acme.com/widgets.js"  // or S3 configuration
    }
  }
}
```

### Tag Visibility Model

Tags are scoped to chat apps using the `chatAppId` field:

- **Global tags**: `chatAppId: "chat-app-global"` - available to all chat apps
- **App-specific tags**: `chatAppId: "my-chat-app"` - only available to specified chat app
- **Status lifecycle**: `status: "enabled"` (active), `"disabled"` (hidden), `"retired"` (archived)

### Web Component Integration

Web components are standard browser custom elements that integrate with Pika's chat application:

1. **Loading**: Components are loaded dynamically from URL or S3
2. **Registration**: Custom elements register with the browser (`customElements.define()`)
3. **Context**: Components receive app state and chat state via context API
4. **Rendering**: Components inject into designated containers based on context

## Getting Started

To start building with web components:

1. **Learn the basics**: Read [Building Web Components](/docs/developer/building-web-components)
2. **Set up deployment**: Follow [Deploying Web Components](/docs/developer/deploying-web-components)
3. **Explore the API**: Check out [pika-ux NPM Module](/docs/developer/pika-ux-module)
4. **Review examples**: See mock tags in `apps/pika-chat/src/lib/mock-tags/`

## Direct LLM Integration

Web components can invoke the chat app's agent directly without creating visible chat sessions. This enables:

**Real-Time Data Fetching**

- Get weather, stock prices, or live metrics on-demand
- Query databases through the agent's tools
- Fetch user-specific insights

**Interactive Widgets**

- Weather dashboards that update with real data
- Analytics widgets with LLM-powered insights
- Search widgets for quick lookups

**Component-Specific Instructions**

- Each widget defines its own prompts (isolated from main chat)
- Structured JSON responses with TypeScript types
- Security managed server-side

**Example:**

```js
// Widget calls agent with component-specific instructions
const weather = await chatAppState.invokeAgentAsComponent('acme', 'weather-widget', 'getCurrentWeather', 'Get weather for San Francisco');

// Agent responds with structured data
console.log(weather.tempF); // 72
console.log(weather.condition); // 'Sunny'
```

**Use Cases:**

- **Weather widgets** - Real-time forecasts and alerts
- **Analytics dashboards** - On-demand data insights
- **Quick searches** - Fast lookups without full chat
- **Fun facts** - Daily trivia or tips
- **Multi-city comparisons** - Side-by-side data displays

See [Building Web Components](/docs/developer/building-web-components#Direct-LLM-Integration) for implementation details.

### Streaming Response Handling

When components invoke the agent using `invokeAgentAsComponent()`, the response format is similar to normal chat but optimized for structured data:

**Normal Chat Mode:**

- Responses wrapped in `<answer></answer>` tags
- Markdown with custom tags
- Designed for UI rendering in chat messages

**Component Invocation Mode:**

- **JSON in `<answer>` tags** - `<answer>{"property":"value"}</answer>`
- Structured JSON conforming to TypeScript interfaces
- Client automatically extracts JSON from tags for type-safe parsing

The `invokeAgentAsComponent()` API provides two modes:

**Simple Mode (Default):**

```js
// Just get the data - no ceremony
const data = (await chatAppState.invokeAgentAsComponent) < WeatherData > ('weather', 'favorite-cities', 'getCurrentWeather', 'Get weather for NYC');
```

**Streaming Mode (With Progress):**

```js
// Get progress updates during LLM execution
const data =
    (await chatAppState.invokeAgentAsComponent) <
    WeatherData >
    ('weather',
    'favorite-cities',
    'getCurrentWeather',
    'Get weather for NYC',
    {
        onThinking: (text) => showStatus(text),
        onToolCall: (call) => showToolActivity(call),
        onTrace: (trace) => logTrace(trace)
    });
```

**Response Flow:**

1. **Server streams**: `<trace>...</trace>` tags (thinking, tool calls) + `<answer>JSON</answer>`
2. **Client processes**: Strips traces, extracts thinking/tool invocations for callbacks
3. **Client extracts**: Removes `<answer>` tags to get clean JSON
4. **Client parses**: Converts JSON to typed TypeScript object

**Why Streaming?**

- Show progress indicators (e.g., "Calling weather API...")
- Display LLM reasoning for transparency
- Debug tool invocations in real-time
- Provide rich feedback in canvas widgets

**Design Philosophy:**

- **Simple things stay simple**: Default mode auto-extracts JSON, no ceremony
- **Complex things are possible**: Callbacks expose full agent lifecycle
- **Consistent format**: LLM always wraps JSON in `<answer>` tags per TypeScript schema
- **Progressive enhancement**: Start simple, add streaming UI later

This approach balances developer ergonomics (easy JSON parsing) with power user needs (streaming UI feedback).

## Component Metadata Registration

Web components can register display metadata (title and action buttons) with the parent application. The parent renders context-appropriate UI chrome around the component, providing a consistent user experience while saving space.

### How It Works

- **Component registers**: Calls `getWidgetMetadataAPI()` to register title and actions
- **Parent renders chrome**: Shows title bar with actions based on rendering context
- **Dynamic updates**: Component can update title/actions anytime during its lifecycle

### Context-Specific Chrome

The chrome rendered by the parent adapts to each rendering context:

- **Spotlight**: Compact title bar overlay with icon, title, and action menu (for 2+ actions)
- **Canvas**: Full title bar with icon, title, individual action buttons, and close button
- **Dialog**: Title displayed in header, actions rendered as buttons in footer
- **Inline**: No chrome rendered (component manages its own UI)

### Benefits

- **Space-efficient**: No need for components to render duplicate titles
- **Consistent UX**: Uniform look and feel across all widgets
- **Context-appropriate**: Presentation adapts to available space and user context
- **Dynamic actions**: Enable/disable, add, or remove actions as component state changes

### Example

```js
// Get scoped metadata API for this widget
const metadata = context.chatAppState.getWidgetMetadataAPI('acme', 'my-widget', context.instanceId, context.renderingContext);

// Register metadata
metadata.setMetadata({
    title: 'My Widget Title',
    actions: [
        {
            id: 'refresh',
            title: 'Refresh data',
            iconSvg:
                '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
            callback: async () => {
                await fetchData();
            }
        }
    ]
});
```

See [Building Web Components - Metadata Registration](/docs/developer/building-web-components#Registering-Component-Metadata) for complete implementation details and best practices.

## Benefits

### For Developers

- **Standard web components**: Use familiar browser APIs
- **Framework agnostic**: Build with any framework (Svelte, Angular, React, Vue, vanilla JS)
- **Hot reload**: Quick iteration during development
- **TypeScript support**: Full type safety with `pika-shared` module types
- **Direct LLM access**: Invoke agents with component-specific instructions
- **Structured responses**: Type-safe JSON responses from the LLM

### For Users

- **Consistent experience**: Widgets work the same across all contexts
- **Personalization**: Pin/unpin widgets in spotlight
- **Responsive design**: Adapts to desktop and mobile
- **Progressive enhancement**: Works without JavaScript (where applicable)
- **Real-time data**: On-demand updates powered by LLM
- **Interactive widgets**: Rich, data-driven experiences

## Next Steps

- [Building Web Components](/docs/developer/building-web-components) - Create your first web component
- [Deploying Web Components](/docs/developer/deploying-web-components) - Deploy to production
- [Tags Feature](/docs/developer/tags-feature) - Understand tag definitions and management
- [pika-ux Module](/docs/developer/pika-ux-module) - Use pre-built UI components
