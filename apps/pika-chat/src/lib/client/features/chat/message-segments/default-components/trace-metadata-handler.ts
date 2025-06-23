import type { MetadataTagSegment } from '../segment-types';
import type { ChatAppState } from '../../chat-app.state.svelte';
import type { AppState } from '$lib/client/app/app.state.svelte';
import type { ChatMessageForRendering } from '@pika/shared/types/chatbot/chatbot-types';

/**
 * Traces are metadata tags that are used to show all the traces at the top of the chat message.
 * We simply want to add the trace to the chat message's trace array which cause it to be rendered.
 */
export function traceMetadataHandler(segment: MetadataTagSegment, message: ChatMessageForRendering, _chatAppState: ChatAppState, _appState: AppState): void {
    // Add the trace to the chat message's trace array
    if (segment.streamingStatus === 'completed') {
        if (!message.traces) {
            message.traces = [];
        }
        let trace: (typeof message.traces)[number];
        try {
            trace = JSON.parse(segment.rawContent);
        } catch (e) {
            //TODO: do something else?
            console.error('Failed to parse trace', e);
            return;
        }

        if (!('traceId' in trace)) {
            (trace as any).traceId = segment.id;
        }

        const idx = message.traces.findIndex((t) => (trace as any).traceId === (t as any).traceId);
        if (idx !== -1) {
            // console.log('updating trace', trace);
            message.traces[idx] = trace;
        } else {
            // console.log('adding trace', trace);
            message.traces.push(trace);
        }
    }
}
