module.exports = {
    preset: 'ts-jest/presets/default-esm',
    extensionsToTreatAsEsm: ['.ts'],
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.test.ts'],
    // Exclude integration tests that require STAGE, AWS credentials, and network (run via test:integration)
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/chat-admin.test.ts', '<rootDir>/test/chat-session-os.test.ts'],
    transform: {
        '^.+\\.(ts|tsx)$': [
            'ts-jest',
            {
                useESM: true
            }
        ]
    },
    transformIgnorePatterns: ['node_modules/(?!(camelcase-keys|map-obj|snakecase-keys|@pika)/)'],
    moduleNameMapper: {
        '^camelcase-keys$': '<rootDir>/test/__mocks__/camelcase-keys.js',
        '^snakecase-keys$': '<rootDir>/test/__mocks__/snakecase-keys.js',
        '^pika-shared/(.*)$': '<rootDir>/../../packages/shared/src/$1'
    },
    collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/index.ts'],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html']
};
