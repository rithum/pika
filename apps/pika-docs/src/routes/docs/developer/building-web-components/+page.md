---
title: Building Web Components
description: Learn how to create custom web components for Pika chat applications
outline: [2, 3]
---

This guide explains how to build custom web components that integrate with Pika's multi-context widget system.

:::note[Deploying]
[Deploying Web Components](/docs/developer/deploying-web-components) explains how to make Pika aware of your web compent and deploy it. All you need to know here is
that you will be registering a `TagDefinition` that references your webcomponent as part of deployment that
defines the visual contexts your webcomponent is meant to render within (and other config).
:::

## Prerequisites

Before you begin:

- **Node.js** 22+ installed
- **TypeScript** knowledge recommended
- Familiarity with [Web Components Feature](/docs/features/web-components)

## Installation

**Required**

Install the Pika shared types and utilities for Pika integration npm module:

```bash
pnpm install pika-shared
```

**Optional: for Svelte Webcomponents**

You can build your webcomponent with React, Angular, Vue, whatever you want. However, Pika itself uses Svelte and we share Pika's Svelte goodness with you via the `pika-ux` npm module so you can make a fully-featured webcomponent fast.

- CLI to create skeleton Svelte webcomponent project
- Includes the same pre-built UI widgets (button, combobox, tabs, etc.) that Pika uses
- Dramatically smaller "compiled" webcomponent js files (svelte designed for small footprint)

If building with svelte, install the `pika-ux` CLI and UI components (based on Shadcn Svelte):

```bash
pnpm install pika-ux
```

## Creating Your First Web Component

### Basic Structure

Here's a minimal web component that displays user information:

```js
import { getPikaContext } from 'pika-shared/util/wc-utils';

class HelloWidget extends HTMLElement {
    connectedCallback() {
        this.init();
    }

    async init() {
        // Get Pika context (app state, chat state, etc.)
        const context = await getPikaContext(this);

        // Access user information
        const user = context.appState.identity.user;

        // Render content
        this.innerHTML = `
            <div class="hello-widget">
                <h3>Hello, ${user.firstName}!</h3>
                <p>You're in the ${context.context} context</p>
                <p>Chat App: ${context.chatAppId}</p>
            </div>
        `;
    }
}

// Register the custom element
customElements.define('acme-hello', HelloWidget);
```

### Using Svelte (Recommended)

Svelte provides excellent web component support:

```js
<svelte:options customElement={{ tag: 'acme-dashboard', shadow: 'none' }} />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { type PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { onMount } from 'svelte';

    let context = $state<PikaWCContext>();
    let initialized = $state(false);

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        context = await getPikaContext($host());
        initialized = true;
    }
</script>

{#if initialized && context}
    <div class="dashboard">
        <h2>Sales Dashboard</h2>
        <p>User: {context.appState.identity.user.firstName}</p>
        <p>Context: {context.context}</p>
    </div>
{:else}
    <p>Loading...</p>
{/if}

<style>
    .dashboard {
        padding: 1rem;
        border: 1px solid #ddd;
        border-radius: 8px;
    }
</style>
```

## Accessing Pika Context

### The PikaWCContext Interface

The context object provides access to application and chat state:

```js
interface PikaWCContext {
    appState: IAppState;           // Global app state
    chatAppState: IChatAppState;   // Chat-specific state
    renderingContext: WidgetRenderingContextType; // spotlight, inline, dialog, canvas
    chatAppId: string;
}
```

### Available Methods

#### App State Methods

```js
// Access user information
const user = context.appState.identity.user;
console.log(user.userId, user.firstName, user.customData);

// Show toast notifications
context.appState.showToast('Operation successful!', { type: 'success' });

// Get AWS credentials (for S3 uploads, etc.)
const creds = await context.appState.identity.getUserAwsCredentials();
```

#### Chat App State Methods

```js
// Access current session
const session = context.chatAppState.currentSession;

// Access messages
const messages = context.chatAppState.currentSessionMessages;

// Send a message programmatically
context.chatAppState.chatInput = 'Show me the sales report';
await context.chatAppState.sendMessage();

// Upload files
await context.chatAppState.uploadFiles(selectedFiles);

// Render another webcomponent widget.  This will show a dialog.
await context.chatAppState.renderTag('acme.details', 'dialog', { itemId: '123' });

// Close canvas/dialog (if this component is in canvas/dialog)
context.chatAppState.closeCanvas();
context.chatAppState.closeDialog();
```

## Multi-Context Rendering

### Context-Aware Rendering

Your component should adapt to the rendering contexts it has been registered to work within.
The example below assumes this webcomponent has been registered as "tag" which supports all
four visual contexts.

```js
<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { type PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();

    async function init() {
        context = await getPikaContext($host());
    }

    $effect(() => { init(); });
</script>

{#if context}
    {#if context.context === 'spotlight'}
        <!-- Compact view for spotlight -->
        <div class="compact">
            <h4>Quick Stats</h4>
            <button onclick={() => context.chatAppState.renderTag('acme.dashboard', 'canvas')}>
                Open Full View
            </button>
        </div>
    {:else if context.context === 'canvas'}
        <!-- Full view for canvas -->
        <div class="full-dashboard">
            <h2>Complete Dashboard</h2>
            <!-- Rich content -->
        </div>
    {:else if context.context === 'dialog'}
        <!-- Focused view for dialog -->
        <div class="dialog-content">
            <h3>Quick Actions</h3>
            <!-- Form or settings -->
        </div>
    {:else}
        <!-- Inline view -->
        <div class="inline-widget">
            <!-- Summary or visualization -->
        </div>
    {/if}
{/if}
```

### Opening Other Widgets

Widgets can trigger rendering of other widgets in different contexts:

```js
// Open detail view in dialog
await context.chatAppState.renderTag('acme.item-details', 'dialog', {
    itemId: '12345'
});

// Open editor in canvas
await context.chatAppState.renderTag('acme.editor', 'canvas', {
    documentId: 'doc-789'
});

// Add widget to spotlight
await context.chatAppState.renderTag('acme.quick-actions', 'spotlight');
```

## Styling

### Container Sizing

**Important:** Pika automatically wraps your web component in a container `<div>` with these Tailwind classes:

```
w-full h-full overflow-hidden flex
```

These classes ensure:

- `w-full h-full` - The container fills its available space
- `overflow-hidden` - Content is clipped to the container bounds
- `flex` - Enables flexbox layout for proper sizing behavior

**Your web component should use `h-full` and `w-full` to fill this container:**

```js
<svelte:options customElement={{ tag: 'acme-widget', shadow: 'none' }} />

<script lang="ts">
    // ... your component logic
</script>

<!-- Use h-full to fill the container height -->
<main class="flex flex-col items-center justify-center h-full w-full">
    <h1>My Widget</h1>
    <p>Content goes here</p>
</main>
```

:::warning[Avoid Viewport-Relative Sizes]
Do NOT use viewport-relative sizes like `h-screen` or `w-screen` in your root element. These will break the component's ability to fit within its designated rendering context (spotlight cards, dialogs, canvas, etc.). Always use `h-full` and `w-full` instead.
:::

### Using Tailwind CSS

Pika chat apps use Tailwind CSS. Your components can use the same classes:

```js
<div class="p-4 bg-white rounded-lg shadow-md">
    <h3 class="text-lg font-semibold mb-2">Widget Title</h3>
    <p class="text-gray-600">Widget content</p>
</div>
```

### Using pika-ux Components

The `pika-ux` package provides pre-built shadcn/ui components:

```js
import { Button } from 'pika-ux/shadcn/button';
import * as Dialog from 'pika-ux/shadcn/dialog';
import { Card } from 'pika-ux/shadcn/card';

// Use in your component
<Button onclick={handleClick}>Click Me</Button>;
```

### Shadow DOM Considerations

Web components can use Shadow DOM for style encapsulation, but Pika widgets typically use `shadow: 'none'` to inherit Tailwind styles. While this can create css bleed over issues, Pika was carefully designed to NOT do this and
provides a simpler, richer experience by not using the shadow dom.

```js
<svelte:options customElement={{ tag: 'my-widget', shadow: 'none' }} />
```

## Building for Production

It is expected that you bundle your entire web component into a single javascript file with no external dependencies. This decision was made in support of simplicity, interoperability (S3 versus URL component registration) and increased security.

Note that you can bundle multiple web components into a single javascript file (see Widget Bundles below).

### Bundling

Use your preferred bundler (Vite, Rollup, etc.) to create a single JavaScript file:

```js
// vite.config.ts
export default {
    build: {
        lib: {
            entry: 'src/widgets/index.ts',
            name: 'AcmeWidgets',
            fileName: 'widgets'
        },
        rollupOptions: {
            external: [], // Don't externalize pika-shared - bundle it
            output: {
                format: 'iife'
            }
        }
    }
};
```

### Gzipping

If you are going to push your webcomponent to the private Pika S3 bucket and have the Pika webapp retrieve it securely via AWS SDK, then you must gzip your resulting javascript file:

```bash
gzip -c dist/widgets.js > dist/widgets.js.gz
```

### Widget Bundles

You can define multiple web components in a single file if you wish:

```js
// index.ts
import './dashboard.svelte';
import './quick-actions.svelte';
import './detail-view.svelte';

// Each Svelte file registers its own custom element
// All three components will be available after loading this single file
```

## Testing Locally

### Development Server

Run a local development server:

```bash
pnpm run dev
```

### Mock Tags

Create mock tag definitions for testing:

```js
{
    "tag": "dashboard",
    "scope": "acme",
    "tagTitle": "Dashboard Widget",
    "chatAppId": "weather",  // Use existing chat app
    "status": "enabled",
    "isMock": true,
    "renderingContexts": {
        "spotlight": { "enabled": true }
    },
    "widget": {
        "type": "web-component",
        "webComponent": {
            "url": "http://localhost:5173/widgets.js"
        }
    }
}
```

### Using deploy-mock-tags Tool

Deploy mock tags quickly during development:

```bash
# From apps/pika-chat directory
pnpm run deploy:mock-tags
```

This tool:

1. Reads mock tag definitions from `src/lib/mock-tags/definitions/`
2. Uploads web component files to S3
3. Registers tags in DynamoDB

## Best Practices

### Error Handling

```js
try {
    const context = await getPikaContext($host());
    // ... use context
} catch (error) {
    console.error('Failed to get Pika context:', error);
    context.appState.showToast('Operation successful!', { type: 'success' });
}
```

## Next Steps

- [Deploying Web Components](/docs/developer/deploying-web-components) - Deploy your widgets to production
- [pika-ux Module](/docs/developer/pika-ux-module) - Explore available UI components
- [Tags Feature](/docs/developer/tags-feature) - Understand tag definition management
- [Web Components Overview](/docs/features/web-components) - Learn about rendering contexts
