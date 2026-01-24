/**
 * Template Interpolation Utilities
 *
 * Provides utilities for interpolating template strings with context values.
 * Used by the Intent Router to fill in command templates with widget context.
 *
 * @since 0.18.0
 */

/**
 * Interpolates a template string with values from a context object.
 * Supports dot notation for nested paths (e.g., {{context.currentJob.jobId}}).
 *
 * @param template - The template string containing {{path}} placeholders
 * @param context - The context object to pull values from
 * @returns The interpolated string
 *
 * @example
 * ```typescript
 * const template = 'Opening job: {{context.currentJob.name}}';
 * const context = { context: { currentJob: { name: 'My Job' } } };
 * interpolateString(template, context); // 'Opening job: My Job'
 * ```
 */
export function interpolateString(template: string, context: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const value = getValueAtPath(context, path.trim());
        if (value === undefined || value === null) {
            return match; // Keep the original placeholder if value not found
        }
        return String(value);
    });
}

/**
 * Interpolates all string values in an object recursively.
 * Non-string values are passed through unchanged.
 *
 * @param obj - The object containing template strings
 * @param context - The context object to pull values from
 * @returns A new object with all string values interpolated
 *
 * @example
 * ```typescript
 * const command = {
 *   type: 'renderTag',
 *   tagId: 'rcs.job',
 *   data: {
 *     jobId: '{{context.currentJob.jobId}}',
 *     tab: 'overview'
 *   }
 * };
 * const context = { context: { currentJob: { jobId: '123' } } };
 * interpolateObject(command, context);
 * // { type: 'renderTag', tagId: 'rcs.job', data: { jobId: '123', tab: 'overview' } }
 * ```
 */
export function interpolateObject<T>(obj: T, context: Record<string, unknown>): T {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj === 'string') {
        return interpolateString(obj, context) as T;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => interpolateObject(item, context)) as T;
    }

    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = interpolateObject(value, context);
        }
        return result as T;
    }

    // Primitives (number, boolean) pass through unchanged
    return obj;
}

/**
 * Gets a value from an object using dot notation path.
 *
 * @param obj - The object to get the value from
 * @param path - The dot notation path (e.g., "context.currentJob.jobId")
 * @returns The value at the path, or undefined if not found
 *
 * @example
 * ```typescript
 * const obj = { context: { currentJob: { jobId: '123' } } };
 * getValueAtPath(obj, 'context.currentJob.jobId'); // '123'
 * getValueAtPath(obj, 'context.missing.path'); // undefined
 * ```
 */
export function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

/**
 * Checks if all required context paths exist in the context object.
 * Used to determine if a command's requiresContext conditions are met.
 *
 * @param context - The context object to check
 * @param requiredPaths - Array of dot notation paths that must exist
 * @returns true if all paths exist and have non-null/undefined values
 *
 * @example
 * ```typescript
 * const context = { currentJob: { jobId: '123', name: 'Test' } };
 * hasRequiredContext(context, ['currentJob.jobId']); // true
 * hasRequiredContext(context, ['currentJob.missing']); // false
 * ```
 */
export function hasRequiredContext(context: Record<string, unknown>, requiredPaths: string[]): boolean {
    for (const path of requiredPaths) {
        const value = getValueAtPath(context, path);
        if (value === undefined || value === null) {
            return false;
        }
    }
    return true;
}

/**
 * Converts LLM context items to a flat context object for template interpolation.
 * Groups context by source and extracts data.
 *
 * @param llmContextItems - Array of LLM context items from the request
 * @returns A flat context object suitable for template interpolation
 *
 * @example
 * ```typescript
 * const items = [
 *   { id: 'job-context', context: { currentJob: { jobId: '123' } } }
 * ];
 * convertLlmContextToFlatContext(items);
 * // { currentJob: { jobId: '123' } }
 * ```
 */
export function convertLlmContextToFlatContext(
    llmContextItems: Array<{ id: string; context: unknown }>
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const item of llmContextItems) {
        if (item.context && typeof item.context === 'object') {
            // Merge the context data into the result
            Object.assign(result, item.context);
        }
    }

    return result;
}
