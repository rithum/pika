// Jest setup file for weather service
import 'jest';

// Ensure fetch is available in Node.js test environment
// Note: This might not be necessary in newer Node.js versions that have fetch built-in
if (!global.fetch) {
    const { fetch } = require('cross-fetch');
    global.fetch = fetch;
}
