/**
 * JSON Extraction Utilities
 *
 * Utilities for extracting JSON from text that may be wrapped in markdown
 * code blocks or contain other surrounding content. Useful for parsing
 * LLM responses that include JSON.
 *
 * @since 0.18.0
 */

/**
 * Extract JSON string from text that may be wrapped in markdown code blocks.
 *
 * Handles:
 * - ```json ... ```
 * - ``` ... ```
 * - Raw JSON objects { ... }
 * - Raw JSON arrays [ ... ]
 *
 * @param text - The text containing JSON
 * @returns The extracted JSON string, or null if no JSON found
 */
export function extractJsonString(text: string): string | null {
    if (!text || typeof text !== 'string') {
        return null;
    }

    const trimmed = text.trim();

    // Try markdown code block first (```json ... ``` or ``` ... ```)
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch?.[1]) {
        return codeBlockMatch[1].trim();
    }

    // Try to find a JSON object
    const objectMatch = trimmed.match(/(\{[\s\S]*\})/);
    if (objectMatch?.[1]) {
        return objectMatch[1].trim();
    }

    // Try to find a JSON array
    const arrayMatch = trimmed.match(/(\[[\s\S]*\])/);
    if (arrayMatch?.[1]) {
        return arrayMatch[1].trim();
    }

    return null;
}

/**
 * Extract and parse JSON from text that may be wrapped in markdown code blocks.
 *
 * @param text - The text containing JSON
 * @returns The parsed JSON object, or null if extraction or parsing failed
 */
export function extractJson<T = unknown>(text: string): T | null {
    const jsonString = extractJsonString(text);
    if (!jsonString) {
        return null;
    }

    try {
        return JSON.parse(jsonString) as T;
    } catch {
        return null;
    }
}

/**
 * Extract and parse JSON from text, with a fallback value if extraction fails.
 *
 * @param text - The text containing JSON
 * @param fallback - Value to return if extraction or parsing fails
 * @returns The parsed JSON object or the fallback value
 */
export function extractJsonOrDefault<T>(text: string, fallback: T): T {
    const result = extractJson<T>(text);
    return result !== null ? result : fallback;
}
