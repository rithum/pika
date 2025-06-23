import type { Component } from 'svelte';
import type { MetadataTagHandler } from '../segment-types';

/**
 * Custom renderers for chat message segments based on XML tag types.
 *
 * When an LLM response contains XML elements (e.g., `<image>`, `<download>`, `<chart>`),
 * the system uses the XML tag name to find and instantiate the appropriate renderer component.
 *
 * @example
 * ```typescript
 * // To add a custom renderer for <mywidget> tags:
 * import MyWidgetRenderer from './MyWidgetRenderer.svelte';
 * customRenderers['mywidget'] = MyWidgetRenderer;
 * ```
 *
 * @example
 * ```
 * <!-- LLM response with custom tags -->
 * Here's the image you asked for:
 * <image>https://example.com/image.jpg</image>
 *
 * Here's the document you asked for:
 * <download>{"s3Key": "files/document.pdf", "title": "My Document"}</download>
 *
 * You will note that there has been a **substantial** change since yesterday:
 * <chart>{"type": "bar", "data": {...}}</chart>
 * ```
 *
 * ## Renderer Component Interface
 *
 * Each renderer component must accept the following props:
 * - `segment: ProcessedTagSegment` - Contains tag content and streaming status
 * - `appState: AppState` - Global application state
 * - `chatAppState: ChatAppState` - Chat-specific state and actions
 *
 * The `segment.rawContent` contains the text content between the XML tags,
 * and `segment.streamingStatus` indicates if content is still being received.
 *
 * ## Default Tag Renderers
 *
 * See `@/tag-renderers` for examples of built-in renderers:
 * - `image.svelte` - Displays images from URLs with loading states
 * - `download.svelte` - Creates download buttons for files (expects JSON with s3Key)
 * - `chart.svelte` - Renders Chart.js charts (expects Chart.js config JSON)
 * - `prompt.svelte` - Creates clickable prompt buttons
 * - `chat.svelte` - Placeholder chat component renderer
 *
 * ## Text Override
 *
 * There is one special case, the text renderer which is used for all message content that is not an XML tag.
 * To override the default text renderer, add a renderer for the type 'text'.
 * This will replace the standard text rendering for all non-XML content.
 *
 * @type {Record<string, Component<any>>} Mapping of XML tag names to Svelte components
 */
export const customRenderers: Record<string, Component<any>> = {};

/**
 * Custom metadata handlers for chat message segments based on XML tag types.
 *
 * Metadata tags are tags that are not meant to be rendered.  They are used to
 * provide metadata about the chat message.  For example, the <trace> tag is used
 * to show all the traces at the top of the chat message.  They don't render inline.
 * When they are processed, the do whatever they need to do.  For example, a trace tag
 * will cause the trace to be added to the chat message's trace array.
 *
 * @type {Record<string, MetadataTagHandler>} Mapping of XML tag names to metadata handlers
 */
export const customMetadataHandlers: Record<string, MetadataTagHandler> = {};
