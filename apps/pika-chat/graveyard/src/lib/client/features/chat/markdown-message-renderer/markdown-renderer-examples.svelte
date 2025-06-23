<script lang="ts">
    import MarkdownMessageRenderer from './markdown-message-renderer.svelte';

    // Example 1: Static message with various markdown features and tags
    const staticMessage = `
## Weather Report for New York

Today's weather is **partly cloudy** with a high of 75°F.

### Temperature Forecast

<chart>{"type":"line","data":{"labels":["6AM","9AM","12PM","3PM","6PM","9PM"],"datasets":[{"label":"Temperature (°F)","data":[65,68,75,74,70,66],"borderColor":"rgb(75, 192, 192)","tension":0.1}]}}</chart>

### Satellite Image

<image>https://example.com/weather-satellite.jpg</image>

### What You Can Ask

<prompt>What's the humidity level today?</prompt>
<prompt>Show me the weekend forecast</prompt>
<prompt>Compare today's weather with yesterday</prompt>

---

*Last updated: ${new Date().toLocaleTimeString()}*
`;

    // Example 2: Simulating streaming content
    let streamingMessage = $state('');
    let isStreaming = $state(false);

    // Simulate streaming chunks
    const messageChunks = [
        '## Live Weather Update\n\nFetching current conditions',
        '...\n\n**Temperature:** 72°F\n**Humidity:** 65%\n\n',
        "Here's the current radar:\n\n<ima",
        'ge>https://example.com/radar.gif</image>\n\n',
        'You can ask me:\n\n<prompt>Will it rain today?</prompt>',
    ];

    async function simulateStreaming() {
        isStreaming = true;
        streamingMessage = '';

        for (const chunk of messageChunks) {
            streamingMessage += chunk;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        isStreaming = false;
    }

    // Example 3: Message with error handling
    const messageWithErrors = `
## Chart with Invalid JSON

This chart has invalid JSON and will show an error:

<chart>{"type":"line","data":{invalid json here}}</chart>

This image URL doesn't exist:

<image>https://invalid-domain-12345.com/image.jpg</image>

But the rest of the message renders fine!
`;
</script>

<div class="space-y-8 p-6">
    <section>
        <h2 class="text-2xl font-bold mb-4">Example 1: Static Message</h2>
        <div class="bg-gray-50 rounded-lg p-4">
            <MarkdownMessageRenderer message={staticMessage} files={[]} />
        </div>
    </section>

    <section>
        <h2 class="text-2xl font-bold mb-4">Example 2: Streaming Message</h2>
        <button onclick={simulateStreaming} class="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Start Streaming Demo
        </button>
        <div class="bg-gray-50 rounded-lg p-4 min-h-[200px]">
            <MarkdownMessageRenderer message={streamingMessage} {isStreaming} files={[]} />
        </div>
    </section>

    <section>
        <h2 class="text-2xl font-bold mb-4">Example 3: Error Handling</h2>
        <div class="bg-gray-50 rounded-lg p-4">
            <MarkdownMessageRenderer message={messageWithErrors} files={[]} />
        </div>
    </section>
</div>

<style>
    /* Example styles */
    section {
        @apply border-b border-gray-200 pb-8 last:border-0;
    }
</style>
