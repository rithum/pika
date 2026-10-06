// Mock implementation of p-retry (ESM-only package) for Jest tests.
// Runs the wrapped function once with no retries.
class AbortError extends Error {
    constructor(message) {
        super(message instanceof Error ? message.message : message);
        this.name = 'AbortError';
        if (message instanceof Error) {
            this.originalError = message;
        }
    }
}

module.exports = async function pRetry(input, _options) {
    return input(1);
};
module.exports.default = module.exports;
module.exports.AbortError = AbortError;
