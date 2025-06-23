<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import type { ChatMessageForRendering, ChatMessageFile } from '@pika/shared/types/chatbot/chatbot-types';
    import type { ChatAppState } from '../chat-app.state.svelte';
    import { getContext } from 'svelte';
    import type { ProcessedTextSegment, ProcessedTagSegment, MetadataTagSegment } from './segment-types';
    import Trace from '../chat-app-main/trace.svelte';

    interface Props {
        message: ChatMessageForRendering;
        chatAppState: ChatAppState;
        files?: ChatMessageFile[];
        isStreaming: boolean;
    }

    let { message, chatAppState, files = [], isStreaming }: Props = $props();
    const appState = getContext<AppState>('appState');

    // LOGGING: Track message changes
    $effect(() => {
        // console.log('[MESSAGE-RENDERER] Message updated:', {
        //     messageId: message.messageId,
        //     messageContent: message.message?.slice(0, 100),
        //     segmentCount: message.segments.length,
        //     filesCount: files.length,
        //     segments: message.segments.map(segment => ({
        //         id: segment.id,
        //         segmentType: segment.segmentType,
        //         streamingStatus: segment.streamingStatus,
        //         tag: 'tag' in segment ? segment.tag : undefined,
        //         rendererType: segment.rendererType,
        //         rawContentLength: segment.rawContent.length,
        //         hasRenderer: !!(segment as any).renderer,
        //         isMetadata: 'isMetadata' in segment ? segment.isMetadata : false
        //     }))
        // });
    });

    // Handle metadata segments side effects when segments change
    $effect(() => {
        // console.log('[MESSAGE-RENDERER] Processing metadata segments:', {
        //     messageId: message.messageId,
        //     segmentCount: message.segments.length
        // });

        message.segments.forEach(segment => {
            if ('isMetadata' in segment && segment.isMetadata) {
                const metadataSegment = segment as MetadataTagSegment;
                if (metadataSegment.hasCalledHandler) {
                    return;
                }
                
                // console.log('[MESSAGE-RENDERER] Applying metadata handler:', {
                //     messageId: message.messageId,
                //     segmentId: segment.id,
                //     tag: metadataSegment.tag,
                //     streamingStatus: segment.streamingStatus
                // });
                
                if (segment.streamingStatus === 'completed') {
                    const handler = chatAppState.componentRegistry.getMetadataHandler(metadataSegment.tag);
                    if (handler) {
                        handler(metadataSegment, message, chatAppState, appState);
                        metadataSegment.hasCalledHandler = true;
                        // console.log('[MESSAGE-RENDERER] Metadata handler applied successfully');
                    } else {
                        // console.warn('[MESSAGE-RENDERER] No metadata handler found for tag:', metadataSegment.tag);
                    }
                }
            }
        });
    });

    // LOGGING: Global DOM monitoring for tag elements
    // $effect(() => {
    //     console.log('[MESSAGE-RENDERER] 🌍 Global DOM Snapshot:', {
    //         messageId: message.messageId,
    //         segmentCount: message.segments.length,
    //         tagElementsInDOM: {
    //             promptPlaceholders: document.querySelectorAll('[data-prompt-placeholder]').length,
    //             promptButtons: document.querySelectorAll('[data-prompt-button]').length,
    //             chartPlaceholders: document.querySelectorAll('[data-chart-placeholder]').length,
    //             chartCanvas: document.querySelectorAll('[data-chart-canvas]').length,
    //             chartErrors: document.querySelectorAll('[data-chart-error]').length
    //         },
    //         timestamp: new Date().toISOString()
    //     });
    // });
</script>

<div class="message-renderer">
    <!-- LOGGING: Track rendering loop -->
    <!-- {console.log('[MESSAGE-RENDERER] Rendering segments:', {
        messageId: message.messageId,
        segmentCount: message.segments.length,
    })} -->

    <Trace message={message} appState={appState} />

    <!-- Render each processed segment -->
    {#each message.segments as segment (segment.id)}
        <div>
            {#if segment.segmentType === 'text'}
                <!-- {console.log('[MESSAGE-RENDERER] Rendering text segment:', {
                    messageId: message.messageId,
                    segmentId: segment.id,
                    streamingStatus: segment.streamingStatus,
                    rawContentLength: segment.rawContent.length,
                    hasRenderer: !!(segment as any).renderer
                })} -->
                {@const textSegment = segment as ProcessedTextSegment}
                {#if textSegment.renderer}
                    <!-- DEBUGGING: Log exact status mismatch -->
                    <!-- {console.log('[MESSAGE-RENDERER] 🔍 TEXT SEGMENT STATUS CHECK:', {
                        messageId: message.messageId,
                        segmentId: textSegment.id, 
                        segmentStreamingStatus: textSegment.streamingStatus,
                        isStreamingProp: textSegment.streamingStatus === 'streaming',
                        rawContentLength: textSegment.rawContent.length,
                        timestamp: new Date().toISOString()
                    })} -->
                    
                    <textSegment.renderer 
                        segment={textSegment}
                        {appState}
                        {chatAppState}
                    />
                {:else}
                    <!-- {console.warn('[MESSAGE-RENDERER] Text segment missing renderer:', {
                        messageId: message.messageId,
                        segmentId: segment.id
                    })} -->
                {/if}
            {:else if segment.segmentType === 'tag' && !('isMetadata' in segment)}
                <!-- {console.log('[MESSAGE-RENDERER] Rendering tag segment:', {
                    messageId: message.messageId,
                    segmentId: segment.id,
                    tag: segment.tag,
                    streamingStatus: segment.streamingStatus,
                    rawContentLength: segment.rawContent.length,
                    hasRenderer: !!(segment as any).renderer
                })} -->
                {@const tagSegment = segment as ProcessedTagSegment}
                {#if tagSegment.renderer}
                    <tagSegment.renderer 
                        segment={tagSegment}
                        {appState}
                        {chatAppState}
                    />
                {:else}
                    <!-- {console.warn('[MESSAGE-RENDERER] Tag segment missing renderer:', {
                        messageId: message.messageId,
                        segmentId: segment.id,
                        tag: segment.tag
                    })} -->
                    <!-- Fallback for unknown tag types -->
                    <div class="unknown-tag-warning bg-yellow-50 border border-yellow-200 rounded p-2 text-sm text-yellow-800">
                        <strong>Unknown tag:</strong> &lt;{tagSegment.tag}&gt;
                        <br/>
                        <span class="text-xs text-yellow-600">{tagSegment.rawContent}</span>
                    </div>
                {/if}
            {:else if segment.segmentType === 'tag' && 'isMetadata' in segment}
                <!-- {console.log('[MESSAGE-RENDERER] Skipping metadata segment (no inline rendering):', {
                    messageId: message.messageId,
                    segmentId: segment.id,
                    tag: segment.tag,
                    streamingStatus: segment.streamingStatus
                })} -->
            {:else}
                <!-- {console.warn('[MESSAGE-RENDERER] Unknown segment type:', {
                    messageId: message.messageId,
                    segmentId: segment.id,
                    segmentType: segment.segmentType
                })} -->
            {/if}
        </div>
    {/each}
    
    <!-- Show files if any -->
    {#if files.length > 0}
        <!-- {console.log('[MESSAGE-RENDERER] Rendering files:', {
            messageId: message.messageId,
            filesCount: files.length
        })} -->
        <div class="message-files mt-2">
            {#each files as file}
                <div class="file-attachment">
                    <span class="file-name">{file.fileName}</span>
                    <span class="file-size">({file.size} bytes)</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .message-renderer {
        word-break: break-word;
    }

    .message-files {
        border-top: 1px solid #e5e7eb;
        padding-top: 8px;
        margin-top: 8px;
    }

    .file-attachment {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background-color: #f9fafb;
        border-radius: 4px;
        font-size: 0.875rem;
    }

    .file-name {
        font-weight: 500;
    }

    .file-size {
        color: #6b7280;
        font-size: 0.75rem;
    }

    .unknown-tag-warning {
        margin: 8px 0;
    }
</style>
