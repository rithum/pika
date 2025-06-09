# Markdown to HTML Generator with Custom Tags

This system converts markdown content (both streaming and static) into HTML while supporting custom XML-like tags that get replaced with Svelte components.

## Features

- **Markdown parsing** using `markdown-it`
- **Streaming support** for real-time content from LLMs
- **Custom tag handling** with placeholders during streaming
- **Svelte 5 component integration**
- **Graceful handling of incomplete tags** during streaming

## Supported Tags

### `<prompt>` - Interactive prompts
Renders clickable suggestion buttons for follow-up questions.

```xml
<prompt>What's the weather tomorrow?</prompt>
```

### `<chart>` - Data visualizations
Renders Chart.js charts from JSON configuration.

```xml
<chart>{"type":"line","data":{"labels":["Mon","Tue"],"datasets":[{"label":"Temp","data":[72,75]}]}}</chart>
```

### `<image>` - Images
Displays images with loading states and error handling.

```xml
<image>https://example.com/weather-map.jpg</image>
```

### `<chat>` - Chat subcomponents
Renders chat-specific UI elements.

```xml
<chat>This is a chat subcomponent</chat>
```

## Usage

### In your Svelte component:

```svelte
<script lang="ts">
    import MarkdownMessageRenderer from './markdown-message-renderer.svelte';
    
    // For static content
    let message = "## Hello\n\nThis is **markdown** with a <prompt>Click me</prompt>";
    
    // For streaming content
    let streamingMessage = $state("");
    let isStreaming = $state(true);
</script>

<!-- Static rendering -->
<MarkdownMessageRenderer message={message} />

<!-- Streaming rendering -->
<MarkdownMessageRenderer message={streamingMessage} isStreaming={true} />
```

### Direct API usage:

```typescript
import { MarkdownToHtmlGenerator, StreamingMarkdownProcessor } from './md-to-html-generator';

// Static processing
const generator = new MarkdownToHtmlGenerator();
const result = generator.parseMarkdown("# Hello **world**");
const html = generator.combineSegments(result.segments);

// Streaming processing
const processor = new StreamingMarkdownProcessor();
const chunk1Result = processor.processChunk("# Hello ");
const chunk2Result = processor.processChunk("**world**");
const finalResult = processor.finalize();
```

## How It Works

### Streaming Mode

1. Content arrives in chunks
2. Each chunk is processed to extract complete tags
3. Incomplete tags are buffered until complete
4. Complete tags show loading placeholders
5. Once a tag is complete, the placeholder is replaced with the Svelte component using Svelte 5's `mount()` API

### Static Mode

1. All content is processed at once
2. Tags are immediately replaced with their components
3. No placeholders needed

## Architecture

```
md-to-html-generator.ts          # Core parsing logic (uses Svelte 5 mount API)
markdown-message-renderer.svelte  # Svelte wrapper component (imports all tag components)
markdown-tag-components/         # Tag component implementations
  ├── prompt.svelte
  ├── chart.svelte
  ├── image.svelte
  └── chat.svelte
```

## Adding New Tags

1. Add the tag name to `SUPPORTED_TAGS` in `md-to-html-generator.ts`
2. Create a new component in `markdown-tag-components/[tagname].svelte`
3. The component will receive `rawTagContent` prop with the tag's inner content

Example component:
```svelte
<script lang="ts">
    interface Props {
        rawTagContent: string;
    }
    
    let { rawTagContent }: Props = $props();
</script>

<div>
    <!-- Your component implementation -->
    {rawTagContent}
</div>
```

## Testing

Run the test file to see examples:
```bash
node md-to-html-generator.test.ts
```

## Notes

- Uses Svelte 5 syntax (`$props()`, `$state()`, `mount()`, etc.)
- Chart.js is dynamically imported for better performance
- Tag components are statically imported for better type safety and bundling
- Uses Svelte 5's imperative `mount()` API to mount components in placeholders
- Handles malformed JSON gracefully with error states
