import { PromptType } from '@aws-sdk/client-bedrock-agent-runtime';

interface PostProcessingEvent {
    invokeModelRawResponse: string;
}
interface PostProcessingResponse {
    promptType: PromptType;
    postProcessingParsedResponse: {
        responseText?: string;
    };
}

/**
 * Extract the text content from the raw LLM response.
 *
 * The response may arrive in two formats:
 *   1. Direct Converse format: `{content: [{text: "..."}]}`
 *   2. Full Converse API envelope: `{output: {message: {content: [{text: "..."}]}}}`
 *
 * Returns the extracted text, or null if the format is unrecognized.
 */
function extractTextFromLlmResponse(raw: string): string | null {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    // Try direct format first: {content: [{text: "..."}]}
    const directContent = parsed.content;
    if (Array.isArray(directContent) && directContent[0]?.text) {
        return directContent[0].text;
    }

    // Try Converse API envelope: {output: {message: {content: [{text: "..."}]}}}
    const envelopeContent = parsed.output?.message?.content;
    if (Array.isArray(envelopeContent) && envelopeContent[0]?.text) {
        return envelopeContent[0].text;
    }

    return null;
}

/**
 * Extract the user-facing text from a collaborator response that may be wrapped
 * in an AgentCommunication__sendMessage tool use block.
 *
 * When a collaborator responds, Bedrock wraps the response in:
 * ```json
 * {"output":{"message":{"content":[{"toolUse":{"name":"AgentCommunication__sendMessage","input":{"content":"actual text"}}}]}}}
 * ```
 *
 * This function extracts "actual text" from that structure, or returns the input unchanged
 * if it's not a wrapped collaborator response.
 */
function extractCollaboratorContent(text: string): string {
    if (!text.startsWith('{')) {
        return text;
    }

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        return text;
    }

    const contentBlocks = parsed.output?.message?.content;
    if (!Array.isArray(contentBlocks)) {
        return text;
    }

    const extractedParts: string[] = [];
    for (const block of contentBlocks) {
        if (block.toolUse?.name === 'AgentCommunication__sendMessage' && block.toolUse.input?.content) {
            extractedParts.push(block.toolUse.input.content);
        } else if (block.text) {
            extractedParts.push(block.text);
        }
    }

    return extractedParts.length > 0 ? extractedParts.join('\n') : text;
}

export const handler = async (event: PostProcessingEvent): Promise<PostProcessingResponse> => {
    console.log('EVENT:', JSON.stringify(event, null, 2));

    // Step 1: Extract the text from the raw LLM response (handles both old and new formats)
    let rawResponse = extractTextFromLlmResponse(event.invokeModelRawResponse);
    if (rawResponse == null) {
        console.warn('Could not parse LLM response JSON, falling back to raw string');
        rawResponse = event.invokeModelRawResponse;
    }

    // Step 2: Extract the content from <final_response> tags
    const parts = rawResponse.match(/<final_response>([\s\S]*?)<\/final_response>/s);
    if (parts == null) {
        throw new Error('Could not parse raw LLM output — no <final_response> tags found');
    }

    // Step 3: The content inside <final_response> may be a raw Converse API envelope
    // from a collaborator (AgentCommunication__sendMessage). Extract the actual text.
    let responseText = extractCollaboratorContent(parts[1].trim());

    const parsedResponse: PostProcessingResponse = {
        promptType: PromptType.POST_PROCESSING,
        postProcessingParsedResponse: {
            responseText
        }
    };

    console.log('RESPONSE:', JSON.stringify(parsedResponse, null, 2));

    return parsedResponse;
};
