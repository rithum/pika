import type { MessageSegment } from 'pika-shared/types/chatbot/chatbot-types';

// Built from rendered text segments, never the stored message: the stored string interleaves <trace>
// and <pika-metadata> elements that carry tool names, inputs, and raw outputs.
export function visibleTextFromSegments(segments: readonly MessageSegment[] | undefined): string {
    if (!segments?.length) return '';

    return segments
        .filter((segment) => segment.segmentType === 'text')
        .map((segment) => segment.rawContent)
        .join('')
        .trim();
}
