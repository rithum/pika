/** @type {import('jest').Config} */
export default {
    // Use ts-jest preset for TypeScript support
    preset: 'ts-jest/presets/default-esm',

    // Set the test environment
    testEnvironment: 'node',

    // File extensions Jest will handle
    moduleFileExtensions: ['js', 'ts', 'json'],

    // Transform TypeScript files with updated ts-jest configuration
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: 'test/tsconfig.json',
            },
        ],
    },

    // Test file patterns
    testMatch: ['<rootDir>/test/**/*.test.ts', '<rootDir>/test/**/*.spec.ts'],

    // Module name mapping to handle SvelteKit path aliases
    moduleNameMapper: {
        '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
        '^@pika/shared/(.*)$': '<rootDir>/../../packages/shared/$1',
    },

    // Enable ES modules
    extensionsToTreatAsEsm: ['.ts'],

    // Setup files to run before tests
    setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],

    // Collect coverage from source files
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.svelte'],

    // Ignore node_modules and build directories
    testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/build/', '<rootDir>/.svelte-kit/'],
};
