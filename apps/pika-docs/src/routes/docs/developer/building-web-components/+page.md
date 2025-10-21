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
    instanceId: string;            // Unique ID for this component instance
    dataForWidget: Record<string, any>; // Data passed when opening this widget
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

// Access custom data provided by auth provider (API keys, config, etc.)
const customData = context.chatAppState.customDataForChatApp;
if (customData) {
    const apiKey = customData.apiKey as string;
    const endpoint = customData.apiEndpoint as string;
}

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

// Invoke the agent directly with component-specific instructions (see section below)
const weatherData = await context.chatAppState.invokeAgentAsComponent('weather', 'my-widget', 'getData', 'Get current weather for New York');
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

### Passing Data Between Widgets

When opening a widget programmatically via `renderTag()`, you can pass arbitrary data to the receiving component using the third parameter. This data becomes available to the widget through `context.dataForWidget`.

**Passing Data:**

```js
// From a parent widget, open another widget with data
async function openProductDetails(productId: string) {
    await context.chatAppState.renderTag('acme.product-details', 'dialog', {
        productId: productId,
        source: 'dashboard',
        timestamp: Date.now()
    });
}
```

**Receiving Data:**

```js
<svelte:options customElement="acme-product-details" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();
    let productId = $state<string>('');
    let source = $state<string>('');

    async function init() {
        context = await getPikaContext($host());

        // Access data passed from parent widget
        productId = context.dataForWidget.productId || '';
        source = context.dataForWidget.source || 'unknown';

        console.log('Opened from:', source, 'at', context.dataForWidget.timestamp);

        // Load product data
        await loadProduct(productId);
    }

    $effect(() => {
        init();
    });
</script>

<div class="p-4">
    <h2>Product Details</h2>
    <p>Product ID: {productId}</p>
    <p>Opened from: {source}</p>
</div>
```

**Important Notes:**

- Data can only be passed to `dialog` and `canvas` contexts (not `spotlight` or `inline`)
- Data is available immediately when the component initializes via `context.dataForWidget`
- `dataForWidget` is always an object (defaults to `{}` if no data provided)
- Use TypeScript interfaces to type-check your data contracts between components

**Example: Multi-Step Workflow:**

```js
// Step 1: List widget opens detail dialog with item data
<script lang="ts">
    async function showDetails(item: any) {
        await context.chatAppState.renderTag('acme.item-details', 'dialog', {
            itemId: item.id,
            itemName: item.name,
            returnTo: 'item-list'
        });
    }
</script>

// Step 2: Detail widget receives data and can open an editor
<script lang="ts">
    let itemId = $state<string>('');
    let itemName = $state<string>('');

    async function init() {
        context = await getPikaContext($host());
        itemId = context.dataForWidget.itemId;
        itemName = context.dataForWidget.itemName;
    }

    async function openEditor() {
        // Close this dialog first
        context.chatAppState.closeDialog();

        // Open editor in canvas with same item data
        await context.chatAppState.renderTag('acme.item-editor', 'canvas', {
            itemId: itemId,
            itemName: itemName,
            mode: 'edit'
        });
    }
</script>
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

### Configuring Widget Dimensions

You can control how your widget is sized in different rendering contexts by adding the `sizing` property to your tag definition's `webComponent` configuration. This allows you to specify different dimensions for inline and dialog rendering.

#### Overview

The `sizing` configuration supports two rendering contexts:

- **`inline`** - When your widget appears within the chat message flow
- **`dialog`** - When your widget opens in a modal dialog

**Default Behavior (if you don't specify sizing):**

- Inline: `400px` height (can be set to `"auto"` to grow with content)
- Dialog: `fullscreen` (95vw × 90vh)

#### Inline Sizing

For inline rendering, you can control the height of your widget. Width is always 100% of the available chat area.

**Type Definition:**

```js
interface WidgetInlineSizing {
    height?: string; // Any valid CSS height value, or "auto" to grow to content
    width?: string; // Reserved for future use
}
```

**Height Options:**

- **Fixed height**: Use any CSS height value (`"400px"`, `"50vh"`, etc.)
- **Auto-grow**: Use `"auto"` to let the widget grow to fit its content height
- **Default**: `"400px"` if not specified

**Examples:**

```js
// In your tag definition (deployment code)
const tagDef = {
    tag: 'weather-summary',
    scope: 'acme',
    widget: {
        type: 'web-component',
        webComponent: {
            url: 'https://example.com/widgets.js',

            // Custom inline height
            sizing: {
                inline: {
                    height: '300px' // Shorter widget
                }
            },

            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 12345,
            encodedSha256Base64: 'abc123...'
        }
    }
};
```

**Common inline height values:**

```js
// Auto-grow to content height (no scrolling, widget expands as needed)
sizing: {
    inline: {
        height: 'auto';
    }
}

// Small widget (charts, summaries)
sizing: {
    inline: {
        height: '250px';
    }
}

// Default height (if not specified)
sizing: {
    inline: {
        height: '400px';
    }
}

// Tall widget (tables, detailed views)
sizing: {
    inline: {
        height: '600px';
    }
}

// Viewport-relative (responsive)
sizing: {
    inline: {
        height: '50vh';
    }
}
```

**When to use `"auto"`:**

Use `height: "auto"` when:

- Your widget's content height varies significantly based on data
- You want to avoid vertical scrolling within the widget
- Your widget renders a list or content that should flow naturally in the chat
- You want the widget to expand/contract based on its internal state

**When to use fixed heights:**

Use fixed heights (like `"400px"`) when:

- Your widget has consistent, predictable content (dashboards, charts, maps)
- You want to enforce a compact presentation with internal scrolling
- Your widget could potentially grow very large and you want to constrain it
- You're displaying data in a fixed-size visualization or table

:::tip[Auto-Height Best Practices]
When using `height: "auto"`, ensure your widget has a reasonable maximum height in mind. Consider adding internal constraints or pagination for very large content to avoid creating extremely tall inline widgets that disrupt the chat flow.
:::

#### Dialog Sizing

For dialog rendering, you can use preset sizes or specify custom viewport-relative dimensions.

**Preset Sizes:**

```js
type WidgetDialogSizePreset = 'fullscreen' | 'large' | 'medium' | 'small';

// Preset mappings:
// - 'fullscreen': 95vw × 90vh (default)
// - 'large':      85vw × 80vh
// - 'medium':     70vw × 70vh
// - 'small':      50vw × 50vh
```

**Custom Dimensions:**

```js
interface WidgetDialogSizeCustom {
    width?: string; // Viewport-relative unit or percentage
    height?: string; // Viewport-relative unit or percentage
}
```

:::warning[Dialog Size Requirements]
Dialog dimensions must use viewport-relative units (`vh`, `vw`, `vmin`, `vmax`) or percentages. Pixel values are not supported to ensure responsive behavior across different screen sizes.
:::

**Examples:**

```js
const tagDef = {
    widget: {
        type: 'web-component',
        webComponent: {
            sizing: {
                dialog: 'small'
            }
        }
    }
};

// Medium dialog (good for forms, settings)
sizing: {
    dialog: 'medium'
}

// Custom dialog size
sizing: {
    dialog: {
        width: '80vw',
        height: '60vh'
    }
}

// Custom with only height (width defaults to 95vw)
sizing: {
    dialog: {
        height: '75vh'
    }
}

// Custom with only width (height defaults to 90vh)
sizing: {
    dialog: {
        width: '60vw'
    }
}
```

#### Complete Examples

**Example 1: Compact Inline Widget with Medium Dialog**

```js
const tagDef = {
    tag: 'quick-search',
    scope: 'acme',
    tagTitle: 'Quick Search',
    chatAppId: 'my-app',
    status: 'enabled',
    renderingContexts: {
        inline: { enabled: true },
        dialog: { enabled: true }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            s3: {
                s3Bucket: 'my-bucket',
                s3Key: 'wc/acme/quick-search.js.gz'
            },
            sizing: {
                inline: {
                    height: '250px' // Compact inline height
                },
                dialog: 'medium' // Medium dialog when expanded
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 12345,
            encodedSha256Base64: 'abc123...'
        }
    }
};
```

**Example 2: Tall Inline Widget with Custom Dialog**

```js
const tagDef = {
    tag: 'data-table',
    scope: 'acme',
    tagTitle: 'Data Table',
    chatAppId: 'my-app',
    status: 'enabled',
    renderingContexts: {
        inline: { enabled: true },
        dialog: { enabled: true }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            url: 'https://cdn.example.com/data-table.js',
            sizing: {
                inline: {
                    height: '600px' // Tall table view
                },
                dialog: {
                    width: '90vw', // Wide dialog for more columns
                    height: '85vh' // Tall dialog for more rows
                }
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 54321,
            encodedSha256Base64: 'xyz789...'
        }
    }
};
```

**Example 3: Auto-Growing Inline Widget**

```js
const tagDef = {
    tag: 'task-list',
    scope: 'acme',
    tagTitle: 'Task List',
    chatAppId: 'my-app',
    status: 'enabled',
    renderingContexts: {
        inline: { enabled: true }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            url: 'https://cdn.example.com/task-list.js',
            sizing: {
                inline: {
                    height: 'auto' // Grows to fit content (perfect for dynamic lists)
                }
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 23456,
            encodedSha256Base64: 'def456...'
        }
    }
};
```

**Example 4: Only Customizing Inline (Dialog Uses Default)**

```js
// If you only care about inline sizing
sizing: {
    inline: {
        height: '500px';
    }
    // dialog will default to 'fullscreen' (95vw × 90vh)
}
```

**Example 5: Only Customizing Dialog (Inline Uses Default)**

```js
// If you only care about dialog sizing
sizing: {
    dialog: 'small'; // 50vw × 50vh
    // inline will default to 400px height
}
```

#### Best Practices

**For Inline Widgets:**

- Use **`"auto"`** for widgets with variable content that should flow naturally (lists, dynamic content, text-heavy widgets)
- Use **250-300px** for compact widgets (summaries, quick views, small charts)
- Use **400px** (default) for standard widgets (balanced content)
- Use **500-600px** for data-rich widgets (tables, detailed visualizations)
- Consider using viewport units (`vh`) for responsive behavior on mobile devices

**For Dialog Widgets:**

- Use **`'small'`** for quick forms, confirmations, simple settings
- Use **`'medium'`** for most dialogs (forms, detailed views, settings panels)
- Use **`'large'`** for data-heavy dialogs (large tables, multi-section forms)
- Use **`'fullscreen'`** (default) for immersive experiences (editors, dashboards)
- Use **custom dimensions** when presets don't match your specific layout needs

**General Guidelines:**

- Test your widget at different screen sizes to ensure sizing works well
- Remember: your widget must use `h-full w-full` to fill the container provided by these sizing constraints
- Inline widgets with fixed heights should be vertically scrollable if content exceeds the height
- Inline widgets with `height: "auto"` will grow to fit their content without scrolling
- Dialog widgets should handle overflow appropriately within their bounds

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

### Rapid Development with Local Overrides

For fast iteration during development, you can override web component URLs without redeploying your stack or modifying tag definitions.

**How it works:**

1. Deploy your tag definition **once** (to DynamoDB)
2. Set the `WEB_COMPONENT_URLS` environment variable to point to your local dev server
3. The system will automatically override S3/URL locations with your local URLs

**Environment Variable Format:**

```bash
# Single component
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js'

# Multiple components (semicolon-separated)
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.quick-search::http://localhost:5173/quick-search.js'
```

**Schema:** `{scope}.{tag}::fully-qualified-url` (note the double colon to avoid conflicts with URL colons)

**Example Setup:**

```bash
# In your .env.local file (root of pika-chat app)
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js;weather.temperature-trend::http://localhost:5173/temperature-trend.js'
```

**Workflow:**

1. **One-time:** Deploy your tag definitions to AWS (see deployment options below)
2. **One-time:** Start your web component dev server (e.g., Vite on port 5173)
3. **One-time:** Set `WEB_COMPONENT_URLS` environment variable
4. **Every change:** Edit your component code → hot reload → instant updates in browser

**Deployment Options for Tag Definitions:**

You have two options for the initial deployment of tag definitions:

**Option 1: Deploy via CDK/CloudFormation stack** (traditional approach)

```bash
cdk deploy
```

**Option 2: Use a direct upload tool** (faster for development)

Create a script that:

- Builds your web components
- Uploads them to S3
- Directly invokes the tag definition Lambda to register them in DynamoDB

This is much faster than full stack deployments during development. See the [weather sample project's upload tool](https://github.com/TonicAI/pika/tree/main/services/samples/weather/tools/upload-tag-defs) for a complete reference implementation you can copy and adapt.

**Benefits:**

- No CDK deployments during development
- No S3 uploads for every change
- Fast hot module reloading (HMR) with Vite
- Test changes instantly

**Important Notes:**

- Only works in development (requires environment variable to be set)
- Tag definitions must still exist in DynamoDB (deploy them once)
- Local dev server must be running and accessible
- Overrides apply to all users on your local machine

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

## Direct LLM Integration

### Overview

Web components can invoke the chat app's agent directly using the `invokeAgentAsComponent` method. This enables widgets to fetch data, get insights, or perform actions through the LLM without creating visible chat sessions.

**Key Benefits:**

- Fetch data on-demand (no automatic page load calls)
- Get structured JSON responses
- Use agent's tools and knowledge
- Component-specific instructions isolated from main chat
- Secure server-side instruction control

### Basic Usage

**1. Define instructions in your tag definition:**

```js
// In your tag definition (deployment code)
const tagDef = {
    tag: 'weather-widget',
    scope: 'acme',
    componentAgentInstructionsMd: {
        getWeather: `You are a weather assistant. When invoked:

1. Extract the location from the user's request
2. Use available tools to get current weather
3. Return data in this format:

<output_schema>
interface WeatherResponse {
    location: string;
    tempF: number;
    tempC: number;
    condition: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
    }
};
```

**2. Call from your widget:**

```js
<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    interface WeatherResponse {
        location: string;
        tempF: number;
        tempC: number;
        condition: string;
    }

    let context = $state<PikaWCContext>();
    let weather = $state<WeatherResponse | null>(null);
    let loading = $state(false);

    async function fetchWeather() {
        loading = true;
        try {
            weather = await context.chatAppState.invokeAgentAsComponent<WeatherResponse>(
                'acme',           // scope
                'weather-widget', // tag
                'getWeather',     // instruction name
                'Get current weather for San Francisco'
            );
        } catch (error) {
            console.error('Failed to fetch weather:', error);
            context.appState.showToast('Failed to fetch weather', { type: 'error' });
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        init();
    });

    async function init() {
        context = await getPikaContext($host());
    }
</script>

{#if weather}
    <div>
        <h3>{weather.location}</h3>
        <p>{weather.tempF}°F - {weather.condition}</p>
    </div>
{/if}

<button onclick={fetchWeather} disabled={loading}>
    {loading ? 'Loading...' : 'Refresh Weather'}
</button>
```

### Method Signature

```js
async invokeAgentAsComponent<T = any>(
    scope: string,           // Tag scope (e.g., 'acme')
    tag: string,             // Tag name (e.g., 'my-widget')
    instructionName: string, // Key from componentAgentInstructionsMd
    userMessage: string      // Query/request to send to agent
): Promise<T>
```

**Parameters:**

- `scope` - The scope from your tag definition
- `tag` - The tag name from your tag definition
- `instructionName` - Must match a key in `componentAgentInstructionsMd`
- `userMessage` - The natural language request to send to the agent

**Returns:**

- Promise resolving to parsed JSON response (type `T`)
- Throws error if request fails or response can't be parsed

### Defining Instructions

Instructions are defined in your tag definition's `componentAgentInstructionsMd` field. Each instruction set has a name (key) and markdown content (value).

**Structure:**

```js
componentAgentInstructionsMd: {
    'instruction-name-1': `Instruction content here...`,
    'instruction-name-2': `Different instruction set...`,
}
```

**Instruction Content Guidelines:**

1. **Start with role/context:** "You are a [type] assistant..."
2. **List steps:** Number the steps the agent should follow
3. **Define output schema:** Always include a TypeScript interface in `<output_schema>...</output_schema>`
4. **Include formatting macro:** End with `{{typescript-backed-output-formatting-requirements}}`

**Important:** The instruction name you define here must match exactly what you pass to `invokeAgentAsComponent()` in your widget code.

**Example - Multiple Instructions:**

```js
componentAgentInstructionsMd: {
    'getCurrent': `You are a weather data assistant. When invoked:

1. Extract location from request
2. Get current weather using available tools
3. Return structured data

<output_schema>
interface CurrentWeather {
    location: string;
    tempF: number;
    condition: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`,

    'getForecast': `You are a weather forecast assistant. When invoked:

1. Extract location from request
2. Get 5-day forecast using available tools
3. Return array of daily forecasts

<output_schema>
interface ForecastResponse {
    location: string;
    days: Array<{
        date: string;
        highF: number;
        lowF: number;
        condition: string;
    }>;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
}
```

### Real-World Examples

#### Example 1: Weather Widget with Refresh

```js
<svelte:options customElement="weather-card" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    interface WeatherData {
        location: string;
        tempF: number;
        tempC: number;
        humidity: number;
        condition: string;
    }

    let context = $state<PikaWCContext>();
    let city = $state('San Francisco');
    let weather = $state<WeatherData | null>(null);
    let loading = $state(false);
    let error = $state('');

    async function init() {
        context = await getPikaContext($host());
    }

    async function fetchWeather() {
        if (!context || loading) return;

        loading = true;
        error = '';

        try {
            weather = await context.chatAppState.invokeAgentAsComponent<WeatherData>(
                'acme',
                'weather-card',
                'getCurrentWeather',
                `Get current weather for ${city}`
            );
        } catch (e) {
            error = 'Failed to load weather data';
            console.error('Weather fetch error:', e);
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        init();
    });
</script>

<div class="weather-card">
    <input bind:value={city} placeholder="Enter city..." />
    <button onclick={fetchWeather} disabled={loading}>
        {loading ? '⟳ Loading...' : '🔍 Get Weather'}
    </button>

    {#if error}
        <p class="error">{error}</p>
    {:else if weather}
        <div class="weather-info">
            <h3>{weather.location}</h3>
            <div class="temp">{Math.round(weather.tempF)}°F</div>
            <p>{weather.condition}</p>
            <p>Humidity: {weather.humidity}%</p>
        </div>
    {/if}
</div>

<style>
    .weather-card {
        padding: 1rem;
        background: white;
        border-radius: 8px;
    }
    .temp {
        font-size: 2rem;
        font-weight: bold;
    }
    .error {
        color: red;
    }
</style>
```

#### Example 2: Multi-City Comparison

```js
<svelte:options customElement="weather-comparison" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    interface CityWeather {
        location: string;
        tempF: number;
        condition: string;
    }

    interface ComparisonResponse {
        cities: CityWeather[];
    }

    let context = $state<PikaWCContext>();
    let cities = $state<CityWeather[]>([]);
    let loading = $state(false);

    async function compareRandomCities() {
        loading = true;
        try {
            const response = await context.chatAppState.invokeAgentAsComponent<ComparisonResponse>(
                'acme',
                'weather-comparison',
                'compareCities',
                'Compare weather in 4 random major cities worldwide'
            );
            cities = response.cities;
        } catch (e) {
            console.error('Comparison failed:', e);
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        (async () => {
            context = await getPikaContext($host());
        })();
    });
</script>

<div class="comparison">
    <button onclick={compareRandomCities} disabled={loading}>
        {loading ? '⟳ Loading...' : '🎲 Compare Random Cities'}
    </button>

    <div class="grid">
        {#each cities as city}
            <div class="city-card">
                <h4>{city.location}</h4>
                <div class="temp">{Math.round(city.tempF)}°F</div>
                <p>{city.condition}</p>
            </div>
        {/each}
    </div>
</div>
```

### Performance Best Practices

**1. Lazy Loading (User-Initiated Calls):**

```js
// BAD - Calls LLM on every page load
$effect(() => {
    if (initialized) {
        fetchData(); // Don't do this!
    }
});

// GOOD - Only when user clicks
<button onclick={fetchData}>Refresh Data</button>;
```

**2. Loading States:**

```js
let loading = $state(false);
let error = $state('');

async function fetchData() {
    loading = true;
    error = '';
    try {
        const data = await context.chatAppState.invokeAgentAsComponent(...);
        // use data
    } catch (e) {
        error = 'Failed to load';
    } finally {
        loading = false;
    }
}
```

**3. Caching in User Widget Data Store:**

```js
async function fetchWithCache() {
    const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('acme', 'my-widget');

    // Try cache first
    const cached = await userWidgetData.getValue<WeatherData>('weather-data');
    const cacheTime = await userWidgetData.getValue<number>('cache-time');

    const fiveMinutes = 5 * 60 * 1000;
    if (cached && cacheTime && Date.now() - cacheTime < fiveMinutes) {
        return cached;
    }

    // Fetch fresh data
    const data = await context.chatAppState.invokeAgentAsComponent<WeatherData>(...);

    // Update cache
    await userWidgetData.setValue('weather-data', data);
    await userWidgetData.setValue('cache-time', Date.now());

    return data;
}
```

### Security Model

**Server-Side Control:**

- Instructions are defined in tag definitions (deployed via CDK/CloudFormation)
- Widget code cannot modify or inject prompts
- Only pre-registered instruction names can be invoked
- All requests require authentication

**What Widgets CAN Do:**

- Choose which instruction to invoke
- Provide natural language query text
- Receive structured responses

**What Widgets CANNOT Do:**

- Modify base agent prompt
- Access other components' instructions
- Bypass authentication
- Create arbitrary prompts

### Error Handling

```js
async function fetchData() {
    try {
        const data = (await context.chatAppState.invokeAgentAsComponent) < MyData > ('acme', 'my-widget', 'get-data', 'Get the latest data');
        return data;
    } catch (error) {
        // Handle specific error types
        if (error.message.includes('not found')) {
            context.appState.showToast('Data not available', { type: 'warning' });
        } else if (error.message.includes('timeout')) {
            context.appState.showToast('Request timed out', { type: 'error' });
        } else {
            context.appState.showToast('An error occurred', { type: 'error' });
            console.error('Component invocation failed:', error);
        }
        return null;
    }
}
```

### TypeScript Types

```js
// Define your response types
interface WeatherResponse {
    location: string;
    tempF: number;
    tempC: number;
    condition: string;
    humidity?: number;
    windSpeed?: number;
}

// Use with invokeAgentAsComponent
const weather = await context.chatAppState.invokeAgentAsComponent<WeatherResponse>(
    'acme',
    'weather-widget',
    'getWeather',
    'Get weather for Boston'
);

// TypeScript knows the shape of `weather`
console.log(weather.tempF); // Type-safe
console.log(weather.invalid); // TypeScript error
```

## Accessing Custom Chat App Data

### Overview

Your auth provider can supply custom configuration data (like API keys, endpoints, or feature flags) to web components through the `customDataForChatApp` property. This enables web components to access environment-specific configuration without hardcoding values.

### When to Use This

Use `customDataForChatApp` when your web component needs:

- **Environment-specific configuration** (API endpoints that differ between dev/staging/prod)
- **Third-party API keys** (Google Maps, weather services, analytics)
- **Feature flags** derived from user permissions
- **User-specific limits or settings**

### How It Works

1. **Auth Provider**: Implements `getCustomDataForChatApp` method to return configuration
2. **Framework**: Calls the method when the chat app layout loads
3. **Web Component**: Accesses the data via `context.chatAppState.customDataForChatApp`

### Example: Using API Keys

**Auth Provider Setup:**

```js
// In your auth provider (apps/pika-chat/src/lib/server/auth-provider/index.ts)
export default class MyAuthProvider extends AuthProvider<MyAuthData, MyCustomData> {
    async getCustomDataForChatApp(user: AuthenticatedUser<MyAuthData, MyCustomData>, chatAppId: string): Promise<Record<string, unknown> | undefined> {
        return {
            weatherApiKey: process.env.WEATHER_API_KEY,
            weatherApiEndpoint: process.env.WEATHER_API_ENDPOINT,
            maxResults: user.userType === 'internal-user' ? 1000 : 100
        };
    }
}
```

**Web Component Usage:**

```js
<svelte:options customElement="weather-widget" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();
    let weatherData = $state<any>(null);
    let loading = $state(false);
    let error = $state<string>('');

    async function init() {
        context = await getPikaContext($host());
    }

    async function fetchWeather(city: string) {
        const customData = context.chatAppState.customDataForChatApp;

        if (!customData) {
            error = 'Configuration not available';
            return;
        }

        loading = true;
        error = '';

        try {
            const response = await fetch(`${customData.weatherApiEndpoint}/weather?city=${city}`, {
                headers: {
                    'Authorization': `Bearer ${customData.weatherApiKey}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch weather');

            weatherData = await response.json();
        } catch (e) {
            error = 'Failed to load weather data';
            console.error('Weather fetch error:', e);
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        init();
    });
</script>

<div class="weather-widget">
    {#if error}
        <p class="error">{error}</p>
    {:else if loading}
        <p>Loading...</p>
    {:else if weatherData}
        <div>
            <h3>{weatherData.city}</h3>
            <p>Temperature: {weatherData.temp}°F</p>
            <p>Condition: {weatherData.condition}</p>
        </div>
    {:else}
        <button onclick={() => fetchWeather('San Francisco')}>
            Get Weather
        </button>
    {/if}
</div>
```

### Example: Type-Safe Access

Define TypeScript interfaces for type-safe access to custom data:

```js
// Define the expected structure
interface WeatherCustomData {
    weatherApiKey: string;
    weatherApiEndpoint: string;
    maxResults: number;
}

// Use in your component with type safety
async function init() {
    context = await getPikaContext($host());

    const customData = context.chatAppState.customDataForChatApp as WeatherCustomData | undefined;

    if (!customData) {
        console.warn('Custom data not available');
        return;
    }

    // Now TypeScript knows the exact structure
    const apiKey: string = customData.weatherApiKey;
    const endpoint: string = customData.weatherApiEndpoint;
    const limit: number = customData.maxResults;
}
```

### Example: Chat App-Specific Configuration

Your auth provider can return different configuration for different chat apps:

```js
// In auth provider
async getCustomDataForChatApp(user: AuthenticatedUser<AuthData, CustomData>, chatAppId: string): Promise<Record<string, unknown> | undefined> {
    if (chatAppId === 'weather-app') {
        return {
            apiKey: process.env.WEATHER_API_KEY,
            apiEndpoint: process.env.WEATHER_API_ENDPOINT,
            defaultLocation: user.customData?.location || 'San Francisco'
        };
    }

    if (chatAppId === 'maps-app') {
        return {
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
            defaultZoom: 12,
            defaultCenter: user.customData?.coordinates || { lat: 37.7749, lng: -122.4194 }
        };
    }

    return undefined;
}
```

### Best Practices

**Always Check for Availability:**

```js
async function init() {
    context = await getPikaContext($host());

    const customData = context.chatAppState.customDataForChatApp;

    if (!customData) {
        // Handle missing data gracefully
        console.warn('Custom configuration not available');
        // Use fallback values or disable features
        return;
    }

    // Proceed with configuration
}
```

**Validate Data:**

```js
function validateCustomData(data: any): data is WeatherCustomData {
    return (
        data &&
        typeof data.weatherApiKey === 'string' &&
        typeof data.weatherApiEndpoint === 'string' &&
        typeof data.maxResults === 'number'
    );
}

async function init() {
    context = await getPikaContext($host());
    const customData = context.chatAppState.customDataForChatApp;

    if (!validateCustomData(customData)) {
        console.error('Invalid custom data structure');
        return;
    }

    // Safe to use with correct types
}
```

**Security Considerations:**

- Custom data is sent to the browser - don't include sensitive secrets
- Use this for configuration, not authentication tokens
- API keys sent to the browser should have appropriate restrictions (IP, referer, rate limits)

:::info[Learn More]
See the [Authentication Guide](/docs/developer/authentication/#custom-chat-app-data-extension-point) for complete details on implementing `getCustomDataForChatApp` in your auth provider.
:::

## Component Values (Persistent Storage)

### Overview

Components can store user-specific data (up to 400KB per component) that persists across sessions:

```js
// Get storage scoped to this component
const storage = context.chatAppState.getUserWidgetDataStoreState('acme', 'my-widget');

// Read value
const favorites = await storage.getValue<string[]>('favorites');

// Write value
await storage.setValue('favorites', ['item1', 'item2']);

// Delete value
await storage.deleteDataForKey('favorites');
```

### Example: Favorite Cities

```js
<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();
    let cities = $state<string[]>([]);
    let loading = $state(true);

    async function init() {
        context = await getPikaContext($host());

        // Load saved cities
        const storage = context.chatAppState.getUserWidgetDataStoreState('acme', 'weather-widget');
        const saved = await storage.getValue<string[]>('cities');
        cities = saved || ['San Francisco', 'New York'];
        loading = false;
    }

    async function addCity(city: string) {
        cities = [...cities, city];

        // Persist to storage
        const storage = context.chatAppState.getUserWidgetDataStoreState('acme', 'weather-widget');
        await storage.setValue('cities', cities);
    }

    async function removeCity(index: number) {
        cities = cities.filter((_, i) => i !== index);

        const storage = context.chatAppState.getUserWidgetDataStoreState('acme', 'weather-widget');
        await storage.setValue('cities', cities);
    }

    $effect(() => {
        init();
    });
</script>

{#if loading}
    <p>Loading...</p>
{:else}
    <ul>
        {#each cities as city, i}
            <li>
                {city}
                <button onclick={() => removeCity(i)}>Remove</button>
            </li>
        {/each}
    </ul>
{/if}
```

## Registering Component Metadata

### Overview

Components can register a title and action buttons with the parent app. The parent renders context-appropriate chrome (title bars, action menus, dialog footers) based on the rendering context.

**Why Use Metadata Registration:**

- Saves space (no need for component to render own title)
- Consistent UI across all widgets
- Context-appropriate presentation (small in spotlight, full in canvas)
- Dynamic updates (change title, enable/disable actions)

### Getting the Metadata API

The metadata API is scoped to your specific component instance:

```js
// Get Pika context
const context = await getPikaContext($host());

// Get scoped metadata API for this widget
const metadata = context.chatAppState.getWidgetMetadataAPI(
    'acme', // scope
    'my-widget', // tag
    context.instanceId,
    context.renderingContext
);

// Register metadata
metadata.setMetadata({
    title: 'My Widget Title',
    iconSvg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
    iconColor: '#0000FF',
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

### WidgetAction Interface

Actions are defined using the `WidgetAction` interface:

```js
interface WidgetAction {
    // Unique identifier for this action
    id: string;

    // Button label (full text for dialog buttons, tooltip for icon buttons)
    title: string;

    // SVG markup string for the icon (get from lucide.dev)
    iconSvg: string;

    // Whether action is disabled (optional, default: false)
    disabled?: boolean;

    // If true, renders prominently in dialog footer (optional, default: false)
    primary?: boolean;

    // Handler function (can be sync or async)
    callback: () => void | Promise<void>;
}
```

### Basic Example: Spotlight Widget

```js
<svelte:options customElement="weather-card" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();
    let weather = $state<any>(null);
    let loading = $state(false);

    async function init() {
        context = await getPikaContext($host());

        // Register metadata with single refresh action
        const metadata = context.chatAppState.getWidgetMetadataAPI(
            'acme',
            'weather-card',
            context.instanceId,
            context.renderingContext
        );

        metadata.setMetadata({
            title: 'Weather',
            iconSvg:
                '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
            iconColor: '#0000FF',
            actions: [
                {
                    id: 'refresh',
                    title: 'Refresh weather data',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
                    callback: async () => {
                        await fetchWeather();
                    }
                }
            ]
        });
    }

    async function fetchWeather() {
        loading = true;
        try {
            weather = await context.chatAppState.invokeAgentAsComponent(
                'acme',
                'weather-card',
                'getWeather',
                'Get current weather for San Francisco'
            );
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        init();
    });
</script>

{#if loading}
    <div class="p-4">Loading...</div>
{:else if weather}
    <div class="p-4">
        <div class="text-2xl font-bold">{weather.tempF}°F</div>
        <div class="text-gray-600">{weather.condition}</div>
    </div>
{:else}
    <div class="p-4">
        <button onclick={fetchWeather}>Load Weather</button>
    </div>
{/if}
```

### Canvas Example: Multiple Actions

```js
<svelte:options customElement="data-viewer" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();
    let data = $state<any[]>([]);
    let view = $state<'grid' | 'list'>('grid');

    async function init() {
        context = await getPikaContext($host());

        // Register metadata with multiple actions
        const metadata = context.chatAppState.getWidgetMetadataAPI(
            'acme',
            'data-viewer',
            context.instanceId,
            context.renderingContext
        );

        metadata.setMetadata({
            title: 'Data Viewer',
            actions: [
                {
                    id: 'refresh',
                    title: 'Refresh data',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
                    callback: async () => {
                        await loadData();
                    }
                },
                {
                    id: 'toggle-view',
                    title: view === 'grid' ? 'Switch to list view' : 'Switch to grid view',
                    iconSvg: view === 'grid'
                        ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>'
                        : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
                    callback: () => {
                        view = view === 'grid' ? 'list' : 'grid';
                        updateViewAction();
                    }
                },
                {
                    id: 'export',
                    title: 'Export data',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
                    callback: async () => {
                        await exportData();
                    }
                }
            ]
        });

        await loadData();
    }

    async function loadData() {
        // Load data logic
    }

    async function exportData() {
        // Export logic
    }

    function updateViewAction() {
        const metadata = context.chatAppState.getWidgetMetadataAPI(
            'acme',
            'data-viewer',
            context.instanceId,
            context.renderingContext
        );

        metadata.updateAction('toggle-view', {
            title: view === 'grid' ? 'Switch to list view' : 'Switch to grid view',
            iconSvg: view === 'grid'
                ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>'
                : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>'
        });
    }

    $effect(() => {
        init();
    });
</script>

<div class="p-4">
    <!-- Render data based on view mode -->
</div>
```

### Dialog Example: Primary Action

For dialog widgets, mark the main action (save, submit, confirm) as `primary: true`:

```js
<svelte:options customElement="settings-dialog" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();
    let settings = $state({ theme: 'light', notifications: true });
    let saving = $state(false);

    async function init() {
        context = await getPikaContext($host());

        // Register dialog metadata with cancel + primary save action
        const metadata = context.chatAppState.getWidgetMetadataAPI(
            'acme',
            'settings-dialog',
            context.instanceId,
            context.renderingContext
        );

        metadata.setMetadata({
            title: 'Settings',
            actions: [
                {
                    id: 'cancel',
                    title: 'Cancel',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
                    callback: () => {
                        context.chatAppState.closeDialog();
                    }
                },
                {
                    id: 'save',
                    title: 'Save Changes',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
                    primary: true,  // Renders prominently in dialog footer
                    callback: async () => {
                        await saveSettings();
                    }
                }
            ]
        });
    }

    async function saveSettings() {
        saving = true;
        const metadata = context.chatAppState.getWidgetMetadataAPI(
            'acme',
            'settings-dialog',
            context.instanceId,
            context.renderingContext
        );

        // Disable save button during save
        metadata.updateAction('save', { disabled: true });

        try {
            // Save logic here
            await new Promise(resolve => setTimeout(resolve, 1000));

            context.appState.showToast('Settings saved successfully', { type: 'success' });
            context.chatAppState.closeDialog();
        } catch (error) {
            context.appState.showToast('Failed to save settings', { type: 'error' });
            metadata.updateAction('save', { disabled: false });
        } finally {
            saving = false;
        }
    }

    $effect(() => {
        init();
    });
</script>

<div class="p-6 space-y-4">
    <div>
        <label>Theme</label>
        <select bind:value={settings.theme}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
        </select>
    </div>
    <div>
        <label>
            <input type="checkbox" bind:checked={settings.notifications} />
            Enable notifications
        </label>
    </div>
</div>
```

### Dynamic Updates

The metadata API provides methods to dynamically update metadata:

#### Update Title

```js
// Change title dynamically
metadata.updateTitle('New Widget Title');
```

#### Update Action Properties

```js
// Disable an action
metadata.updateAction('refresh', { disabled: true });

// Enable an action
metadata.updateAction('refresh', { disabled: false });

// Change action title and icon
metadata.updateAction('toggle-view', {
    title: 'Switch to grid view',
    iconSvg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>'
});
```

#### Add Action

```js
// Add a new action dynamically
metadata.addAction({
    id: 'new-action',
    title: 'Do something',
    iconSvg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
    callback: async () => {
        await doSomething();
    }
});
```

#### Remove Action

```js
// Remove an action by ID
metadata.removeAction('action-id');
```

### Context-Specific Rendering

The parent application renders chrome differently based on context:

- **Spotlight**: Small title bar overlay

    - Title text (from component metadata)
    - Action menu (if 2+ actions) or single button (if 1 action)
    - Action icons are extracted at runtime from the component (via `iconSvg`)

- **Canvas**: Full title bar

    - Title text (from component metadata)
    - Individual action buttons (all visible)
    - Action icons are extracted at runtime from the component (via `iconSvg`)
    - Close button

- **Dialog**: Split chrome

    - Title in dialog header
    - Actions as buttons in dialog footer
    - Primary action rendered prominently (right side, accent color)

- **Inline**: No chrome
    - Component manages its own UI completely

### Action Best Practices

**1. Keep it simple**: Use 1-3 actions

```js
// Good - Clear and focused
actions: [
    {
        id: 'refresh',
        title: 'Refresh data',
        iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
        callback: refresh
    }
]

// Avoid - Too many actions overwhelm users
actions: [
    { id: 'action1', ... },
    { id: 'action2', ... },
    { id: 'action3', ... },
    { id: 'action4', ... },
    { id: 'action5', ... }
]
```

**2. Clear titles**: Be descriptive

```js
// Good
title: 'Refresh weather data';

// Avoid - Too vague
title: 'Refresh';
```

**3. Right icons**: Use appropriate Lucide icons (see section below)

**4. Mark primary actions**: For dialogs, mark save/submit as primary

```js
{
    id: 'save',
    title: 'Save Changes',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    primary: true  // Renders prominently in dialog
}
```

**5. Disable during loading**: Update action state during async operations

```js
async function handleAction() {
    // Disable action
    metadata.updateAction('my-action', { disabled: true });

    try {
        await performAction();
    } finally {
        // Re-enable action
        metadata.updateAction('my-action', { disabled: false });
    }
}
```

**6. Remove conditional actions**: Clean up actions that are no longer relevant

```js
// When switching modes, remove old actions
metadata.removeAction('edit-mode-action');
metadata.addAction({
    id: 'view-mode-action',
    title: 'Enter Edit Mode',
    iconSvg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
    callback: enterEditMode
});
```

### Using Lucide Icons

Icons are provided as SVG strings in the `iconSvg` property. You can get these from [lucide.dev](https://lucide.dev).

**How to Use Icons:**

1. **Find the icon** on [lucide.dev](https://lucide.dev)

2. **Copy the SVG markup** from the icon page

3. **Paste directly in metadata**:

```js
metadata.setMetadata({
    title: 'My Widget',
    iconSvg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
    iconColor: '#0000FF',
    actions: [
        {
            id: 'refresh',
            title: 'Refresh',
            iconSvg:
                '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
            callback: () => refresh()
        }
    ]
});
```

**Common Icons from Lucide:**

Visit [lucide.dev](https://lucide.dev) to find icons. Common ones include:

- `refresh-cw` - Refresh/reload
- `settings` - Settings/configuration
- `download` - Download/export
- `check` - Confirm/save
- `x` - Cancel/close
- `plus` - Add/create
- `trash-2` - Delete/remove
- `search` - Search
- `maximize-2` - Maximize
- `pencil` - Edit

**Tip:** You can store commonly used SVG strings as constants to reuse them across your widgets.

### Troubleshooting

#### Actions don't appear

- Verify you called `setMetadata()` after getting context
- Check browser console for validation warnings
- Ensure `iconSvg` contains valid SVG markup

#### Icon not rendering

- Verify the SVG string is valid and properly formatted
- Check icon exists at [lucide.dev](https://lucide.dev)
- Ensure SVG includes proper namespace: `xmlns="http://www.w3.org/2000/svg"`
- Check browser console for rendering errors

#### Primary action not prominent

- Only works in dialog context
- Verify `primary: true` is set
- Only first primary action is used (warning logged if multiple)

#### Actions don't update

- Ensure you're using the same metadata API instance
- Check that action ID matches exactly
- Verify you're calling update methods after state changes

## Static Context (Bootstrap / Initialization)

### Overview

The **static context** is a special rendering context that allows web components to run initialization code when the chat app loads, **without rendering any visible UI**. This is useful for registering global actions (like title bar buttons), setting up event listeners, or performing other bootstrap tasks.

Note a web component may have static and other visual rendering contexts which means you will need to check what rendering context the web component is running and choose to render or not render any UI accordingly.

**Key Characteristics:**

- No visible UI rendered
- Runs automatically when chat app loads
- Has access to full `PikaWCContext` via `getPikaContext()`
- Can register title bar actions, set up listeners, etc.
- Optional automatic cleanup via `shutDownAfterMs`

**Use Cases:**

- Register custom title bar actions that are always available
- Initialize app-level features or services
- Set up global event listeners
- Perform one-time setup tasks

### How It Works

1. **Tag Definition**: Define a tag with `renderingContexts.static.enabled: true`
2. **Auto-Injection**: Pika creates a hidden DOM element and injects your component
3. **Initialization**: Your component's initialization code runs with full context access
4. **Optional Cleanup**: If `shutDownAfterMs` is specified, the hidden element is removed after that duration

### Basic Example

**Static Context Component:**

```js
<svelte:options customElement={{ tag: 'my-static-init', shadow: 'none' }} />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';

    let context = $state<PikaWCContext>();
    let initialized = $state(false);

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        try {
            // Get Pika context from the hidden DOM element
            context = await getPikaContext($host());
            initialized = true;

            console.log('[My App] Initializing features...');

            // Register a custom title bar action
            context.chatAppState.setOrUpdateCustomTitleBarAction({
                id: 'my-quick-action',
                type: 'action',
                title: 'Quick Action',
                iconSvg: await getIconSvg('zap', 'lucide'),
                callback: async () => {
                    // Open a widget when clicked
                    await context.chatAppState.renderTag('myapp.my-widget', 'canvas');
                }
            });

            console.log('[My App] Initialization complete');
        } catch (error) {
            console.error('[My App] Initialization failed:', error);
        }
    }
</script>

<!--
    This is a static context component - it doesn't render any visible UI.
    It runs initialization code when the chat app loads.
-->
```

**Tag Definition:**

```js
const myStaticInit: TagDefinitionForCreateOrUpdate = {
    tag: 'static-init',
    scope: 'myapp',
    tagTitle: 'My App Initialization',
    description: 'Initializes app features on load',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    usageMode: 'chat-app',
    status: 'enabled',
    renderingContexts: {
        static: {
            enabled: true,
            shutDownAfterMs: 5000  // Optional: clean up after 5 seconds
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'my-static-init',
            s3: {
                s3Key: 'wc/myapp/myapp.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    }
};
```

### Real-World Example: Weather App

The weather sample app uses a static context component to register a quick search button in the title bar:

**Component (`weather-static-init.svelte`):**

```js
<svelte:options customElement={{ tag: 'weather-static-init', shadow: 'none' }} />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';

    let context = $state<PikaWCContext>();
    let initialized = $state(false);

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        try {
            context = await getPikaContext($host());
            initialized = true;

            console.log('[Weather] Initializing weather app features...');

            // Register title bar action for quick weather search
            context.chatAppState.setOrUpdateCustomTitleBarAction({
                id: 'weather-quick-search',
                type: 'action',
                title: 'Quick Weather Search',
                iconSvg: await getIconSvg('search', 'lucide'),
                callback: async () => {
                    await context.chatAppState.renderTag(
                        'weather.quick-weather-search',
                        'canvas'
                    );
                }
            });

            console.log('[Weather] Successfully registered quick search action');
        } catch (error) {
            console.error('[Weather] Initialization failed:', error);
        }
    }
</script>
```

**Tag Definition:**

```js
const weatherStaticInit: TagDefinitionForCreateOrUpdate = {
    tag: 'static-init',
    scope: 'weather',
    tagTitle: 'Weather App Initialization',
    description: 'Initializes weather app features on load',
    status: 'enabled',
    renderingContexts: {
        static: {
            enabled: true,
            shutDownAfterMs: 5000  // Clean up after 5 seconds
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'weather-static-init',
            s3: {
                s3Key: 'wc/weather/weather.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    }
};
```

### Configuration Options

#### StaticContextConfig

```js
interface StaticContextConfig {
    /** Enable static context rendering */
    enabled: boolean;

    /**
     * Optional: Remove the hidden container after this many milliseconds.
     * If not provided, the container stays in the DOM (hidden) indefinitely.
     *
     * Use this when your component only needs to run initialization code
     * and doesn't need to persist afterwards.
     *
     * @example 5000 (remove after 5 seconds)
     */
    shutDownAfterMs?: number;
}
```

**When to use `shutDownAfterMs`:**

- **Use it** when your component only runs initialization code and doesn't need to stay mounted
- **Don't use it** when your component needs to maintain state or respond to events over time
- **Typical value**: 3000-10000ms (3-10 seconds) to ensure initialization completes

### Combining Static with Other Contexts

You can combine static context with other rendering contexts. Use conditional rendering based on `context.renderingContext`:

```js
<svelte:options customElement={{ tag: 'my-widget', shadow: 'none' }} />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';

    let context = $state<PikaWCContext>();
    let initialized = $state(false);

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        const ctx = await getPikaContext($host());
        context = ctx;
        initialized = true;

        // Always run initialization code
        await registerTitleBarAction(ctx);

        // Only load data if rendering visually
        if (ctx.renderingContext !== 'static') {
            await loadData();
        }
    }

    async function registerTitleBarAction(ctx: PikaWCContext) {
        ctx.chatAppState.setOrUpdateCustomTitleBarAction({
            id: 'my-action',
            type: 'action',
            title: 'My Action',
            iconSvg: await getIconSvg('zap', 'lucide'),
            callback: async () => {
                await ctx.chatAppState.renderTag('myapp.my-widget', 'canvas');
            }
        });
    }

    async function loadData() {
        // Load data for visual rendering
    }
</script>

{#if context && context.renderingContext !== 'static'}
    <!-- Render UI only for non-static contexts -->
    <div class="p-4">
        <h2>My Widget</h2>
        <!-- Your UI here -->
    </div>
{/if}
```

**Tag Definition with Multiple Contexts:**

```js
const myWidget: TagDefinitionForCreateOrUpdate = {
    tag: 'my-widget',
    scope: 'myapp',
    // ... other fields ...
    renderingContexts: {
        static: {
            enabled: true,
            shutDownAfterMs: 5000  // Clean up static instance
        },
        canvas: {
            enabled: true
        },
        dialog: {
            enabled: true
        }
    }
    // ... widget config ...
};
```

### Best Practices

**1. Keep It Fast:**

Static init code runs on app load, so keep it lightweight:

```js
// Good - Fast initialization
async function init() {
    context = await getPikaContext($host());

    // Register actions
    context.chatAppState.setOrUpdateCustomTitleBarAction({ ... });

    console.log('Initialized!');
}

// Avoid - Slow initialization that delays app load
async function init() {
    context = await getPikaContext($host());

    // Don't make API calls during init
    const data = await fetch('https://api.example.com/data');  // BAD

    // Don't do heavy computation
    processLargeDataset();  // BAD
}
```

**2. Use Appropriate Cleanup:**

```js
// Component only registers actions (no ongoing work)
renderingContexts: {
    static: {
        enabled: true,
        shutDownAfterMs: 5000  // Clean up after init
    }
}

// Component maintains listeners or state
renderingContexts: {
    static: {
        enabled: true
        // No shutDownAfterMs - keep it mounted
    }
}
```

**3. Error Handling:**

Always wrap initialization in try-catch:

```js
async function init() {
    try {
        context = await getPikaContext($host());

        // Your initialization code here
        await registerFeatures();

        console.log('Initialization successful');
    } catch (error) {
        console.error('Initialization failed:', error);
        // Optionally show user-facing error
        // context?.appState.showToast('Failed to initialize features', { type: 'error' });
    }
}
```

**4. Logging:**

Add console logs to help with debugging:

```js
console.log('[My App] Starting initialization...');
// ... init code ...
console.log('[My App] Successfully registered 3 title bar actions');
```

**5. Cleanup on Unmount:**

If your static component doesn't use `shutDownAfterMs`, clean up when it unmounts:

```js
import { onDestroy } from 'svelte';

onDestroy(() => {
    if (context) {
        // Remove registered actions
        context.chatAppState.removeCustomTitleBarAction('my-action');
        console.log('[My App] Cleaned up on unmount');
    }
});
```

### Use Cases

**1. Register Global Title Bar Actions:**

```js
// Add a "New Search" button to the title bar
context.chatAppState.setOrUpdateCustomTitleBarAction({
    id: 'new-search',
    type: 'action',
    title: 'New Search',
    iconSvg: await getIconSvg('search', 'lucide'),
    callback: async () => {
        await context.chatAppState.renderTag('myapp.search', 'dialog');
    }
});
```

**2. Initialize App-Wide Services:**

```js
// Set up a background sync service
const syncService = new DataSyncService(context);
syncService.start();

// Store reference in widget data for other components to access
const storage = context.chatAppState.getUserWidgetDataStoreState('myapp', 'core');
await storage.setValue('syncService', syncService);
```

**3. Pre-load User Preferences:**

```js
// Load and cache user preferences
const storage = context.chatAppState.getUserWidgetDataStoreState('myapp', 'preferences');
const prefs = (await storage.getValue) < UserPreferences > 'prefs';

if (!prefs) {
    // Set defaults
    await storage.setValue('prefs', {
        theme: 'light',
        notifications: true
    });
}
```

**4. Register Event Listeners:**

```js
// Listen for app-wide events
context.chatAppState.addEventListener('session-changed', () => {
    console.log('Session changed - refresh widgets');
    // Notify other components or refresh data
});
```

### Troubleshooting

**Component doesn't run:**

- Verify `static.enabled: true` in tag definition
- Check that tag definition is properly deployed to DynamoDB
- Check browser console for errors during injection

**`getPikaContext()` fails:**

- Ensure you're calling it with `$host()` in Svelte: `getPikaContext($host())`
- Check that the component is properly mounted (even though hidden)

**Actions not appearing:**

- Verify the static component ran (check console logs)
- Ensure no JavaScript errors in the init code
- Check that icon SVG is valid

**Memory concerns:**

- Use `shutDownAfterMs` if your component doesn't need to stay mounted
- Clean up event listeners in `onDestroy()` if not using `shutDownAfterMs`

## Custom Chat App Toolbar Actions

### Overview

Web components can add custom icon buttons to the main chat app toolbar (the top bar of the entire chat application, not widget-specific chrome). These actions appear alongside system actions and are available to users regardless of which context your component is rendered in.

**Use Cases:**

- Global actions that should always be accessible (e.g., "New Search", "Settings", "Help")
- Cross-component functionality (e.g., "Export All", "Sync Data")
- Quick access to common workflows

**Two Types of Actions:**

1. **Single Action Button** - Clicking immediately invokes a callback
2. **Menu Button** - Clicking opens a dropdown menu with multiple actions

### Single Action Button

Add a simple icon button that performs an action when clicked:

```js
<svelte:options customElement="my-widget" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();

    async function init() {
        context = await getPikaContext($host());

        // Add a single action button to the chat app toolbar
        context.chatAppState.setOrUpdateCustomTitleBarAction({
            id: 'refresh-all',
            type: 'action',
            title: 'Refresh all data',
            iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
            callback: async () => {
                await refreshAllData();
            }
        });
    }

    async function refreshAllData() {
        // Refresh logic here
        console.log('Refreshing all data...');
    }

    $effect(() => {
        init();
    });
</script>

<div class="p-4">
    <!-- Your component content -->
</div>
```

### Menu Button

Add a button that opens a menu with multiple actions:

```js
<svelte:options customElement="my-widget" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();

    async function init() {
        context = await getPikaContext($host());

        // Add a menu button to the chat app toolbar
        context.chatAppState.setOrUpdateCustomTitleBarAction({
            id: 'widget-menu',
            title: 'Widget actions',
            iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
            actions: [
                {
                    type: 'action',
                    id: 'refresh',
                    title: 'Refresh data',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
                    callback: async () => {
                        await refreshData();
                    }
                },
                'separator',
                {
                    type: 'action',
                    id: 'export',
                    title: 'Export to CSV',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
                    callback: async () => {
                        await exportData();
                    }
                },
                {
                    type: 'action',
                    id: 'settings',
                    title: 'Settings',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
                    callback: () => {
                        openSettings();
                    }
                }
            ]
        });
    }

    async function refreshData() {
        console.log('Refreshing...');
    }

    async function exportData() {
        console.log('Exporting...');
    }

    function openSettings() {
        console.log('Opening settings...');
    }

    $effect(() => {
        init();
    });
</script>

<div class="p-4">
    <!-- Your component content -->
</div>
```

### Menu with Action Groups

Organize menu items into titled groups:

```js
context.chatAppState.setOrUpdateCustomTitleBarAction({
    id: 'data-menu',
    title: 'Data operations',
    iconSvg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>',
    actions: [
        {
            type: 'group',
            title: 'Import/Export',
            actions: [
                {
                    type: 'action',
                    id: 'import',
                    title: 'Import data',
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',
                    callback: async () => {
                        await importData();
                    }
                },
                {
                    type: 'action',
                    id: 'export',
                    title: 'Export data',
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
                    callback: async () => {
                        await exportData();
                    }
                }
            ]
        },
        'separator',
        {
            type: 'group',
            title: 'Maintenance',
            actions: [
                {
                    type: 'action',
                    id: 'clear-cache',
                    title: 'Clear cache',
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
                    callback: async () => {
                        await clearCache();
                    }
                },
                {
                    type: 'action',
                    id: 'reset',
                    title: 'Reset to defaults',
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
                    callback: async () => {
                        await resetToDefaults();
                    }
                }
            ]
        }
    ]
});
```

### API Reference

#### setOrUpdateCustomTitleBarAction()

Add or update a custom toolbar action. If an action with the same ID exists, it will be updated; otherwise, a new action will be added.

**Signature:**

```js
context.chatAppState.setOrUpdateCustomTitleBarAction(
    action: ChatAppActionMenu | ChatAppAction
): void
```

**Parameters:**

- `action` - Either a single action button or a menu button (see types below)

**Single Action Button Type (`ChatAppAction`):**

```js
interface ChatAppAction {
    /** Unique identifier for this action */
    id: string;

    /** Discriminator for the type */
    type: 'action';

    /** Tooltip text shown on hover */
    title: string;

    /** SVG markup string for the icon */
    iconSvg: string;

    /** Whether action is currently disabled (optional) */
    disabled?: boolean;

    /** Handler function called when clicked */
    callback: () => void | Promise<void>;
}
```

**Menu Button Type (`ChatAppActionMenu`):**

```js
interface ChatAppActionMenu {
    /** Unique identifier for this action menu */
    id: string;

    /** Tooltip text shown on hover */
    title: string;

    /** SVG markup string for the icon */
    iconSvg: string;

    /** Whether the menu button is currently disabled (optional) */
    disabled?: boolean;

    /** Array of menu items (actions, groups, or separators) */
    actions: ChatAppActionMenuElements[];
}
```

**Action Group Type (`ChatAppActionGroup`):**

```js
interface ChatAppActionGroup {
    /** Discriminator for the type */
    type: 'group';

    /** Title displayed above the group in the menu */
    title: string;

    /** Actions to display in this group */
    actions: (ChatAppAction | 'separator')[];
}
```

**Menu Elements:**

```js
type ChatAppActionMenuElements = ChatAppActionGroup | ChatAppAction | 'separator';
```

#### removeCustomTitleBarAction()

Remove a custom toolbar action by its ID.

**Signature:**

```js
context.chatAppState.removeCustomTitleBarAction(actionId: string): void
```

**Parameters:**

- `actionId` - The unique ID of the action to remove

**Example:**

```js
// Remove an action
context.chatAppState.removeCustomTitleBarAction('my-action');
```

### Dynamic Updates

#### Updating Actions

To update an existing action, call `setOrUpdateCustomTitleBarAction()` again with the same ID:

```js
let refreshing = $state(false);

async function startRefresh() {
    refreshing = true;

    // Disable the action while refreshing
    context.chatAppState.setOrUpdateCustomTitleBarAction({
        id: 'refresh',
        type: 'action',
        title: 'Refreshing...',
        iconSvg:
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
        disabled: true,
        callback: async () => {
            await refreshData();
        }
    });

    try {
        await refreshData();
    } finally {
        refreshing = false;

        // Re-enable the action
        context.chatAppState.setOrUpdateCustomTitleBarAction({
            id: 'refresh',
            type: 'action',
            title: 'Refresh data',
            iconSvg:
                '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
            disabled: false,
            callback: async () => {
                await startRefresh();
            }
        });
    }
}
```

#### Conditional Actions

Add or remove actions based on component state:

```js
let editMode = $state(false);

function toggleEditMode() {
    editMode = !editMode;

    if (editMode) {
        // Add save/cancel actions when entering edit mode
        context.chatAppState.setOrUpdateCustomTitleBarAction({
            id: 'edit-actions',
            title: 'Edit mode actions',
            iconSvg:
                '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
            actions: [
                {
                    type: 'action',
                    id: 'save',
                    title: 'Save changes',
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
                    callback: async () => {
                        await saveChanges();
                        toggleEditMode();
                    }
                },
                {
                    type: 'action',
                    id: 'cancel',
                    title: 'Cancel',
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
                    callback: () => {
                        toggleEditMode();
                    }
                }
            ]
        });
    } else {
        // Remove edit actions when exiting edit mode
        context.chatAppState.removeCustomTitleBarAction('edit-actions');
    }
}
```

### Real-World Examples

#### Example 1: Weather Widget with Quick Search

```js
<svelte:options customElement="weather-widget" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();
    let cities = $state<string[]>(['San Francisco', 'New York', 'London']);

    async function init() {
        context = await getPikaContext($host());

        // Add a menu with city management actions
        context.chatAppState.setOrUpdateCustomTitleBarAction({
            id: 'weather-menu',
            title: 'Weather actions',
            iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>',
            actions: [
                {
                    type: 'action',
                    id: 'add-city',
                    title: 'Add city',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
                    callback: () => {
                        promptAddCity();
                    }
                },
                {
                    type: 'action',
                    id: 'refresh-all',
                    title: 'Refresh all cities',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
                    callback: async () => {
                        await refreshAllCities();
                    }
                },
                'separator',
                {
                    type: 'action',
                    id: 'settings',
                    title: 'Weather settings',
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
                    callback: () => {
                        openSettings();
                    }
                }
            ]
        });
    }

    function promptAddCity() {
        // Show dialog to add city
        context.chatAppState.renderTag('weather.city-selector', 'dialog');
    }

    async function refreshAllCities() {
        // Refresh all cities
        context.appState.showToast('Refreshing all cities...', { type: 'info' });
    }

    function openSettings() {
        // Open settings dialog
        context.chatAppState.renderTag('weather.settings', 'dialog');
    }

    $effect(() => {
        init();
    });
</script>

<div class="p-4">
    {#each cities as city}
        <div class="city-card">{city}</div>
    {/each}
</div>
```

#### Example 2: Data Dashboard with Export

```js
<svelte:options customElement="data-dashboard" />

<script lang="ts">
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';

    let context = $state<PikaWCContext>();
    let exporting = $state(false);

    async function init() {
        context = await getPikaContext($host());

        // Add a single export action
        context.chatAppState.setOrUpdateCustomTitleBarAction({
            id: 'export',
            type: 'action',
            title: 'Export dashboard data',
            iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
            callback: async () => {
                await exportDashboard();
            }
        });
    }

    async function exportDashboard() {
        exporting = true;

        // Disable the button while exporting
        context.chatAppState.setOrUpdateCustomTitleBarAction({
            id: 'export',
            type: 'action',
            title: 'Exporting...',
            iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
            disabled: true,
            callback: async () => {
                await exportDashboard();
            }
        });

        try {
            // Export logic here
            await new Promise((resolve) => setTimeout(resolve, 2000));

            context.appState.showToast('Dashboard exported successfully', { type: 'success' });
        } catch (error) {
            context.appState.showToast('Export failed', { type: 'error' });
        } finally {
            exporting = false;

            // Re-enable the button
            context.chatAppState.setOrUpdateCustomTitleBarAction({
                id: 'export',
                type: 'action',
                title: 'Export dashboard data',
                iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
                disabled: false,
                callback: async () => {
                    await exportDashboard();
                }
            });
        }
    }

    $effect(() => {
        init();
    });
</script>

<div class="p-4">
    <h2>Dashboard</h2>
    <!-- Dashboard content -->
</div>
```

### Best Practices

**1. Use Unique IDs:**

```js
// Good - Scoped with component prefix
id: 'weather-widget-refresh';

// Avoid - Generic ID might conflict with other components
id: 'refresh';
```

**2. Keep Menus Focused:**

```js
// Good - 3-5 related actions
actions: [action1, 'separator', action2, action3];

// Avoid - Too many unrelated actions
actions: [
    /* 15 different actions */
];
```

**3. Use Descriptive Titles:**

```js
// Good - Clear and specific
title: 'Export all weather data to CSV';

// Avoid - Too vague
title: 'Export';
```

**4. Clean Up on Unmount:**

If your component is removed or context changes, clean up your actions:

```js
import { onDestroy } from 'svelte';

onDestroy(() => {
    if (context) {
        context.chatAppState.removeCustomTitleBarAction('my-action');
    }
});
```

**5. Provide Visual Feedback:**

Disable actions during async operations and show toast notifications:

```js
async function performAction() {
    // Disable
    context.chatAppState.setOrUpdateCustomTitleBarAction({
        id: 'my-action',
        type: 'action',
        title: 'Processing...',
        iconSvg: '...',
        disabled: true,
        callback: performAction
    });

    try {
        await doWork();
        context.appState.showToast('Success!', { type: 'success' });
    } finally {
        // Re-enable
        context.chatAppState.setOrUpdateCustomTitleBarAction({
            id: 'my-action',
            type: 'action',
            title: 'Do work',
            iconSvg: '...',
            disabled: false,
            callback: performAction
        });
    }
}
```

**6. Consider Component Lifecycle:**

Only add toolbar actions when your component is in a context where they make sense:

```js
async function init() {
    context = await getPikaContext($host());

    // Only add global actions for canvas or spotlight views
    if (context.renderingContext === 'canvas' || context.renderingContext === 'spotlight') {
        context.chatAppState.setOrUpdateCustomTitleBarAction({
            // ... action definition
        });
    }
}
```

**7. Use Action Groups for Organization:**

When you have many related actions, use groups to keep the menu organized:

```js
// Good - Grouped by category
actions: [
    {
        type: 'group',
        title: 'Data',
        actions: [
            /* data actions */
        ]
    },
    'separator',
    {
        type: 'group',
        title: 'View',
        actions: [
            /* view actions */
        ]
    }
];
```

### Troubleshooting

#### Action doesn't appear

- Verify you called `setOrUpdateCustomTitleBarAction()` after getting context
- Check browser console for errors
- Ensure `iconSvg` contains valid SVG markup
- Verify the action ID is unique

#### Icon not rendering

- Verify the SVG string is valid and properly formatted
- Check icon exists at [lucide.dev](https://lucide.dev)
- Ensure SVG includes proper namespace: `xmlns="http://www.w3.org/2000/svg"`

#### Menu doesn't open

- Ensure you're passing an `actions` array (not just a single action)
- Check that each menu item has the correct structure
- Verify `type: 'action'` is set for each action in the menu

#### Action callback not firing

- Check browser console for JavaScript errors
- Verify the callback function is defined and accessible
- Ensure the action is not disabled

## Best Practices

### Error Handling

```js
try {
    const context = await getPikaContext($host());
    // ... use context
} catch (error) {
    console.error('Failed to get Pika context:', error);
    // Show error to user
    this.innerHTML = '<p>Failed to load widget</p>';
}
```

### Loading States

Always show clear loading feedback:

```js
let loading = $state(false);
let error = $state('');

{#if loading}
    <div class="loading">Loading...</div>
{:else if error}
    <div class="error">{error}</div>
{:else}
    <!-- Your content -->
{/if}
```

### Context Checking

Always verify context before using it:

```js
async function doSomething() {
    if (!context) {
        console.error('Context not initialized');
        return;
    }
    // Use context safely
}
```

## Next Steps

- [Deploying Web Components](/docs/developer/deploying-web-components) - Deploy your widgets to production
- [pika-ux Module](/docs/developer/pika-ux-module) - Explore available UI components
- [Tags Feature](/docs/developer/tags-feature) - Understand tag definition management
- [Web Components Overview](/docs/features/web-components) - Learn about rendering contexts
