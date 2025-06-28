import type {
    ChatMessageForRendering,
    TagMessageSegment,
    TextMessageSegment,
} from '@pika/shared/types/chatbot/chatbot-types';
import type { Component } from 'svelte';
import type { ChatAppState } from '../chat-app.state.svelte';
import type { AppState } from '$lib/client/app/app.state.svelte';

export interface SegmentProcessor {
    parseMessage(content: string, segments: ProcessedSegment[], isStreaming: boolean): void;
}

export interface ProcessedTextSegment extends TextMessageSegment {
    renderer?: Component<any>;
}

export interface ProcessedTagSegment extends TagMessageSegment {
    renderer?: Component<any>;
}

/**
 * Some tags aren't meant to be rendered.  They are metadata tags.
 * For example, the <trace> tag is used to show all the traces at the top of the chat message.
 * They don't render inline. When they are processed, the do whatever they need to do.
 * For example, a trace tag will cause the trace to be added to the chat message's trace array
 */
export interface MetadataTagSegment extends TagMessageSegment {
    renderer: undefined;
    isMetadata: true;
    hasCalledHandler?: boolean;
}

/**
 * A metadata tag handler is a function that is called when a metadata tag is processed.
 * It is used to handle the metadata tag and do whatever it needs to do.
 * For example, a trace tag will cause the trace to be added to the chat message's trace array
 */
export type MetadataTagHandler = (
    segment: MetadataTagSegment,
    message: ChatMessageForRendering,
    chatAppState: ChatAppState,
    appState: AppState
) => void;

export type ProcessedSegment = ProcessedTextSegment | ProcessedTagSegment | MetadataTagSegment;
