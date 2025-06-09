/*
 * These are utils that are safe to use both on the server and the client.
 */

/**
 * Helper function to redact sensitive data from specified attributes
 * @param data - The object containing data to redact
 * @param attributesToRedact - Single attribute name or array of attribute names to redact
 * @returns A new object with specified attributes redacted
 */
function redactData(data: any, attributesToRedact: string | string[]): any {
    if (!data || typeof data !== 'object') {
        return data;
    }
    
    const attributes = Array.isArray(attributesToRedact) ? attributesToRedact : [attributesToRedact];
    const redacted = { ...data };
    
    for (const attr of attributes) {
        if (attr in redacted) {
            redacted[attr] = redactValue(redacted[attr]);
        }
    }
    
    return redacted;
}

/**
 * Recursively redacts a value based on its type
 * @param value - The value to redact
 * @returns The redacted value
 */
function redactValue(value: any): any {
    if (typeof value === 'string') {
        return '[REDACTED]';
    } else if (Array.isArray(value)) {
        return value.map(item => redactValue(item));
    } else if (value && typeof value === 'object') {
        const redactedObj: any = {};
        for (const key in value) {
            if (value.hasOwnProperty(key)) {
                redactedObj[key] = redactValue(value[key]);
            }
        }
        return redactedObj;
    }
    return value; // Return as-is for other types (numbers, booleans, null, etc.)
}

// Export both functions
export { redactData, redactValue };