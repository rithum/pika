module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/*.(test|spec).+(ts|tsx|js)'],
    testPathIgnorePatterns: ['/node_modules/', '/__tests__/fixtures/'],
    transform: {
        '^.+\\.(ts|tsx)$': [
            'ts-jest',
            {
                tsconfig: {
                    module: 'CommonJS',
                    moduleResolution: 'node'
                }
            }
        ]
    },
    moduleNameMapper: {
        '^(\\.\\.?/.*)\\.js$': '$1',
        '^chalk$': '<rootDir>/src/__mocks__/chalk.cjs',
        '^ora$': '<rootDir>/src/__mocks__/ora.cjs'
    },
    collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/index.ts'],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html']
};
