/**
 * Utility functions for processing and applying AWS CDK stack tags
 */

import { PikaConfig } from 'pika-shared/types/chatbot/chatbot-types.js';

/**
 * Interpolates dynamic placeholders in tag values
 *
 * @param tags The tag object from pika-config.ts
 * @param context Values to substitute for placeholders
 * @returns New tags object with interpolated values
 */
export function interpolateStackTags(
    tags: Record<string, string>,
    context: {
        stage: string;
        accountId: string;
        region: string;
        timestamp?: string;
        pikaConfig: PikaConfig;
    }
): Record<string, string> {
    const timestamp = context.timestamp || new Date().toISOString();

    const interpolated: Record<string, string> = {};

    for (const [key, value] of Object.entries(tags)) {
        let interpolatedValue = value;

        // Replace basic placeholders
        interpolatedValue = interpolatedValue.replace(/\{stage\}/g, context.stage);
        interpolatedValue = interpolatedValue.replace(/\{accountId\}/g, context.accountId);
        interpolatedValue = interpolatedValue.replace(/\{region\}/g, context.region);
        interpolatedValue = interpolatedValue.replace(/\{timestamp\}/g, timestamp);

        // Replace pika project name placeholders
        interpolatedValue = interpolatedValue.replace(/\{pika\.projNameL\}/g, context.pikaConfig.pika.projNameL);
        interpolatedValue = interpolatedValue.replace(/\{pika\.projNameKebabCase\}/g, context.pikaConfig.pika.projNameKebabCase);
        interpolatedValue = interpolatedValue.replace(/\{pika\.projNameTitleCase\}/g, context.pikaConfig.pika.projNameTitleCase);
        interpolatedValue = interpolatedValue.replace(/\{pika\.projNameCamel\}/g, context.pikaConfig.pika.projNameCamel);
        interpolatedValue = interpolatedValue.replace(/\{pika\.projNameHuman\}/g, context.pikaConfig.pika.projNameHuman);

        // Replace pikaChat project name placeholders
        interpolatedValue = interpolatedValue.replace(/\{pikaChat\.projNameL\}/g, context.pikaConfig.pikaChat.projNameL);
        interpolatedValue = interpolatedValue.replace(/\{pikaChat\.projNameKebabCase\}/g, context.pikaConfig.pikaChat.projNameKebabCase);
        interpolatedValue = interpolatedValue.replace(/\{pikaChat\.projNameTitleCase\}/g, context.pikaConfig.pikaChat.projNameTitleCase);
        interpolatedValue = interpolatedValue.replace(/\{pikaChat\.projNameCamel\}/g, context.pikaConfig.pikaChat.projNameCamel);
        interpolatedValue = interpolatedValue.replace(/\{pikaChat\.projNameHuman\}/g, context.pikaConfig.pikaChat.projNameHuman);

        interpolated[key] = interpolatedValue;
    }

    return interpolated;
}

/**
 * Validates AWS tag keys according to AWS naming conventions
 * Returns warnings for invalid tag keys
 *
 * AWS Tag Key Rules:
 * - Maximum of 128 characters
 * - Can include letters, numbers, spaces, and these characters: _ . : / = + - @
 * - Case-sensitive
 *
 * @param tags The tags object to validate
 * @returns Array of warning messages (empty if all valid)
 */
export function validateTagKeys(tags: Record<string, string>): string[] {
    const warnings: string[] = [];

    for (const key of Object.keys(tags)) {
        // Check length
        if (key.length > 128) {
            warnings.push(`Tag key "${key}" exceeds 128 characters (${key.length} chars)`);
        }

        // Check for invalid characters (AWS allows: letters, numbers, spaces, _ . : / = + - @)
        const validPattern = /^[a-zA-Z0-9\s_.:/=+\-@]*$/;
        if (!validPattern.test(key)) {
            warnings.push(`Tag key "${key}" contains invalid characters. Only letters, numbers, spaces, and _ . : / = + - @ are allowed`);
        }

        // Check if it starts with 'aws:' (reserved prefix)
        if (key.toLowerCase().startsWith('aws:')) {
            warnings.push(`Tag key "${key}" uses reserved prefix "aws:"`);
        }
    }

    return warnings;
}

/**
 * Validates AWS tag values according to AWS naming conventions
 * Returns warnings for invalid tag values
 *
 * AWS Tag Value Rules:
 * - Maximum of 256 characters
 * - Can include letters, numbers, spaces, and these characters: _ . : / = + - @
 *
 * @param tags The tags object to validate
 * @returns Array of warning messages (empty if all valid)
 */
export function validateTagValues(tags: Record<string, string>): string[] {
    const warnings: string[] = [];

    for (const [key, value] of Object.entries(tags)) {
        // Check length
        if (value.length > 256) {
            warnings.push(`Tag value for key "${key}" exceeds 256 characters (${value.length} chars)`);
        }

        // Check for invalid characters
        const validPattern = /^[a-zA-Z0-9\s_.:/=+\-@]*$/;
        if (!validPattern.test(value)) {
            warnings.push(`Tag value for key "${key}" contains invalid characters. Only letters, numbers, spaces, and _ . : / = + - @ are allowed`);
        }
    }

    return warnings;
}

/**
 * Validates all tags (both keys and values) and logs warnings
 *
 * @param tags The tags object to validate
 * @param stackName Optional stack name for better logging context
 */
export function validateAndWarnTags(tags: Record<string, string>, stackName?: string): void {
    const keyWarnings = validateTagKeys(tags);
    const valueWarnings = validateTagValues(tags);
    const allWarnings = [...keyWarnings, ...valueWarnings];

    if (allWarnings.length > 0) {
        const prefix = stackName ? `[${stackName}] ` : '';
        console.warn(`${prefix}Stack tag validation warnings:`);
        allWarnings.forEach((warning) => console.warn(`  - ${warning}`));
    }
}

