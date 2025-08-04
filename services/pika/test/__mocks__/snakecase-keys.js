// Mock implementation of snakecase-keys for Jest tests
module.exports = function snakecaseKeys(obj, options = {}) {
    if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof RegExp) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => snakecaseKeys(item, options));
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        result[snakeKey] = typeof value === 'object' && value !== null ? snakecaseKeys(value, options) : value;
    }
    return result;
};
