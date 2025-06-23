import type { MetadataTagSegment } from '../segment-types';
import type { ChatAppState } from '../../chat-app.state.svelte';
import type { AppState } from '$lib/client/app/app.state.svelte';
import type { ChatMessageForRendering } from '@pika/shared/types/chatbot/chatbot-types';
import type { Trace } from '@pika/shared/types/chatbot/bedrock';

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
        let trace: Trace;
        try {
            trace = JSON.parse(segment.rawContent);
        } catch (e) {
            //TODO: do something else?
            console.error('Failed to parse trace', e);
            return;
        }

        const idx = message.traces.findIndex((t) => t.id === segment.id);
        if (idx !== -1) {
            message.traces[idx] = trace;
        } else {
            message.traces.push(trace);
        }
    }
}
