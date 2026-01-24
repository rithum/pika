/**
 * Intent Router Types - Server-side Internal Types
 *
 * Client-facing types (PikaCommand, IntentRouterCommand, IntentRouterHandler, etc.)
 * are defined in chatbot-types.ts and should be imported from there.
 *
 * This file contains only server-side internal types used by the Intent Router module.
 *
 * @since 0.18.0
 */

// Re-export client-facing types from the canonical location
export type {
    PikaCommand,
    PikaRenderTagCommand,
    PikaCloseCanvasCommand,
    PikaCloseDialogCommand,
    PikaCloseHeroCommand,
    PikaShowHeroCommand,
    PikaHideHeroCommand,
    PikaShowToastCommand,
    PikaNavigateToCommand,
    PikaCustomCommand,
    IntentRouterCommand,
    IntentRouterCommandExecution,
    IntentRouterDirectExecution,
    IntentRouterDispatchExecution,
    IntentRouterCommandEvent,
    IntentRouterHandlerResult,
    IntentRouterHandler,
    IntentRouterFeature
} from './chatbot-types';

import type {
    IntentRouterCommand,
    IntentRouterFeature,
    PikaCommand
} from './chatbot-types';

// ============================================================
// Intent Router Internal Types (Server-side only)
// ============================================================

/**
 * Result of intent classification.
 */
export interface IntentClassificationResult {
    /** Whether a command was matched */
    matched: boolean;

    /** The matched command (if any) */
    command?: IntentRouterCommand;

    /** The tag definition that owns this command */
    tagId?: string;

    /** Classification confidence (0-1) */
    confidence: number;

    /** Reasoning for the match (for tracing) */
    reasoning?: string;
}

/**
 * Result of routing a user message.
 */
export type IntentRouteResult =
    | IntentRoutePassthrough
    | IntentRouteDirectAction
    | IntentRouteDispatch
    | IntentRouteEnrich;

export interface IntentRoutePassthrough {
    type: 'passthrough';
    /** Why we're passing through (no match, low confidence, etc.) */
    reason: string;
}

export interface IntentRouteDirectAction {
    type: 'direct';
    /** The matched command */
    command: IntentRouterCommand;
    /** The tag that owns this command */
    tagId: string;
    /** The PikaCommand to execute */
    pikaCommand: PikaCommand;
    /** Response to stream */
    response: string;
    /** Classification confidence */
    confidence: number;
    /** Whether to continue to Bedrock after */
    passToAgent: boolean;
}

export interface IntentRouteDispatch {
    type: 'dispatch';
    /** The matched command */
    command: IntentRouterCommand;
    /** The tag that owns this command */
    tagId: string;
    /** Handler widget tag ID */
    handlerTagId: string;
    /** Payload for handler */
    payload?: Record<string, unknown>;
    /** Response to show user (e.g., "Opening jobs...") */
    response?: string;
    /** Classification confidence */
    confidence: number;
}

export interface IntentRouteEnrich {
    type: 'enrich';
    /** Context injection for the prompt */
    contextInjection: string;
    /** Reason for enrichment */
    reason: string;
}

/**
 * Aggregated command with its source tag information.
 */
export interface AggregatedCommand {
    /** The command definition */
    command: IntentRouterCommand;
    /** Source tag ID (scope.tag) */
    tagId: string;
    /** Effective priority (base + any chat app boost) */
    effectivePriority: number;
}

/**
 * Request to the Intent Router.
 */
export interface IntentRouterRequest {
    /** Chat app ID */
    chatAppId: string;
    /** User ID */
    userId: string;
    /** Session ID */
    sessionId: string;
    /** The user's message */
    message: string;
    /** Context from widgets (llmContextItems converted to key-value) */
    context: Record<string, unknown>;
    /** Intent Router configuration for this chat app */
    config: IntentRouterFeature;
}

// ============================================================
// Validation Types
// ============================================================

/**
 * Validation error with detailed context.
 * @since 0.18.0
 */
export interface CommandValidationError {
    /** Field path where the error occurred (e.g., "execution.command.tagId") */
    field: string;
    /** Human-readable error message */
    message: string;
    /** The invalid value (for debugging) */
    value?: unknown;
}

/**
 * Result of validating a single command.
 * @since 0.18.0
 */
export interface CommandValidationResult {
    valid: boolean;
    errors: CommandValidationError[];
}

/**
 * Result of validating multiple commands.
 * @since 0.18.0
 */
export interface CommandsValidationResult {
    valid: boolean;
    errors: Array<CommandValidationError & { commandIndex: number; commandId?: string }>;
}
