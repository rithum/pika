/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/test/**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
    collectCoverage: false,
    verbose: true,
    testTimeout: 30000,
    maxWorkers: 1,
    forceExit: true
};
