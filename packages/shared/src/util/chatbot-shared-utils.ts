/**
 * These utilities are meant to be shared both client and server.
 * Don't add anything that can't be shared (especially dependencies)
 */

import type { ChatApp, ChatAppFeature, FeatureIdType } from '../types/chatbot/chatbot-types';
import camelcaseKeys from 'camelcase-keys';
import snakecaseKeys from 'snakecase-keys';

/**
 * Generate a unique S3 key name for a chat file upload.
 *
 * Use the uuid module to generate the v7 uuid as in
 *
 * Replace punctation that isn't _ or - with a _
 *
 * import { v7 as uuidv7 } from 'uuid';
 * uuidv7()
 *
 * @param userId - The user id of the user uploading the file
 * @param fileName - The name of the file to upload. it should already be sanitized by calling sanitizeFileName
 * @param v7Uuid - The uuidv7 uuid of the file
 * @returns The S3 key name for the file
 */
export function generateChatFileUploadS3KeyName(userId: string, fileName: string, v7Uuid: string): string {
    return `uploads/${userId}/${v7Uuid}_${fileName}`;
}

/**
 * Remove all punctuation from a file name except for the ending period for the file extension if it exists
 *
 * @param fileName - The name of the file to sanitize
 * @returns The sanitized file name
 */
export function sanitizeFileName(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');

    // If there's no dot, or the dot is at the end, or the dot is at the beginning, just remove all punctuation
    if (lastDotIndex === -1 || lastDotIndex === fileName.length - 1 || lastDotIndex === 0) {
        return fileName.replace(/[^a-zA-Z0-9_-]/g, '');
    }

    const nameWithoutExtension = fileName.substring(0, lastDotIndex);
    const extension = fileName.substring(lastDotIndex + 1);

    const sanitizedName = nameWithoutExtension.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedExtension = extension.replace(/[^a-zA-Z0-9_-]/g, '');

    return sanitizedName + '.' + sanitizedExtension;
}

type ToSnakeCase<S extends string> = S extends `${infer T}${infer U}` ? `${T extends Capitalize<T> ? '_' : ''}${Lowercase<T>}${ToSnakeCase<U>}` : S;

type ToCamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}` ? `${Lowercase<P1>}${Uppercase<P2>}${ToCamelCase<P3>}` : Lowercase<S>;

export type SnakeCase<T> = {
    [K in keyof T as K extends string ? ToSnakeCase<K> : K]: T[K] extends object ? SnakeCase<T[K]> : T[K];
};

export type CamelCase<T> = {
    [K in keyof T as K extends string ? ToCamelCase<K> : K]: T[K] extends object ? CamelCase<T[K]> : T[K];
};

export function convertToCamelCase<T extends object>(data: SnakeCase<T>): T {
    return camelcaseKeys(data, { deep: true }) as unknown as T;
}

export function convertToSnakeCase<T extends { [key: string]: any }>(data: T): SnakeCase<T> {
    return snakecaseKeys(data, { deep: true }) as SnakeCase<T>;
}

export function convertStringToSnakeCase(str: string): string {
    const tempObj = { [str]: true };
    const converted = snakecaseKeys(tempObj);
    return Object.keys(converted)[0];
}

/**
 * This lets us get a feature from a chat app and make sure it is the correct type.
 */
export function getFeature<T extends FeatureIdType>(chatApp: ChatApp, featureId: T): Extract<ChatAppFeature, { featureId: T }> | undefined {
    const feature = chatApp.features?.[featureId];

    if (feature && feature.featureId === featureId) {
        return feature as Extract<ChatAppFeature, { featureId: T }>;
    }

    return undefined;
}
