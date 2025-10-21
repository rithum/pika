import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { type InstructionAugmentationScopeType, type InvocationScopes, type SemanticDirective, type SemanticDirectiveScope } from 'pika-shared/types/chatbot/chatbot-types';
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

Return only the ids that should be added as a json array inside an <answer></answer> tag.  If no instructions apply return an empty array []
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
