/**
 * Classification Prompt Builder
 *
 * Builds prompts for a fast LLM to classify user messages against
 * registered commands.
 *
 * @since 0.18.0
 */

import type { AggregatedCommand } from 'pika-shared/types/chatbot/intent-router-types';

/**
 * Build a classification prompt for use by a fast LLM.
 *
 * @param userMessage - The user's message to classify
 * @param commands - Available commands to match against
 * @param context - Current widget context (for reference in reasoning)
 * @returns The classification prompt
 */
export function buildClassificationPrompt(
    userMessage: string,
    commands: AggregatedCommand[],
    context: Record<string, unknown>
): string {
    // Escape user message to prevent prompt injection
    const escapedMessage = userMessage.replace(/"/g, '\\"');

    // Build command descriptions
    const commandDescriptions = commands
        .map((cmd, index) => {
            const c = cmd.command;
            const examples = c.examples.map((e) => `    - "${e.replace(/"/g, '\\"')}"`).join('\n');
            const antiExamples = c.antiExamples?.length 
                ? c.antiExamples.map((e) => `    - "${e.replace(/"/g, '\\"')}"`).join('\n') 
                : '';

            return `
### Command ${index + 1}: ${c.commandId}
**Description:** ${c.description}
**Examples that SHOULD match:**
${examples}
${antiExamples ? `**Examples that should NOT match:**\n${antiExamples}` : ''}`;
        })
        .join('\n');

    // Build context summary if available (truncate if too large)
    let contextSummary = '';
    if (Object.keys(context).length > 0) {
        const contextJson = JSON.stringify(context, null, 2);
        // Truncate context if it's too large to avoid very long prompts
        const maxContextLength = 2000;
        const truncatedContext = contextJson.length > maxContextLength 
            ? contextJson.substring(0, maxContextLength) + '\n... (truncated)'
            : contextJson;
        contextSummary = `
## Available Context
The user currently has the following context available:
${truncatedContext}`;
    }

    return `You are an intent classification system. Your job is to determine if a user's message matches any of the available commands.

## Available Commands
${commandDescriptions}

${contextSummary}

## User Message
"${escapedMessage}"

## Instructions
1. Analyze the user's message and determine if it matches any of the commands above.
2. Consider the examples and anti-examples carefully - anti-examples show queries that are similar but should NOT match.
3. A match should be clear and intentional, not just semantically similar.
4. If multiple commands could match, choose the one with the highest relevance.

## Response Format
Respond with a JSON object (no markdown formatting):
{
  "matched": true/false,
  "commandId": "the_command_id" (if matched),
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this does or doesn't match"
}

Important:
- Only set matched=true if you're confident the user wants this specific action
- Questions like "what is X?" or "how do I X?" are usually NOT action commands
- Commands should be imperative requests, not informational questions
- If unsure, set matched=false with lower confidence`;
}

/**
 * Build a simpler prompt for testing/debugging purposes.
 */
export function buildSimpleClassificationPrompt(userMessage: string, commands: AggregatedCommand[]): string {
    const commandList = commands.map((cmd) => `- ${cmd.command.commandId}: ${cmd.command.description}`).join('\n');

    return `Classify this message: "${userMessage}"

Available commands:
${commandList}

Respond with JSON: { "matched": boolean, "commandId": string | null, "confidence": number, "reasoning": string }`;
}
