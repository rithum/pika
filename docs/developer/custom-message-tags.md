# Custom Message Tags Guide

This guide explains how to create custom renderers for XML tags in LLM responses and metadata handlers for processing non-visual tags in your Pika chat application.

## Overview

When an LLM generates responses containing XML elements (e.g., `<image>`, `<download>`, `<chart>`), Pika's message rendering system uses the XML tag name to find and instantiate the appropriate renderer component. This system allows you to create rich, interactive chat experiences with custom UI components and data processing.

With custom message tags, you can create rich, interactive chat experiences that go far beyond simple text responses. The system is designed to be flexible and extensible, allowing you to build exactly the user experience your application needs.

## How It Works

### Message Processing Flow

1. **LLM Response**: The LLM generates a response with XML tags
2. **Parsing**: The message is parsed to identify XML segments
3. **Tag Identification**: Each XML tag is mapped to a renderer or metadata handler
4. **Rendering**: Tag renderers create UI components, metadata handlers call your custom function to cause some side effect
5. **Display**: The final message is rendered with all components in place

### Example LLM Response

```
<trace>{"id": "trace-123", "duration": 1.5, "tokens": 145}</trace>
Here's the weather data you requested:

<chart>{"type": "bar", "data": {"labels": ["Mon", "Tue", "Wed"], "datasets": [{"data": [20, 25, 22]}]}}</chart>

And here's the detailed report:

<download>{"s3Key": "reports/weather-2024.pdf", "title": "Weather Report"}</download>
```

In this example:

- `<chart>` renders an interactive chart component
- `<download>` creates a download button
- `<trace>` is processed by a metadata handler (doesn't render visually)

## Custom Renderers

### Defining Custom Renderers

Custom renderers are registered in `apps/pika-chat/src/lib/client/features/chat/message-segments/custom-components/index.ts`:

```typescript
import type { Component } from 'svelte';
import MyCustomRenderer from './MyCustomRenderer.svelte';

export const customRenderers: Record<string, Component<any>> = {
    // Add your custom tag renderers here
    mywidget: MyCustomRenderer,
    datatable: DataTableRenderer,
    'interactive-form': InteractiveFormRenderer
};
```

### Renderer Component Interface

Each renderer component must accept these props:

```typescript
interface Props {
    segment: ProcessedTagSegment;
    appState: AppState;
    chatAppState: ChatAppState;
}
```

#### ProcessedTagSegment Properties

- `rawContent: string` - The text content between XML tags
- `streamingStatus: 'pending' | 'completed' | 'error'` - Current streaming state
- `id: string` - Unique identifier for this segment
- `tagType: string` - The XML tag name (e.g., 'chart', 'image')

#### Key Considerations

- **Streaming Support**: Handle the `streamingStatus` to show loading states while content is being received
- **Error Handling**: Gracefully handle malformed content or parsing errors
- **JSON Parsing**: Many tags contain JSON data that needs to be parsed
- **Responsive Design**: Ensure components work on different screen sizes

### Example: Custom Data Table Renderer

```svelte
<!-- DataTableRenderer.svelte -->
<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import { ChatAppState } from '../../chat-app.state.svelte';
    import type { ProcessedTagSegment } from '../segment-types';

    interface Props {
        segment: ProcessedTagSegment;
        appState: AppState;
        chatAppState: ChatAppState;
    }

    let { segment }: Props = $props();

    let rawTagContent = $derived(segment.rawContent);
    let showPlaceholder = $derived(segment.streamingStatus === 'pending');
    let error = $state<string | null>(null);
    let tableData = $state<{headers: string[], rows: string[][]} | null>(null);

    $effect(() => {
        if (showPlaceholder) return;

        try {
            const parsed = JSON.parse(rawTagContent);
            if (!parsed.headers || !parsed.rows) {
                error = 'Invalid table data format';
                return;
            }
            tableData = parsed;
            error = null;
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to parse table data';
        }
    });
</script>

<div class="my-4">
    {#if showPlaceholder}
        <div class="animate-pulse bg-gray-100 rounded-lg p-4 text-center text-gray-500">
            Loading table...
        </div>
    {:else if error}
        <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <p class="font-semibold">Table Error</p>
            <p class="text-sm">{error}</p>
        </div>
    {:else if tableData}
        <div class="overflow-x-auto bg-white rounded-lg shadow">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        {#each tableData.headers as header}
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {header}
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    {#each tableData.rows as row}
                        <tr>
                            {#each row as cell}
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {cell}
                                </td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
```

Register it in `index.ts`:

```typescript
import DataTableRenderer from './DataTableRenderer.svelte';

export const customRenderers: Record<string, Component<any>> = {
    datatable: DataTableRenderer
};
```

Usage in LLM response:

```
Here's your sales data:

<datatable>{"headers": ["Product", "Sales", "Revenue"], "rows": [["Widget A", "150", "$1,500"], ["Widget B", "200", "$2,000"]]}</datatable>
```

## Metadata Handlers

Metadata handlers process XML tags that don't render visually but perform side effects like adding data to the message or triggering actions.

### Defining Metadata Handlers

```typescript
import type { MetadataTagHandler } from '../segment-types';

export const customMetadataHandlers: Record<string, MetadataTagHandler> = {
    analytics: analyticsHandler,
    notification: notificationHandler
};
```

### Metadata Handler Interface

```typescript
type MetadataTagHandler = (segment: MetadataTagSegment, message: ChatMessageForRendering, chatAppState: ChatAppState, appState: AppState) => void;
```

### Example: Analytics Metadata Handler

```typescript
// analytics-handler.ts
import type { MetadataTagHandler } from '../segment-types';

export const analyticsHandler: MetadataTagHandler = (segment, message, chatAppState, appState) => {
    // Only process completed segments to avoid duplicate processing
    if (segment.streamingStatus !== 'completed') return;

    try {
        const analyticsData = JSON.parse(segment.rawContent);

        // Add analytics data to the message
        if (!message.metadata) {
            message.metadata = {};
        }
        message.metadata.analytics = analyticsData;

        // Trigger analytics tracking
        if (analyticsData.event && analyticsData.properties) {
            // Send to your analytics service
            trackEvent(analyticsData.event, analyticsData.properties);
        }
    } catch (error) {
        console.error('Failed to process analytics metadata', error);
    }
};

function trackEvent(event: string, properties: any) {
    // Your analytics implementation
    console.log('Analytics event:', event, properties);
}
```

Register the handler:

```typescript
import { analyticsHandler } from './analytics-handler';

export const customMetadataHandlers: Record<string, MetadataTagHandler> = {
    analytics: analyticsHandler
};
```

Usage in LLM response:

```
I've processed your request successfully.

<analytics>{"event": "query_processed", "properties": {"type": "data_analysis", "duration": 2.5, "tokens": 250}}</analytics>
```

## Built-in Examples

### Default Renderers

Pika includes several built-in renderers you can reference:

#### Image Renderer (`image`)

- **Purpose**: Displays images from URLs
- **Content**: Image URL as plain text
- **Features**: Loading states, error handling, responsive sizing

#### Download Renderer (`download`)

- **Purpose**: Creates download buttons for files
- **Content**: JSON with `s3Key` and optional `title`
- **Features**: File download integration, S3 support

#### Chart Renderer (`chart`)

- **Purpose**: Renders Chart.js charts
- **Content**: Chart.js configuration JSON
- **Features**: Dynamic chart loading, responsive design

#### Prompt Renderer (`prompt`)

- **Purpose**: Creates clickable prompt buttons
- **Content**: Prompt text or JSON configuration
- **Features**: Click-to-send functionality

### Default Metadata Handlers

#### Trace Handler (`trace`)

- **Purpose**: Adds execution traces to messages
- **Content**: JSON with trace information
- **Effect**: Adds trace data to message.traces array for display at message top

## Advanced Patterns

### Interactive Components

Create components that can send new messages:

```svelte
<script lang="ts">
    let { segment, chatAppState }: Props = $props();

    function handleButtonClick(action: string) {
        chatAppState.sendMessage(`Execute action: ${action}`);
    }
</script>

<div class="space-x-2">
    <button onclick={() => handleButtonClick('approve')} class="bg-green-500 text-white px-4 py-2 rounded">
        Approve
    </button>
    <button onclick={() => handleButtonClick('reject')} class="bg-red-500 text-white px-4 py-2 rounded">
        Reject
    </button>
</div>
```

### State Management

Share state between renderers using the app state:

```svelte
<script lang="ts">
    let { segment, appState }: Props = $props();

    // Access global state
    let userPreferences = $derived(appState.user?.preferences);

    // Update app state
    function updatePreferences(newPrefs: any) {
        if (appState.user) {
            appState.user.preferences = { ...appState.user.preferences, ...newPrefs };
        }
    }
</script>
```

## Text Renderer Override

You can override the default text renderer to customize how all non-XML content is displayed:

```typescript
export const customRenderers: Record<string, Component<any>> = {
    text: MyCustomTextRenderer
};
```

This affects all text content in messages, not just XML tags.

## Best Practices

### 1. Handle Streaming States

Always check `streamingStatus` and provide appropriate loading states:

- **pending**: the content is still streaming and isn't done
- **complete**: the content is done streaming
- **error**: something broke when streaming the content

```svelte
{#if segment.streamingStatus === 'pending'}
    <div class="animate-pulse">Loading...</div>
{:else}
    <!-- Render actual content -->
{/if}
```

### 2. Error Handling

Gracefully handle malformed content (consider that if streamingStatus is 'pending' then your content will be incomplete and if JSON will be malformed until complete):

```typescript
$effect(() => {
    try {
        const data = JSON.parse(rawTagContent);
        // Process data
    } catch (error) {
        console.error('Parse error:', error);
        errorMessage = 'Invalid data format';
    }
});
```

### 3. Responsive Design

Ensure components work on all screen sizes:

```svelte
<div class="overflow-x-auto max-w-full">
    <!-- Your content -->
</div>
```

### 4. Unique IDs

Use segment.id for unique component identification:

```svelte
<div id="component-{segment.id}">
    <!-- Your content -->
</div>
```

### 5. Resource Cleanup

Clean up resources when components are destroyed:

```svelte
<script lang="ts">
    let chart: any = null;

    $effect(() => {
        // Initialize chart
        return () => {
            if (chart) {
                chart.destroy();
            }
        };
    });
</script>
```

### Debugging

Enable debug logging to see tag processing:

```typescript
console.log('Processing tag:', segment.tagType, segment.rawContent);
```

## Examples Repository

For more examples and starter templates, check the `apps/pika-chat/src/lib/client/features/chat/message-segments/default-components/` directory, which contains the built-in renderers you can use as reference implementations.
