import { describe, expect, it, jest } from '@jest/globals';
import { MessageSegmentProcessor } from '../src/lib/client/features/chat/message-segments/segment-processor';
import type { ComponentRegistry } from '../src/lib/client/features/chat/message-segments/component-registry';
import type { ProcessedSegment } from '../src/lib/client/features/chat/message-segments/segment-types';
import { visibleTextFromSegments } from '../src/lib/client/features/chat/message-segments/visible-text';
import type { MessageSegment } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * What the Copy button is allowed to hand back.
 *
 * A stored assistant message is the raw stream: prose interleaved with `<trace>` and
 * `<pika-metadata>` elements the renderer resolves to side effects. Copying the stored string
 * hands over the orchestration detail those elements carry, so the clipboard has to be rebuilt
 * from the segments the display computed.
 */

/** The renderers and metadata handlers the chat registers for an assistant reply. */
const RENDERED_TAGS = ['chart', 'image', 'download', 'prompt', 'chat'];
const METADATA_TAGS = ['trace', 'pika-metadata', 'pika-command', 'pika-command-dispatch'];

function componentRegistry(): ComponentRegistry {
    const renderers: Record<string, unknown> = { text: {} };
    RENDERED_TAGS.forEach((tag) => (renderers[tag] = {}));

    const metadataHandlers: Record<string, unknown> = {};
    METADATA_TAGS.forEach((tag) => (metadataHandlers[tag] = jest.fn()));

    return {
        getAllRenderers: jest.fn().mockReturnValue(renderers),
        getAllMetadataHandlers: jest.fn().mockReturnValue(metadataHandlers),
        getRenderer: jest.fn().mockImplementation((type: string) => renderers[type]),
        getMetadataHandler: jest.fn().mockImplementation((type: string) => metadataHandlers[type]),
        registerRenderer: jest.fn(),
        registerMetadataHandler: jest.fn(),
        hasRenderer: jest.fn().mockImplementation((type: string) => type in renderers),
        hasMetadataHandler: jest.fn().mockImplementation((type: string) => type in metadataHandlers),
        unregisterRenderer: jest.fn().mockReturnValue(false),
        unregisterMetadataHandler: jest.fn().mockReturnValue(false),
        getRegisteredRendererTypes: jest.fn().mockReturnValue(Object.keys(renderers)),
        getRegisteredMetadataHandlerTypes: jest.fn().mockReturnValue(Object.keys(metadataHandlers)),
    } as unknown as ComponentRegistry;
}

/** Segment a raw stored message exactly as the chat window does before rendering it. */
function segmentsFor(storedMessage: string): ProcessedSegment[] {
    const segments: ProcessedSegment[] = [];
    new MessageSegmentProcessor(componentRegistry(), jest.fn() as never).parseMessage(storedMessage, segments, false);
    return segments;
}

function copyTextFor(storedMessage: string): string {
    return visibleTextFromSegments(segmentsFor(storedMessage) as MessageSegment[]);
}

const SYSTEM_PROMPT_TRACE =
    '<trace>{"orchestrationTrace":{"rationale":{"traceId":"llm-instruction","text":' +
    '"{\\"type\\":\\"llm-instruction\\",\\"compressedData\\":\\"H4sIAAAAAAAAA1NW1EnKzE4tUgQAF5ZLmwsAAAA=\\"}"}}}</trace>';

const TOOL_OUTPUT_TRACE =
    '<trace>{"orchestrationTrace":{"observation":{"actionGroupInvocationOutput":' +
    '{"text":"sku,price\\nA-1,9.99"},"type":"ACTION_GROUP"}}}</trace>';

const METADATA = '<pika-metadata>{"userMessageId":"u1","assistantMessageId":"a1"}</pika-metadata>';

/** Shaped like a real stored reply: traces first, prose in the middle, metadata last. */
const STORED_REPLY = `${SYSTEM_PROMPT_TRACE}${TOOL_OUTPUT_TRACE}You have 3 items with errors.${METADATA}`;

/** Everything that must never reach the clipboard. */
const FORBIDDEN = [
    'compressedData',
    'H4sIAAAAAAAAA',
    'llm-instruction',
    'orchestrationTrace',
    'actionGroupInvocationOutput',
    'sku,price',
    '9.99',
    'pika-metadata',
    'assistantMessageId',
    '<trace>',
];

// The acceptance case

describe('copy text for a stored assistant reply', () => {
    it('yields exactly the visible reply', () => {
        expect(copyTextFor(STORED_REPLY)).toBe('You have 3 items with errors.');
    });

    it.each(FORBIDDEN)('does not leak %s', (forbidden) => {
        expect(copyTextFor(STORED_REPLY)).not.toContain(forbidden);
    });

    it('is shorter than the stored string it came from', () => {
        expect(copyTextFor(STORED_REPLY).length).toBeLessThan(STORED_REPLY.length);
    });

    it('keeps prose that spans several traces', () => {
        const stored = `Checking.${SYSTEM_PROMPT_TRACE} Found 3.${TOOL_OUTPUT_TRACE} Fixed 2.${METADATA}`;
        expect(copyTextFor(stored)).toBe('Checking. Found 3. Fixed 2.');
    });

    it('keeps markdown as written, since that is what the reader sees', () => {
        const stored = `${SYSTEM_PROMPT_TRACE}## Errors\n\n- **SKU A-1** missing colour\n${METADATA}`;
        expect(copyTextFor(stored)).toBe('## Errors\n\n- **SKU A-1** missing colour');
    });
});

// Rendered tags

describe('rendered tag segments', () => {
    it('omits a chart, which has no textual form worth pasting', () => {
        const stored = 'Here is the breakdown.<chart>{"type":"bar","data":[1,2,3]}</chart>Ask if you need more.';
        const copied = copyTextFor(stored);
        expect(copied).toContain('Here is the breakdown.');
        expect(copied).toContain('Ask if you need more.');
        expect(copied).not.toContain('"type":"bar"');
        expect(copied).not.toContain('<chart>');
    });

    it('omits an image and a download without dropping the surrounding prose', () => {
        const stored = 'Before.<image>{"s3Key":"a/b.png"}</image>Middle.<download>{"s3Key":"c/d.csv"}</download>After.';
        const copied = copyTextFor(stored);
        for (const kept of ['Before.', 'Middle.', 'After.']) {
            expect(copied).toContain(kept);
        }
        for (const dropped of ['s3Key', 'a/b.png', 'c/d.csv', '<image>', '<download>']) {
            expect(copied).not.toContain(dropped);
        }
    });
});

// Degenerate input — Copy must be a no-op, never a crash

describe('visibleTextFromSegments', () => {
    it('returns empty for undefined segments', () => {
        expect(visibleTextFromSegments(undefined)).toBe('');
    });

    it('returns empty for no segments', () => {
        expect(visibleTextFromSegments([])).toBe('');
    });

    it('returns empty for a reply that is only traces and metadata', () => {
        expect(copyTextFor(`${SYSTEM_PROMPT_TRACE}${METADATA}`)).toBe('');
    });

    it('returns empty for a reply that has not streamed any text yet', () => {
        expect(copyTextFor('')).toBe('');
    });

    it('trims the whitespace left behind by stripped elements', () => {
        expect(copyTextFor(`${SYSTEM_PROMPT_TRACE}\n\n  Answer.  \n${METADATA}`)).toBe('Answer.');
    });

    it('never returns the stored string itself', () => {
        expect(copyTextFor(STORED_REPLY)).not.toBe(STORED_REPLY);
    });

    it('ignores a tag segment even when the registry has no renderer for it', () => {
        const unknown = [
            { id: 0, segmentType: 'text', rawContent: 'Visible.', streamingStatus: 'completed' },
            { id: 1, segmentType: 'tag', tag: 'mystery', rawContent: 'hidden', streamingStatus: 'completed' },
        ] as unknown as MessageSegment[];
        expect(visibleTextFromSegments(unknown)).toBe('Visible.');
    });

    it('does not mutate the segments it reads', () => {
        const segments = segmentsFor(STORED_REPLY) as MessageSegment[];
        const before = JSON.stringify(segments);
        visibleTextFromSegments(segments);
        expect(JSON.stringify(segments)).toBe(before);
    });
});
