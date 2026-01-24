/**
 * Stream Helpers for Intent Router
 *
 * Provides utilities for streaming intent router events to the client.
 *
 * @since 0.18.0
 */

import type {
    IntentRouteDispatch,
    IntentRouteDirectAction,
    IntentRouteResult,
    PikaCommand
} from 'pika-shared/types/chatbot/intent-router-types';
import type { EnhancedResponseStream } from '../../lambda/converse/EnhancedResponseStream';

/**
 * Stream a PikaCommand to the client.
 * The command is wrapped in <pika-command> tags for the client to parse.
 *
 * @param responseStream - The response stream
 * @param command - The command to stream
 */
export function streamCommand(responseStream: EnhancedResponseStream, command: PikaCommand): void {
    const commandJson = JSON.stringify(command);
    responseStream.write(`<pika-command>${commandJson}</pika-command>`);
}

/**
 * Stream a dispatch event to the client.
 * The client will route this to the registered handler widget.
 *
 * @param responseStream - The response stream
 * @param dispatch - The dispatch route result
 * @param request - Additional request info to include
 */
export function streamDispatch(
    responseStream: EnhancedResponseStream,
    dispatch: IntentRouteDispatch,
    request: {
        userMessage: string;
        sessionId: string;
        userId: string;
        context: Record<string, unknown>;
    }
): void {
    const event = {
        commandId: dispatch.command.commandId,
        intent: dispatch.command.commandId, // Same as commandId for now
        confidence: dispatch.confidence,
        handlerTagId: dispatch.handlerTagId,
        payload: dispatch.payload,
        context: request.context,
        userMessage: request.userMessage,
        sessionId: request.sessionId,
        userId: request.userId
    };

    const eventJson = JSON.stringify(event);
    responseStream.write(`<pika-command-dispatch>${eventJson}</pika-command-dispatch>`);
}

/**
 * Stream a trace for the intent router match.
 * Uses the existing trace format for consistency.
 *
 * @param responseStream - The response stream
 * @param result - The route result
 */
export function streamRouterTrace(responseStream: EnhancedResponseStream, result: IntentRouteResult): void {
    let traceText: string;

    switch (result.type) {
        case 'passthrough':
            traceText = JSON.stringify({
                type: 'intent-router',
                matched: false,
                reason: result.reason
            });
            break;

        case 'direct':
            traceText = JSON.stringify({
                type: 'intent-router',
                matched: true,
                commandId: result.command.commandId,
                tagId: result.tagId,
                confidence: result.confidence,
                mode: 'direct'
            });
            break;

        case 'dispatch':
            traceText = JSON.stringify({
                type: 'intent-router',
                matched: true,
                commandId: result.command.commandId,
                tagId: result.tagId,
                handlerTagId: result.handlerTagId,
                confidence: result.confidence,
                mode: 'dispatch'
            });
            break;

        case 'enrich':
            traceText = JSON.stringify({
                type: 'intent-router',
                matched: false,
                enriched: true,
                reason: result.reason
            });
            break;
    }

    // Use the existing trace format
    const trace = {
        orchestrationTrace: {
            rationale: {
                traceId: 'intent-router',
                text: traceText
            }
        }
    };

    responseStream.write(`<trace>${JSON.stringify(trace)}</trace>`);
}

/**
 * Stream the response text for a matched command.
 *
 * @param responseStream - The response stream
 * @param response - The response text
 */
export function streamResponse(responseStream: EnhancedResponseStream, response: string): void {
    if (response) {
        responseStream.write(response);
    }
}

/**
 * Helper to stream all parts of a direct action result.
 *
 * @param responseStream - The response stream
 * @param result - The direct action result
 */
export function streamDirectAction(responseStream: EnhancedResponseStream, result: IntentRouteDirectAction): void {
    // Stream the command first (for instant UI feedback)
    streamCommand(responseStream, result.pikaCommand);

    // Stream the trace
    streamRouterTrace(responseStream, result);

    // Stream the response text
    streamResponse(responseStream, result.response);
}

/**
 * Helper to stream all parts of a dispatch result.
 *
 * @param responseStream - The response stream
 * @param result - The dispatch result
 * @param request - Request info
 */
export function streamDispatchAction(
    responseStream: EnhancedResponseStream,
    result: IntentRouteDispatch,
    request: {
        userMessage: string;
        sessionId: string;
        userId: string;
        context: Record<string, unknown>;
    }
): void {
    // Stream the dispatch event
    streamDispatch(responseStream, result, request);

    // Stream the trace
    streamRouterTrace(responseStream, result);

    // Stream fallback response if provided
    if (result.response) {
        streamResponse(responseStream, result.response);
    }
}
