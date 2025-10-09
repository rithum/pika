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

## Benefits

### For Developers

- **Standard web components**: Use familiar browser APIs
- **Framework agnostic**: Build with any framework (Svelte, Angular, React, Vue, vanilla JS)
- **Hot reload**: Quick iteration during development
- **TypeScript support**: Full type safety with `pika-shared` module types

### For Users

- **Consistent experience**: Widgets work the same across all contexts
- **Personalization**: Pin/unpin widgets in spotlight
- **Responsive design**: Adapts to desktop and mobile
- **Progressive enhancement**: Works without JavaScript (where applicable)

## Next Steps

- [Building Web Components](/docs/developer/building-web-components) - Create your first web component
- [Deploying Web Components](/docs/developer/deploying-web-components) - Deploy to production
- [Tags Feature](/docs/developer/tags-feature) - Understand tag definitions and management
- [pika-ux Module](/docs/developer/pika-ux-module) - Use pre-built UI components
