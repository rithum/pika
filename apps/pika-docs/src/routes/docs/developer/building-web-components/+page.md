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
    // ... other fields
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
