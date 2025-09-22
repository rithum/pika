/**
 * Environment Setup for Integration Tests
 *
 * This module handles loading environment variables from the app-specific .env.local file
 * and should be imported first in all integration test files to ensure proper
 * environment setup without boilerplate.
 */

import { config } from 'dotenv';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

// Find the workspace root by looking for pnpm-workspace.yaml
function findWorkspaceRoot(): string {
    let currentDir = __dirname;

    while (currentDir !== '/') {
        const workspaceFile = join(currentDir, 'pnpm-workspace.yaml');
        if (existsSync(workspaceFile)) {
            return currentDir;
        }
        currentDir = resolve(currentDir, '..');
    }

    // Fallback: assume we're in apps/pika-chat/test/integration and go up 4 levels
    return resolve(__dirname, '../../../../');
}

// Load environment variables from app-specific .env.local
function loadEnvironmentVariables(): void {
    const workspaceRoot = findWorkspaceRoot();
    const envLocalPath = join(workspaceRoot, 'apps', 'pika-chat', '.env.local');

    console.log(`Loading environment variables from: ${envLocalPath}`);

    if (existsSync(envLocalPath)) {
        const result = config({ path: envLocalPath });
        if (result.error) {
            console.error('Error loading .env.local:', result.error);
        } else {
            console.log('Successfully loaded environment variables from .env.local');

            // Log some key variables (without sensitive values)
            const keyVars = ['STAGE', 'AWS_REGION', 'CHAT_API_ID', 'CHAT_ADMIN_API_ID', 'WEBAPP_URL'];

            const loadedVars = keyVars.filter((varName) => process.env[varName]);
            if (loadedVars.length > 0) {
                console.log(`Loaded environment variables: ${loadedVars.join(', ')}`);
            }
        }
    } else {
        console.warn('No .env.local file found at:', envLocalPath);
        console.warn('Tests will use default/fallback values for environment variables');
    }

    // Validate that we have the essential environment variables
    validateEssentialEnvironmentVariables();
}

/**
 * Validate that essential environment variables are present
 */
function validateEssentialEnvironmentVariables(): void {
    const requiredEnvVars = [
        'WEBAPP_URL',
        'PIKA_S3_BUCKET',
        'STAGE',
        'CHAT_API_ID',
        'CHAT_ADMIN_API_ID',
        'AWS_REGION',
        'CONVERSE_FUNCTION_URL',
        'PIKA_SERVICE_PROJ_NAME_KEBAB_CASE',
        'PIKA_CHAT_PROJ_NAME_KEBAB_CASE',
        'TAG_DEFINITIONS_TABLE'
    ];

    const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

    if (missingEnvVars.length > 0) {
        console.warn('Missing environment variables:', missingEnvVars.join(', '));
        console.warn('Tests will use mock/default values for missing environment variables');
        console.warn('Make sure your .env.local file is properly configured');
    } else {
        console.log('All required environment variables are present');
    }
}

/**
 * Get the current environment configuration summary
 */
export function getEnvironmentSummary(): Record<string, string> {
    return {
        stage: process.env.STAGE || 'unknown',
        awsRegion: process.env.AWS_REGION || 'unknown',
        webappUrl: process.env.WEBAPP_URL || 'unknown',
        chatApiId: process.env.CHAT_API_ID || 'unknown',
        chatAdminApiId: process.env.CHAT_ADMIN_API_ID || 'unknown'
    };
}

/**
 * Check if we're running in a properly configured test environment
 */
export function isTestEnvironmentConfigured(): boolean {
    const essentialVars = ['STAGE', 'AWS_REGION', 'CHAT_API_ID', 'CHAT_ADMIN_API_ID'];
    return essentialVars.every((varName) => process.env[varName]);
}

// Auto-load environment variables when this module is imported
loadEnvironmentVariables();

// Export a marker to indicate this module has been loaded
export const ENV_SETUP_LOADED = true;
