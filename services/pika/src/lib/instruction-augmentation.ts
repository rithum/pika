import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
    type ChatSession,
    type InstructionAugmentationScopeType,
    type InvocationScopes,
    type LLMContextItem,
    type RecordOrUndef,
    type SemanticDirective,
    type SemanticDirectiveScope
} from 'pika-shared/types/chatbot/chatbot-types';
import { getBedrockClient } from './bedrock-agent';
import { searchSemanticDirectives } from './chat-admin-ddb';
import { jsonparse } from './jsonparse';
import { buildModelInvokeBody, getModelResponse, MODELS } from './model-types-utils';

/**
 * Returns the additional user prompt instructions that should be applied to the user prompt.  It also returns the full semantic directive objects that were applied.
 */
export async function getAdditionalUserPromptInstructions(
    scopes: InvocationScopes,
    userPrompt: string,
    model: string = MODELS.AMAZON.NovaLite.id
    //model: string = MODELS.ANTHROPIC.Claude3_5Haiku.id,
    //model: string = MODELS.META.Llama3_2_11B_Instruct.id,
): Promise<{ instructions: string; appliedDirectives: SemanticDirective[] }> {
    console.log('[instruction-augmentation] Processing user prompt for scopes:', Object.keys(scopes));

    const bedrockClient = getBedrockClient();

    const allDirectives = await getMatchingSemanticDirectives(scopes);
    console.log('[instruction-augmentation] Found', allDirectives.length, 'matching directives');

    // Return early if no instructions are found
    if (allDirectives.length === 0) {
        console.log('[instruction-augmentation] No directives found, returning empty result');
        return { instructions: '', appliedDirectives: [] };
    }

    console.log('[instruction-augmentation] Directive IDs:', allDirectives.map((directive) => directive.id).join(', '));

    // Build the instructions prompt - use unique ID instead of scope
    const directivesString = allDirectives.map((directive) => `<instruction><id>${directive.id}</id><description>${directive.description}</description></instruction>`).join('\n');

    const prompt = `Given this user query determine if any of the additional instructions need to be applied.

Return only the ids that should be added as a json array inside an <answer></answer> tag, ordered from most relevant to least relevant.  If no instructions apply return an empty array []
Do not include any other text or reasoning.  Just the json array inside the <answer></answer> tag.
<instructions>
${directivesString}
</instructions>

<example_output><answer>["instruction-id-1", "instruction-id-2", "instruction-id-3"]</answer></example_output>

<user_query>${userPrompt}</user_query>`;

    console.log('[instruction-augmentation] Prompt:', prompt);

    // Call LLM to determine applicable instructions
    const body = buildModelInvokeBody(model, {
        maxTokens: 2000,
        topK: 250,
        temperature: 1,
        topP: 0.999,
        messages: [
            {
                role: 'user',
                content: [{ type: 'text', text: prompt }]
            }
        ]
    });

    let response = await bedrockClient.send(
        new InvokeModelCommand({
            modelId: model,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(body)
        })
    );

    // Get and parse the model response
    const responseBody = new TextDecoder().decode(response.body);
    let llmResponse = getModelResponse(model, responseBody);

    // Extract the answer from the response
    const answerMatch = llmResponse.match(/<\/? *answer>(.*?)<\/? *answer>/s);
    const rawAnswer = answerMatch?.[1] ?? '[]';
    let answer: string[] = jsonparse<string[]>(rawAnswer);

    console.log('[instruction-augmentation] LLM selected directive IDs:', answer);

    // Create a lookup map of the directives by unique ID
    const directivesById = allDirectives.reduce(
        (acc, directive) => {
            acc[directive.id] = directive;
            return acc;
        },
        {} as Record<string, SemanticDirective>
    );

    // Map the LLM-chosen directive IDs to the full directive objects
    let chosenDirectives = answer
        .map((directiveId) => {
            const directive = directivesById[directiveId];
            if (!directive) {
                console.log(`[instruction-augmentation] Warning: Directive ID "${directiveId}" not found`);
            }
            return directive;
        })
        .filter((directive) => directive != null);

    console.log('[instruction-augmentation] Applied directives:', chosenDirectives.map((d) => d.id).join(', '));

    // Return early if no directives were chosen
    if (chosenDirectives.length === 0) {
        console.log('[instruction-augmentation] No directives chosen, returning empty result');
        return { instructions: '', appliedDirectives: [] };
    }

    // Extract just the instructions to return
    let finalInstructions = chosenDirectives.map((directive) => directive.instructions).join('\n') + '\n';

    console.log('[instruction-augmentation] Generated', finalInstructions.length, 'characters of additional instructions');

    // Return the prompt instructions and the full directive objects
    return { instructions: finalInstructions, appliedDirectives: chosenDirectives };
}

async function getMatchingSemanticDirectives(scopes: InvocationScopes): Promise<SemanticDirective[]> {
    // Return early if no scopes to search
    if (Object.keys(scopes).length === 0) {
        console.log('[instruction-augmentation] No scopes provided, returning empty array');
        return [];
    }

    // Convert InstructionAugmentationMatchingScopes to SemanticDirectiveScope array
    const scopeArray: SemanticDirectiveScope[] = [];

    // Iterate through each scope type and add all values
    for (const [scopeType, values] of Object.entries(scopes)) {
        if (values && values.length > 0) {
            for (const value of values) {
                scopeArray.push({
                    scopeType: scopeType as InstructionAugmentationScopeType,
                    scopeValue: value
                });
            }
        }
    }

    try {
        const searchParams = {
            scopes: scopeArray,
            limit: 100, // Reasonable limit for instruction augmentation
            sortOrder: 'desc' as const,
            excludeDisabled: true // Only get active directives
        };

        // Use the existing searchSemanticDirectives function which internally uses searchByScopes
        const [directives] = await searchSemanticDirectives(searchParams);

        return directives;
    } catch (error) {
        console.error('[instruction-augmentation] Failed to retrieve semantic directives:', error);
        // Return empty array rather than throwing - instruction augmentation should be resilient
        return [];
    }
}

/**
 * Filters LLM context items based on relevance to the user's prompt and session history.
 * Always includes items where origin === 'user'.
 * Uses a cheaper LLM to determine relevance for auto-added contexts.
 * Skips contexts that have already been sent and haven't changed (based on contentHash).
 */
export async function filterLLMContextItems(
    contextItems: LLMContextItem[],
    userPrompt: string,
    chatSession: ChatSession<RecordOrUndef>,
    model: string = MODELS.AMAZON.NovaLite.id
): Promise<LLMContextItem[]> {
    console.log('[context-filtering] Processing', contextItems.length, 'context items for user prompt');

    // Return early if no context items
    if (contextItems.length === 0) {
        console.log('[context-filtering] No context items provided, returning empty array');
        return [];
    }

    // Check each context against session history to filter out unchanged contexts
    const sentContexts = chatSession.sentContexts || {};
    const contextsToConsider: LLMContextItem[] = [];

    for (const item of contextItems) {
        const sentRecord = sentContexts[item.id];

        // Always include user-requested contexts
        if (item.origin === 'user') {
            console.log(`[context-filtering] Including user-requested context: ${item.id}`);
            contextsToConsider.push(item);
            continue;
        }

        // For auto contexts, check if they've been sent before
        if (!sentRecord) {
            console.log(`[context-filtering] Context ${item.id} never sent before, including`);
            contextsToConsider.push(item);
            continue;
        }

        // Check if content has changed
        if (sentRecord.contentHash !== item.contentHash) {
            console.log(`[context-filtering] Context ${item.id} has changed (hash mismatch), including`);
            contextsToConsider.push(item);
            continue;
        }

        // Check if context has expired based on maxAgeMs
        if (item.maxAgeMs !== undefined && item.maxAgeMs >= 0) {
            const sentAtTime = new Date(sentRecord.lastSentAt).getTime();
            const nowTime = Date.now();
            const ageMs = nowTime - sentAtTime;

            if (item.maxAgeMs === 0) {
                // maxAgeMs === 0 means always re-include
                console.log(`[context-filtering] Context ${item.id} has maxAgeMs=0, always including`);
                contextsToConsider.push(item);
                continue;
            }

            if (ageMs > item.maxAgeMs) {
                console.log(`[context-filtering] Context ${item.id} is stale (age: ${ageMs}ms > maxAge: ${item.maxAgeMs}ms), including`);
                contextsToConsider.push(item);
                continue;
            }
        }

        console.log(`[context-filtering] Context ${item.id} already sent and unchanged, skipping`);
    }

    console.log('[context-filtering] After history check:', contextsToConsider.length, 'contexts to consider');

    // Separate user-requested contexts from auto-added contexts within contexts to consider
    const userRequestedContexts = contextsToConsider.filter((item) => item.origin === 'user');
    const autoContexts = contextsToConsider.filter((item) => item.origin === 'auto');

    console.log('[context-filtering] User-requested contexts:', userRequestedContexts.length);
    console.log('[context-filtering] Auto-added contexts to filter:', autoContexts.length);

    // If no auto-contexts to filter, just return user-requested ones
    if (autoContexts.length === 0) {
        console.log('[context-filtering] No auto-contexts to filter, returning', userRequestedContexts.length, 'user-requested contexts');
        return userRequestedContexts;
    }

    const bedrockClient = getBedrockClient();

    // Build the contexts string for LLM filtering
    const contextsString = autoContexts.map((context) => `<context><id>${context.id}</id><description>${context.description}</description></context>`).join('\n');

    const prompt = `Given this user query, determine which of the available contexts are relevant and should be included in the prompt to help answer the question.

Return only the IDs of relevant contexts as a JSON array inside an <answer></answer> tag. If no contexts are relevant, return an empty array [].
Do not include any other text or reasoning. Just the JSON array inside the <answer></answer> tag.

<contexts>
${contextsString}
</contexts>

<example_output><answer>["context-id-1", "context-id-2", "context-id-3"]</answer></example_output>

<user_query>${userPrompt}</user_query>`;

    console.log('[context-filtering] Calling LLM to filter contexts');

    // Call LLM to determine applicable contexts
    const body = buildModelInvokeBody(model, {
        maxTokens: 2000,
        topK: 250,
        temperature: 1,
        topP: 0.999,
        messages: [
            {
                role: 'user',
                content: [{ type: 'text', text: prompt }]
            }
        ]
    });

    let response = await bedrockClient.send(
        new InvokeModelCommand({
            modelId: model,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(body)
        })
    );

    // Get and parse the model response
    const responseBody = new TextDecoder().decode(response.body);
    let llmResponse = getModelResponse(model, responseBody);

    // Extract the answer from the response
    const answerMatch = llmResponse.match(/<\/? *answer>(.*?)<\/? *answer>/s);
    const rawAnswer = answerMatch?.[1] ?? '[]';
    let selectedIds: string[] = jsonparse<string[]>(rawAnswer);

    console.log('[context-filtering] LLM selected context IDs:', selectedIds);

    // Create a lookup map of auto-contexts by ID
    const autoContextsById = autoContexts.reduce(
        (acc, context) => {
            acc[context.id] = context;
            return acc;
        },
        {} as Record<string, LLMContextItem>
    );

    // Map the LLM-chosen IDs to the full context objects
    const chosenAutoContexts = selectedIds
        .map((contextId) => {
            const context = autoContextsById[contextId];
            if (!context) {
                console.log(`[context-filtering] Warning: Context ID "${contextId}" not found`);
            }
            return context;
        })
        .filter((context) => context != null);

    console.log('[context-filtering] Selected', chosenAutoContexts.length, 'relevant auto-contexts');

    // Combine user-requested contexts with LLM-filtered auto-contexts
    const finalContexts = [...userRequestedContexts, ...chosenAutoContexts];

    console.log('[context-filtering] Returning', finalContexts.length, 'total contexts');

    return finalContexts;
}
