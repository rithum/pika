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
        return value.map((item) => redactValue(item));
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

/**
 * Validates that a scope value doesn't contain the '#' character which is reserved for scope construction
 */
function validateScopeValue(scopeValue: string | number | Record<string, string | number>, scopeType: string): void {
    if (typeof scopeValue === 'string' && scopeValue.includes('#')) {
        throw new Error(`Scope value cannot contain '#' character. Found in ${scopeType} scope value: ${scopeValue}`);
    }
    if (typeof scopeValue === 'object' && scopeValue !== null) {
        for (const [key, value] of Object.entries(scopeValue)) {
            if (typeof value === 'string' && value.includes('#')) {
                throw new Error(`Scope value cannot contain '#' character. Found in ${scopeType}.${key}: ${value}`);
            }
        }
    }
}

/**
 * Constructs a scope string from scopeType and scopeValue
 * @param scopeType - The type of scope (chatapp, agent, tool, entity, agent-entity)
 * @param scopeValue - The value(s) for the scope
 * @returns The constructed scope string
 */
function constructScope(scopeType: string, scopeValue: string | number | Record<string, string | number>): string {
    // Validate scope value doesn't contain '#'
    validateScopeValue(scopeValue, scopeType);

    switch (scopeType) {
        case 'chatapp':
        case 'agent':
        case 'tool':
        case 'entity':
            return `${scopeType}#${scopeValue}`;
        case 'agent-entity':
            if (typeof scopeValue !== 'object' || scopeValue === null) {
                throw new Error('agent-entity scopeType requires an object with agent and entity properties');
            }

            const agentEntityValue = scopeValue as Record<string, string | number>;
            if (!('agent' in agentEntityValue) || !('entity' in agentEntityValue)) {
                throw new Error('agent-entity scopeType requires an object with both agent and entity properties');
            }

            return `agent#${agentEntityValue.agent}#entity#${agentEntityValue.entity}`;

        default:
            throw new Error(`Unsupported scopeType: ${scopeType}`);
    }
}

/**
 * Parses a scope string back into scopeType and scopeValue
 * @param scope - The scope string to parse
 * @returns Object containing scopeType and scopeValue
 */
function parseScope(scope: string): { scopeType: string; scopeValue: string | number | Record<string, string | number> } {
    if (!scope || typeof scope !== 'string') {
        throw new Error('Invalid scope: must be a non-empty string');
    }

    const parts = scope.split('#');
    if (parts.length < 2) {
        throw new Error(`Invalid scope format: ${scope}. Expected format: scopeType#scopeValue`);
    }

    const [firstType, firstValue, ...remaining] = parts;

    // Handle compound scopes (agent-entity)
    if (remaining.length >= 2 && firstType === 'agent' && remaining[0] === 'entity') {
        return {
            scopeType: 'agent-entity',
            scopeValue: {
                agent: firstValue,
                entity: remaining[1]
            }
        };
    }

    // Handle simple scopes
    if (remaining.length === 0) {
        // For simple scopes, try to convert to number if it's numeric
        const numericValue = Number(firstValue);
        const scopeValue = !isNaN(numericValue) && isFinite(numericValue) ? numericValue : firstValue;

        return {
            scopeType: firstType,
            scopeValue: scopeValue
        };
    }

    throw new Error(`Unsupported scope format: ${scope}`);
}

/**
 * Useful for simple hashing like to figure out if content has changed since last sent or something.
 */
async function getContentHashString(content: unknown): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(content));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Export both functions
export { redactData, redactValue, constructScope, parseScope, getContentHashString };
