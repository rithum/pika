import {
    BedrockAgentCoreClient,
    CreateEventCommand,
    type CreateEventCommandOutput,
    ListMemoryRecordsCommand,
    PayloadType,
    RetrieveMemoryRecordsCommand,
    Role,
    type SearchCriteria
} from '@aws-sdk/client-bedrock-agentcore';
import {
    type AssistantMessageContent,
    type AssistantRationaleContent,
    type MemoryContent,
    type MemoryQueryOptions,
    type PagedRecordsResult,
    type RetrievedMemoryRecordSummary,
    type SimpleAuthenticatedUser,
    type ToolInvocationContent,
    type TypedContentWithRole,
    type UserMemoryFeatureWithMemoryInfo,
    type UserMemoryStrategy,
    type UserMessageContent
} from 'pika-shared/types/chatbot/chatbot-types';
import { tryParseIntoJson } from './model-types-utils';
import { getMemoryNamespaceForStrategyAndUserId, getMemoryStrategies, getRegion } from './utils';

const bedrockAgentCoreClient = new BedrockAgentCoreClient({ region: getRegion() });

// Helper functions to create typed memory content
export function createUserMessageContent(text: string): UserMessageContent {
    return { type: 'user_message', text };
}

export function createAssistantMessageContent(text: string): AssistantMessageContent {
    return { type: 'assistant_message', text };
}

export function createAssistantRationaleContent(text: string): AssistantRationaleContent {
    return { type: 'assistant_rationale', text };
}

export function createToolInvocationContent(invocation: {
    actionGroupInvocationInput?: any;
    knowledgeBaseLookupInput?: any;
    agentCollaboratorInvocationInput?: any;
    codeInterpreterInvocationInput?: any;
}): ToolInvocationContent {
    return { type: 'tool_invocation', invocation };
}

/** Convert typed content to Bedrock conversational payload */
export function memoryContentToPayload(content: MemoryContent, role: Role): PayloadType {
    let textContent: string;

    console.log('[MEMORY] Converting memory content to payload:', {
        contentType: content.type,
        role,
        originalContent: content
    });

    switch (content.type) {
        case 'user_message':
        case 'assistant_message':
        case 'assistant_rationale':
            textContent = content.text;
            break;
        case 'tool_invocation':
            textContent = JSON.stringify(content);
            break;
        default:
            textContent = JSON.stringify(content);
    }

    const payload = {
        conversational: {
            role,
            content: { text: textContent }
        }
    };

    console.log('[MEMORY] Generated payload:', {
        textContent,
        payload: JSON.stringify(payload, null, 2)
    });

    return payload;
}

/**
 * This function is used to create a short term memory event that agentcore may use to
 * turn into one or more long term memory records for the user.
 */
export async function createMemoryEvent(memoryId: string, userId: string, sessionId: string, payload: PayloadType[]): Promise<CreateEventCommandOutput> {
    const command = new CreateEventCommand({
        actorId: userId,
        eventTimestamp: new Date(),
        memoryId,
        payload,
        sessionId
        // branch, clientToken optional
    });

    console.log('[MEMORY] Creating memory event with input:', {
        memoryId,
        userId,
        sessionId,
        payloadCount: payload.length,
        payload: JSON.stringify(payload, null, 2)
    });

    try {
        const response = await bedrockAgentCoreClient.send(command);
        console.log('[MEMORY] CreateEventCommand raw response:', JSON.stringify(response, null, 2));
        return response;
    } catch (error) {
        console.error('[MEMORY] CreateEventCommand failed:', error);
        console.error('[MEMORY] Failed command input was:', {
            memoryId,
            userId,
            sessionId,
            payload: JSON.stringify(payload, null, 2)
        });
        throw error;
    }
}

/** Type-safe wrapper that accepts structured content + roles */
export async function createTypedMemoryEvent(memoryId: string, userId: string, sessionId: string, contents: Array<TypedContentWithRole>) {
    console.log('[MEMORY] Creating typed memory event with input:', {
        memoryId,
        userId,
        sessionId,
        contentsCount: contents.length,
        contents: contents.map(({ content, role }) => ({ content, role }))
    });

    const payload = contents.map(({ content, role }) => memoryContentToPayload(content, role));
    console.log(
        '[MEMORY] Converted typed contents to payload:',
        payload.map((p) => JSON.stringify(p, null, 2))
    );

    return createMemoryEvent(memoryId, userId, sessionId, payload);
}

/**
 * This function is used to get a memory event from long term memory for a specific strategy.
 *
 * - `query`: natural-language query for semantic search
 * - `topK`: how many highest-scoring hits to consider (server-side); we still cap with `maxResults`
 *
 * Note there is a distinction between memory events and memory records. A memory event is a single event that is
 * created when a user interacts with the chatbot. A memory record is a single event that is
 * created when a user interacts with the chatbot and we push the chat message and assistant answer
 * to agentcore to extract memory events from it.  Agentcore turns these events into long term memory records.
 * The short term memory events get reaped afte a period (configurable when you create the memory infra).
 * This method is not about getting whatever raw memory events are still there not reaped, it is about getting the
 * long term memory records that agentcore has created from the memory events.
 */
async function getLongTermMemoryRecords(
    userId: string,
    memoryId: string,
    strategy: UserMemoryStrategy,
    { query, maxResults, nextToken, topK }: MemoryQueryOptions
): Promise<PagedRecordsResult> {
    const searchCriteria: SearchCriteria = { searchQuery: query };
    if (typeof topK === 'number') searchCriteria.topK = topK;

    const namespace = getMemoryNamespaceForStrategyAndUserId(strategy, userId);
    const command = new RetrieveMemoryRecordsCommand({
        memoryId: memoryId,
        namespace,
        searchCriteria,
        maxResults,
        nextToken
    });

    console.log('[MEMORY] Retrieving long term memory records with input:', {
        userId,
        memoryId,
        strategy,
        namespace,
        query,
        maxResults,
        nextToken,
        topK
    });

    try {
        const resp = await bedrockAgentCoreClient.send(command);
        console.log('[MEMORY] RetrieveMemoryRecordsCommand raw response:', JSON.stringify(resp, null, 2));

        const records: RetrievedMemoryRecordSummary[] =
            resp?.memoryRecordSummaries?.map((summary) => {
                const parsedContent = tryParseIntoJson(summary.content?.text ?? '');
                console.log('[MEMORY] Processing memory record:', {
                    memoryRecordId: summary.memoryRecordId,
                    rawContentText: summary.content?.text,
                    parsedContent,
                    score: summary.score,
                    createdAt: summary.createdAt
                });

                return {
                    memoryRecordId: summary.memoryRecordId,
                    content: parsedContent,
                    memoryStrategyId: summary.memoryStrategyId,
                    namespaces: summary.namespaces,
                    createdAt: summary.createdAt,
                    score: summary.score
                };
            }) ?? [];

        console.log('[MEMORY] Final processed records count:', records.length);
        return { records, nextToken: resp?.nextToken };
    } catch (error) {
        console.error('[MEMORY] RetrieveMemoryRecordsCommand failed:', error);
        console.error('[MEMORY] Failed command input was:', {
            userId,
            memoryId,
            strategy,
            namespace,
            query,
            maxResults,
            nextToken,
            topK
        });
        throw error;
    }
}

/**
 * This function gets the long term memory records and converts them into XML instructions like this to be used
 * by the LLM to help it reason about the user's intent:
 *
 * <user-preferences>...</user-preferences><user-semantics>...</user-semantics>
 *
 * Keep k small (3–5) to avoid prompt bloat.
 */
export async function getMemoryInstructions(
    simpleUser: SimpleAuthenticatedUser<any>,
    memoryFeature: UserMemoryFeatureWithMemoryInfo,
    firstUserMessage: string,
    k: number = Math.min(memoryFeature.maxMemoryRecordsPerPrompt, 5)
) {
    console.log('[MEMORY] Getting memory instructions with input:', {
        userId: simpleUser.userId,
        memoryId: memoryFeature.memoryId,
        strategies: memoryFeature.strategies,
        firstUserMessage,
        k,
        maxMemoryRecordsPerPrompt: memoryFeature.maxMemoryRecordsPerPrompt
    });

    // Get memory records for all strategies simultaneously
    const memoryResults = await Promise.all(
        memoryFeature.strategies.map((strategy) =>
            getLongTermMemoryRecords(simpleUser.userId, memoryFeature.memoryId, strategy, {
                query: firstUserMessage,
                maxResults: k,
                topK: k
            })
        )
    );

    console.log(
        '[MEMORY] Raw memory results for all strategies:',
        memoryResults.map((result, index) => ({
            strategy: memoryFeature.strategies[index],
            recordCount: result.records.length,
            nextToken: result.nextToken,
            records: result.records
        }))
    );

    // Create XML elements for each strategy that has results
    const xml: string[] = [];

    for (let i = 0; i < memoryFeature.strategies.length; i++) {
        const strategy = memoryFeature.strategies[i];
        const { records } = memoryResults[i];
        if (!records.length) {
            console.log(`[MEMORY] No records found for strategy "${strategy}"`);
            continue;
        }

        console.log(`[MEMORY] User ${strategy}:`, records);
        const elementName = `user-${strategy}`;
        const content = records
            .map((r) => {
                const c = r.content;
                let processedContent: string;

                if (typeof c === 'string') {
                    processedContent = c;
                } else if (c && typeof c === 'object' && 'type' in c) {
                    switch (c.type) {
                        case 'user_message':
                        case 'assistant_message':
                        case 'assistant_rationale':
                            processedContent = c.text;
                            break;
                        case 'tool_invocation':
                            processedContent = `Tool invocation: ${JSON.stringify(c.invocation)}`;
                            break;
                        default:
                            processedContent = JSON.stringify(c);
                    }
                } else {
                    processedContent = JSON.stringify(c ?? '');
                }

                console.log(`[MEMORY] Processed record ${r.memoryRecordId}:`, {
                    originalContent: c,
                    processedContent,
                    score: r.score
                });

                return processedContent;
            })
            .filter(Boolean) // Filter out empty or bad content (false, 0, "", null, undefined, NaN)
            .join('\n\t');

        const xmlElement = `<${elementName}>\n\t${content}\n</${elementName}>`;
        console.log(`[MEMORY] Generated XML for strategy "${strategy}":`, xmlElement);
        xml.push(xmlElement);
    }

    const finalXml = xml.join('');
    console.log('[MEMORY] Final memory instructions XML:', finalXml);
    return finalXml;
}

/**
 * This is designed to be used by clients that want to extract all the global memory records for a given strategy.
 * Note it is a paged API.
 */
export async function getAllMemoryRecords(userId: string, memoryId: string, strategy: UserMemoryStrategy, nextToken?: string): Promise<PagedRecordsResult> {
    try {
        const memoryStrategies = getMemoryStrategies();
        const memoryStrategyId = memoryStrategies[strategy];
        const namespace = getMemoryNamespaceForStrategyAndUserId(strategy, userId);
        const command = new ListMemoryRecordsCommand({
            memoryId,
            namespace,
            memoryStrategyId,
            nextToken
        });

        console.log('[MEMORY] Getting all memory records with input:', {
            userId,
            memoryId,
            strategy,
            memoryStrategyId,
            namespace,
            nextToken
        });
        const resp = await bedrockAgentCoreClient.send(command);
        console.log('[MEMORY] ListMemoryRecordsCommand raw response:', JSON.stringify(resp, null, 2));

        const records: RetrievedMemoryRecordSummary[] =
            resp?.memoryRecordSummaries?.map((summary) => {
                const parsedContent = tryParseIntoJson(summary.content?.text ?? '');
                console.log('[MEMORY] Processing memory record from getAllMemoryRecords:', {
                    memoryRecordId: summary.memoryRecordId,
                    rawContentText: summary.content?.text,
                    parsedContent,
                    score: summary.score,
                    createdAt: summary.createdAt
                });

                return {
                    memoryRecordId: summary.memoryRecordId,
                    content: parsedContent,
                    memoryStrategyId: summary.memoryStrategyId,
                    namespaces: summary.namespaces,
                    createdAt: summary.createdAt,
                    score: summary.score
                };
            }) ?? [];

        console.log('[MEMORY] Final processed records count from getAllMemoryRecords:', records.length);
        return { records, nextToken: resp?.nextToken };
    } catch (error) {
        console.error('[MEMORY] ListMemoryRecordsCommand failed:', error);
        console.error('[MEMORY] Failed command input was:', {
            userId,
            memoryId,
            strategy,
            nextToken
        });
        throw error;
    }
}

/**
 * Builds up memory content for a single chat turn to give to agentcore to create a memory event.
 *
 * If both rationale and tool invocation are present, we will only include the rationale trace.
 */
export function buildTypedMemoryContents(
    questionFromUser: string,
    responseMsg: string,
    traces: Array<{
        orchestrationTrace?: {
            rationale?: { text?: string };
            invocationInput?: {
                actionGroupInvocationInput?: any;
                knowledgeBaseLookupInput?: any;
                agentCollaboratorInvocationInput?: any;
                codeInterpreterInvocationInput?: any;
            };
        };
    }>
): Array<TypedContentWithRole> {
    console.log('[MEMORY] Building typed memory contents with input:', {
        questionFromUser,
        responseMsg,
        tracesCount: traces?.length ?? 0,
        traces: traces?.map((trace, index) => ({
            traceIndex: index,
            hasRationale: !!trace.orchestrationTrace?.rationale?.text,
            rationaleText: trace.orchestrationTrace?.rationale?.text,
            hasInvocationInput: !!trace.orchestrationTrace?.invocationInput,
            invocationInput: trace.orchestrationTrace?.invocationInput
        }))
    });

    const items: Array<TypedContentWithRole> = [{ content: createUserMessageContent(questionFromUser), role: Role.USER }];

    for (const [index, trace] of (traces ?? []).entries()) {
        const r = trace.orchestrationTrace?.rationale?.text;
        const ii = trace.orchestrationTrace?.invocationInput;

        console.log(`[MEMORY] Processing trace ${index}:`, {
            hasRationale: !!r,
            rationaleText: r,
            hasInvocationInput: !!ii,
            invocationInput: ii
        });

        if (r) {
            const rationaleContent = createAssistantRationaleContent(r);
            console.log(`[MEMORY] Adding rationale content for trace ${index}:`, rationaleContent);
            items.push({ content: rationaleContent, role: Role.ASSISTANT });
        } else if (ii) {
            // Only include if there's actual invocation data
            const invocationInput = {
                actionGroupInvocationInput: ii.actionGroupInvocationInput,
                knowledgeBaseLookupInput: ii.knowledgeBaseLookupInput,
                agentCollaboratorInvocationInput: ii.agentCollaboratorInvocationInput,
                codeInterpreterInvocationInput: ii.codeInterpreterInvocationInput
            };
            const hasInvocation =
                invocationInput.actionGroupInvocationInput ??
                invocationInput.knowledgeBaseLookupInput ??
                invocationInput.agentCollaboratorInvocationInput ??
                invocationInput.codeInterpreterInvocationInput;

            console.log(`[MEMORY] Checking invocation input for trace ${index}:`, {
                invocationInput,
                hasInvocation: !!hasInvocation
            });

            if (hasInvocation) {
                const toolContent = createToolInvocationContent(invocationInput);
                console.log(`[MEMORY] Adding tool invocation content for trace ${index}:`, toolContent);
                items.push({ content: toolContent, role: Role.TOOL });
            }
        }
    }

    const assistantMessageContent = createAssistantMessageContent(responseMsg);
    console.log('[MEMORY] Adding final assistant message content:', assistantMessageContent);
    items.push({ content: assistantMessageContent, role: Role.ASSISTANT });

    console.log('[MEMORY] Final built memory contents:', {
        totalItems: items.length,
        items: items.map((item, index) => ({
            index,
            role: item.role,
            contentType: item.content.type,
            content: item.content
        }))
    });

    return items;
}
