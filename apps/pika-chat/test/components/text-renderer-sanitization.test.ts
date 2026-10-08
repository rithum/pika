/**
 * text-renderer.svelte must route its markdown-rendered HTML through sanitizeChatHtml before
 * assigning innerHTML. Mounts the real component, so it proves the sink itself is closed.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import TextRenderer from '../../src/lib/client/features/chat/message-segments/default-components/text-renderer.svelte';
import type { ProcessedTextSegment } from '../../src/lib/client/features/chat/message-segments/segment-types';

function textSegment(rawContent: string): ProcessedTextSegment {
    return {
        id: 1,
        segmentType: 'text',
        rawContent,
        streamingStatus: 'completed',
    } as ProcessedTextSegment;
}

function mount(rawContent: string): HTMLElement {
    const { container } = render(TextRenderer, {
        props: { segment: textSegment(rawContent), appState: {} as never },
    });
    flushSync();
    const host = container.querySelector('.markdown-content');
    if (!(host instanceof HTMLElement)) {
        throw new Error('text-renderer did not render its .markdown-content host');
    }
    return host;
}

describe('text-renderer.svelte — the markdown sink is sanitized', () => {
    it('does not inject <script> from a malicious assistant message', () => {
        const host = mount('Hello <script>alert(1)</script> world');
        expect(host.querySelector('script')).toBeNull();
    });

    it('strips on* handlers and javascript: URIs that reach the sink', () => {
        const host = mount('<img src="x" onerror="alert(1)"> <a href="javascript:alert(1)">x</a>');
        expect(host.innerHTML).not.toMatch(/onerror/i);
        expect(host.innerHTML).not.toMatch(/javascript:/i);
    });

    it('renders ordinary markdown intact', () => {
        const host = mount('This is **bold** and `code`.');
        expect(host.querySelector('strong')).not.toBeNull();
        expect(host.querySelector('code')).not.toBeNull();
    });

    it('drops custom elements that are not registered in the allow-list', () => {
        const host = mount('<x-sample-widget sample-id="abc-123"></x-sample-widget>');
        expect(host.querySelector('x-sample-widget')).toBeNull();
    });
});
