module.exports = {
    extends: ['@pika/eslint-config'],
    parserOptions: {
        project: './tsconfig.json'
    },
    rules: {
        // CLI-specific rules
        'no-console': 'off', // CLI tools need console output
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
}; 