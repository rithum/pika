// Mock implementation of camelcase-keys for Jest tests
module.exports = function camelcaseKeys(obj, options = {}) {
    if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof RegExp) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => camelcaseKeys(item, options));
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        result[camelKey] = typeof value === 'object' && value !== null ? camelcaseKeys(value, options) : value;
    }
    return result;
};
