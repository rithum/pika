/**
 * Command Executor
 *
 * Handles execution of PikaCommands received from the Intent Router.
 * Commands can render tags, show toasts, navigate, close canvas, etc.
 *
 * @since 0.18.0
 */

import type { AppState } from '$lib/client/app/app.state.svelte';
import type { ChatMessageForRendering, WidgetRenderingContextType } from 'pika-shared/types/chatbot/chatbot-types';
import type { PikaCommand, IntentRouterCommandEvent, IntentRouterHandlerResult, IntentRouterHandler } from 'pika-shared/types/chatbot/intent-router-types';
import type { WidgetMetadata } from 'pika-shared/types/chatbot/webcomp-types';
import type { ChatAppState } from '../../chat-app.state.svelte';
import type { MetadataTagSegment } from '../segment-types';

/**
 * Execute a PikaCommand.
 * This is called when the server sends a <pika-command> tag.
 */
export async function executePikaCommand(
    command: PikaCommand,
    chatAppState: ChatAppState,
    appState: AppState
): Promise<void> {
    console.log('[CommandExecutor] Executing command:', command.type);

    switch (command.type) {
        case 'renderTag': {
            const context = command.renderingContext as WidgetRenderingContextType;
            // Pass metadata as-is; renderTag handles companionMode/chatPaneMinimized internally
            const metadata = command.metadata
                ? ({ title: command.metadata.title ?? '', ...command.metadata } as WidgetMetadata)
                : undefined;
            await chatAppState.renderTag(command.tagId, context, command.data as Record<string, any>, metadata);
            break;
        }

        case 'closeCanvas': {
            chatAppState.closeCanvas();
            break;
        }

        case 'closeDialog': {
            chatAppState.closeDialog();
            break;
        }

        case 'closeHero': {
            chatAppState.closeHero();
            break;
        }

        case 'showHero': {
            chatAppState.showHero();
            break;
        }

        case 'hideHero': {
            chatAppState.hideHero();
            break;
        }

        case 'showToast': {
            chatAppState.showToast(command.message, { type: command.variant });
            break;
        }

        case 'navigateTo': {
            // Use SvelteKit navigation or fallback to window.location
            if (typeof window !== 'undefined') {
                window.location.href = command.path;
            }
            break;
        }

        case 'custom': {
            console.log('[CommandExecutor] Custom action:', command.action, command.params);
            // Custom actions are handled by the application layer
            // Chat apps can listen for these and handle them accordingly
            break;
        }

        default: {
            console.warn('[CommandExecutor] Unknown command type:', (command as any).type);
        }
    }
}

/**
 * Handler for <pika-command> metadata tags.
 * Parses the command JSON and executes it.
 */
export function pikaCommandHandler(
    segment: MetadataTagSegment,
    message: ChatMessageForRendering,
    chatAppState: ChatAppState | undefined,
    appState: AppState
): void {
    if (segment.streamingStatus !== 'completed' || !chatAppState) {
        return;
    }

    try {
        const command: PikaCommand = JSON.parse(segment.rawContent);
        console.log('[CommandExecutor] Received pika-command:', command);

        // Execute command asynchronously (don't block message rendering)
        executePikaCommand(command, chatAppState, appState).catch((error) => {
            console.error('[CommandExecutor] Error executing command:', error);
        });
    } catch (error) {
        console.error('[CommandExecutor] Failed to parse pika-command:', error);
    }
}

/**
 * Handler for <pika-command-dispatch> metadata tags.
 * Routes the dispatch event to the registered Intent Router handler.
 */
export function pikaCommandDispatchHandler(
    segment: MetadataTagSegment,
    message: ChatMessageForRendering,
    chatAppState: ChatAppState | undefined,
    appState: AppState
): void {
    console.log('[CommandExecutor] pikaCommandDispatchHandler called:', {
        tag: segment.tag,
        streamingStatus: segment.streamingStatus,
        hasChatAppState: !!chatAppState,
        rawContentLength: segment.rawContent?.length ?? 0
    });

    if (segment.streamingStatus !== 'completed') {
        console.log('[CommandExecutor] Skipping - streaming not completed');
        return;
    }
    
    if (!chatAppState) {
        console.log('[CommandExecutor] Skipping - no chatAppState');
        return;
    }

    try {
        const event: IntentRouterCommandEvent = JSON.parse(segment.rawContent);
        console.log('[CommandExecutor] Received pika-command-dispatch:', event);

        // Dispatch to registered handler
        dispatchToHandler(event, chatAppState, appState).catch((error) => {
            console.error('[CommandExecutor] Error dispatching command:', error);
        });
    } catch (error) {
        console.error('[CommandExecutor] Failed to parse pika-command-dispatch:', error);
    }
}

/**
 * Dispatch a command event to the registered handler.
 */
async function dispatchToHandler(
    event: IntentRouterCommandEvent,
    chatAppState: ChatAppState,
    appState: AppState
): Promise<void> {
    // Get the handler for the target tag using the public API
    const handlers = chatAppState.getIntentRouterHandlers();
    
    if (!handlers || handlers.size === 0) {
        console.log('[CommandExecutor] No Intent Router handlers registered');
        return;
    }

    // Try to find a handler - first by handlerTagId if specified, then any handler
    let handler: ((event: IntentRouterCommandEvent) => Promise<IntentRouterHandlerResult>) | undefined;
    
    if (event.handlerTagId) {
        // Look for handler with matching tagId (tagId is stored with handler, no widget instance lookup needed)
        for (const [, handlerInfo] of handlers) {
            if (handlerInfo.tagId === event.handlerTagId) {
                handler = handlerInfo.handler;
                break;
            }
        }
    }
    
    // If no specific handler found, try the first available handler
    if (!handler) {
        const firstEntry = handlers.values().next().value;
        handler = firstEntry?.handler;
    }

    if (!handler) {
        console.log('[CommandExecutor] No handler found for dispatch event');
        return;
    }

    try {
        const result = await handler(event);
        console.log('[CommandExecutor] Handler result:', result);

        // Log if handler didn't handle the event
        if (!result.handled) {
            console.log('[CommandExecutor] Handler returned handled=false for:', event.commandId);
        }

        // Log the handler's response (currently not displayed to user - future enhancement)
        if (result.response) {
            console.log('[CommandExecutor] Handler response (not displayed):', result.response);
        }

        // Execute any commands returned by the handler
        if (result.commands && result.commands.length > 0) {
            for (const command of result.commands) {
                await executePikaCommand(command, chatAppState, appState);
            }
        }
    } catch (error) {
        console.error('[CommandExecutor] Handler error:', error);
    }
}
