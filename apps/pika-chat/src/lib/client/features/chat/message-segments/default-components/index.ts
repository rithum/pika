import type { Component } from 'svelte';

// Import all tag components
import ChartComponent from './chart-renderer.svelte';
import ChatComponent from './chat-renderer.svelte';
import DownloadComponent from './download-renderer.svelte';
import ImageComponent from './image-renderer.svelte';
import PromptComponent from './prompt.svelte';

// Import text renderer
import TextRenderer from './text-renderer.svelte';
import { traceMetadataHandler } from './trace-metadata-handler';
import type { MetadataTagHandler } from '../segment-types';

/**
 * Default renderers for XML tags found in chat messages that are rendered inline.
 * Note that there is also the text renderer which is used for all message content that is not an XML tag.
 */
export const defaultRenderers: Record<string, Component<any>> = {
    text: TextRenderer,
    chart: ChartComponent,
    chat: ChatComponent,
    download: DownloadComponent,
    image: ImageComponent,
    prompt: PromptComponent,
};

/**
 * Default metadata handlers for XML tags found in chat messages that are not rendered inline but
 * have a function that is called to effect whatever side effect is needed.
 */
export const defaultMetadataHandlers: Record<string, MetadataTagHandler> = {
    trace: traceMetadataHandler,
};
