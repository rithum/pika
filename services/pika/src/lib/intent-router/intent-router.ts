/**
 * Intent Router
 *
 * Intercepts user messages before they reach the Bedrock agent and routes
 * them to appropriate commands based on fast LLM classification.
 *
 * This uses the lightweight InvokeModel API (not Bedrock Agents):
 * - No session management or state
 * - No agent orchestration overhead
 * - Direct model invocation (~200-400ms typical latency)
 * - Stateless and idempotent
 *
 * @since 0.18.0
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import type {
    AggregatedCommand,
    IntentClassificationResult,
    IntentRouterCommand,
    IntentRouterRequest,
    IntentRouteResult,
    PikaCommand
} from 'pika-shared/types/chatbot/intent-router-types';
import { extractJson } from 'pika-shared/util/json-extraction';
import {
    convertLlmContextToFlatContext,
    hasRequiredContext,
    interpolateObject,
    interpolateString
} from 'pika-shared/util/template-interpolation';
import { DEFAULT_ANTHROPIC_VERSION, DEFAULT_VERIFICATION_MODEL } from '../model-types-utils';
import { getRegion } from '../utils';
import { buildClassificationPrompt } from './classification-prompt';

// Model to use for intent classification (fast and cheap)
export const INTENT_ROUTER_MODEL = DEFAULT_VERIFICATION_MODEL;

// Default confidence threshold (80% confidence = matched)
const DEFAULT_CONFIDENCE_THRESHOLD = 0.80;

// Bedrock client
const bedrockClient = new BedrockRuntimeClient({ region: getRegion() });

/**
 * Mock classification type for local testing
 */
interface MockClassification {
    matched: boolean;
    commandId?: string;
    tagId?: string;
    confidence: number;
}

/**
 * Options for creating an IntentRouter instance
 */
export interface IntentRouterOptions {
    /** Enable debug logging */
    debug?: boolean;
}

/**
 * The Intent Router intercepts user messages and classifies them against
 * registered commands using a fast LLM for intelligent routing.
 */
export class IntentRouter {
    private debug: boolean;
    private mockClassifications?: Map<string, MockClassification>;

    constructor(options?: IntentRouterOptions) {
        this.debug = options?.debug ?? false;

        // Load mock classifications if available (local dev only)
        const mockJson = process.env.INTENT_ROUTER_MOCK_CLASSIFICATIONS;
        if (mockJson) {
            try {
                const mocks = JSON.parse(mockJson) as Record<string, MockClassification>;
                this.mockClassifications = new Map(Object.entries(mocks));
                this.log('Loaded mock classifications:', mocks);
            } catch (e) {
                console.error('[IntentRouter] Failed to parse mock classifications:', e);
            }
        }
    }

    private log(...args: unknown[]): void {
        if (this.debug) {
            console.log('[IntentRouter]', ...args);
        }
    }

    /**
     * Route a user message to an appropriate command.
     *
     * @param request - The routing request containing message, context, and config
     * @param commands - Aggregated commands from tag definitions
     * @returns The routing result
     */
    async route(request: IntentRouterRequest, commands: AggregatedCommand[]): Promise<IntentRouteResult> {
        const { message, context, config } = request;
        const confidenceThreshold = config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

        this.log('Routing message:', message);
        this.log('Available commands:', commands.length);
        this.log('Confidence threshold:', confidenceThreshold);

        // Filter commands that have required context satisfied
        const eligibleCommands = commands.filter((cmd) => {
            if (!cmd.command.requiresContext || cmd.command.requiresContext.length === 0) {
                return true;
            }
            return hasRequiredContext(context, cmd.command.requiresContext);
        });

        this.log('Eligible commands after context filtering:', eligibleCommands.length);

        if (eligibleCommands.length === 0) {
            return {
                type: 'passthrough',
                reason: 'No eligible commands (all require context that is not available)'
            };
        }

        // Classify the message
        const classification = await this.classify(message, eligibleCommands, context);

        this.log('Classification result:', classification);

        if (!classification.matched || !classification.command) {
            return {
                type: 'passthrough',
                reason: classification.reasoning ?? 'No matching command found'
            };
        }

        // Check confidence threshold
        const effectiveThreshold = classification.command.confidenceThreshold ?? confidenceThreshold;
        if (classification.confidence < effectiveThreshold) {
            return {
                type: 'passthrough',
                reason: `Confidence ${classification.confidence} below threshold ${effectiveThreshold}`
            };
        }

        // Build the route result based on execution mode
        const { command, tagId } = classification;
        const execution = command.execution;

        if (execution.mode === 'direct') {
            // Interpolate the command with context
            const interpolatedCommand = interpolateObject(execution.command, { context }) as PikaCommand;
            const interpolatedResponse = execution.responseTemplate ? interpolateString(execution.responseTemplate, { context }) : '';

            return {
                type: 'direct',
                command,
                tagId: tagId!,
                pikaCommand: interpolatedCommand,
                response: interpolatedResponse,
                confidence: classification.confidence,
                passToAgent: execution.passToAgent ?? false
            };
        } else {
            // Dispatch mode
            return {
                type: 'dispatch',
                command,
                tagId: tagId!,
                handlerTagId: execution.handlerTagId,
                payload: execution.payload,
                response: execution.responseTemplate ? interpolateString(execution.responseTemplate, { context }) : undefined,
                confidence: classification.confidence
            };
        }
    }

    /**
     * Classify a user message against available commands.
     */
    private async classify(
        userMessage: string,
        commands: AggregatedCommand[],
        context: Record<string, unknown>
    ): Promise<IntentClassificationResult> {
        // Check for mock classification (local testing)
        if (this.mockClassifications) {
            const normalizedInput = userMessage.toLowerCase().trim();

            // Try exact match first
            const exactMatch = this.mockClassifications.get(normalizedInput);
            if (exactMatch) {
                return this.buildMockResult(exactMatch, commands);
            }

            // Try substring match
            for (const [pattern, result] of this.mockClassifications) {
                if (normalizedInput.includes(pattern.toLowerCase())) {
                    return this.buildMockResult(result, commands);
                }
            }

            // No mock match - return no match
            return {
                matched: false,
                confidence: 0,
                reasoning: 'No mock classification matched'
            };
        }

        // Build the classification prompt
        const prompt = buildClassificationPrompt(userMessage, commands, context);

        this.log('Classification prompt length:', prompt.length);

        try {
            // Lightweight stateless model call - no session, no agent, no streaming
            // Uses InvokeModel API directly for minimal latency (~200-400ms typical)
            const response = await bedrockClient.send(
                new InvokeModelCommand({
                    modelId: INTENT_ROUTER_MODEL,
                    contentType: 'application/json',
                    accept: 'application/json',
                    body: JSON.stringify({
                        anthropic_version: DEFAULT_ANTHROPIC_VERSION,
                        max_tokens: 150, // Small response: just JSON classification
                        temperature: 0, // Deterministic for classification
                        messages: [{ role: 'user', content: prompt }]
                        // Note: stop_sequences removed - Bedrock requires non-whitespace characters
                    })
                })
            );

            // Safely parse Bedrock response
            if (!response.body) {
                console.error('[IntentRouter] Empty response body from Bedrock');
                return {
                    matched: false,
                    confidence: 0,
                    reasoning: 'Empty response from classification model'
                };
            }

            const responseBody = new TextDecoder().decode(response.body);
            const parsedResponse = JSON.parse(responseBody);

            // Validate response structure
            if (!parsedResponse.content || !Array.isArray(parsedResponse.content) || parsedResponse.content.length === 0) {
                console.error('[IntentRouter] Invalid response structure from Bedrock:', parsedResponse);
                return {
                    matched: false,
                    confidence: 0,
                    reasoning: 'Invalid response structure from classification model'
                };
            }

            const responseText = parsedResponse.content[0]?.text;
            if (!responseText) {
                console.error('[IntentRouter] No text content in Bedrock response');
                return {
                    matched: false,
                    confidence: 0,
                    reasoning: 'No text content in classification response'
                };
            }

            this.log('Classification response:', responseText);

            // Parse the classification response
            return this.parseClassificationResponse(responseText, commands);
        } catch (error) {
            console.error('[IntentRouter] Classification error:', error);
            return {
                matched: false,
                confidence: 0,
                reasoning: `Classification error: ${error}`
            };
        }
    }

    /**
     * Build a classification result from a mock.
     */
    private buildMockResult(mock: MockClassification, commands: AggregatedCommand[]): IntentClassificationResult {
        if (!mock.matched) {
            return {
                matched: false,
                confidence: mock.confidence,
                reasoning: 'Mock: No match'
            };
        }

        // Find the command
        const matched = commands.find((c) => c.command.commandId === mock.commandId || (mock.tagId && c.tagId === mock.tagId));

        if (!matched) {
            return {
                matched: false,
                confidence: 0,
                reasoning: `Mock: Command ${mock.commandId} not found`
            };
        }

        return {
            matched: true,
            command: matched.command,
            tagId: matched.tagId,
            confidence: mock.confidence,
            reasoning: 'Mock classification'
        };
    }

    /**
     * Parse the classification model's response.
     */
    private parseClassificationResponse(responseText: string, commands: AggregatedCommand[]): IntentClassificationResult {
        // Extract JSON from response (may be wrapped in markdown code blocks)
        const parsed = extractJson<{
            matched: boolean;
            commandId?: string;
            confidence: number;
            reasoning?: string;
        }>(responseText);

        if (!parsed) {
            return {
                matched: false,
                confidence: 0,
                reasoning: 'Could not parse classification response'
            };
        }

        if (!parsed.matched || !parsed.commandId) {
            return {
                matched: false,
                confidence: parsed.confidence ?? 0,
                reasoning: parsed.reasoning ?? 'No match indicated'
            };
        }

        // Find the matching command
        const matched = commands.find((c) => c.command.commandId === parsed.commandId);

        if (!matched) {
            return {
                matched: false,
                confidence: 0,
                reasoning: `Command ${parsed.commandId} not found in available commands`
            };
        }

        return {
            matched: true,
            command: matched.command,
            tagId: matched.tagId,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning
        };
    }
}

/**
 * Convert LLM context items to a flat context object for the router.
 */
export function prepareContextForRouter(llmContextItems?: Array<{ id: string; context: unknown }>): Record<string, unknown> {
    if (!llmContextItems || llmContextItems.length === 0) {
        return {};
    }
    return convertLlmContextToFlatContext(llmContextItems);
}
