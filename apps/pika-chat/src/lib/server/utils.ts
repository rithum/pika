import type { ErrorResponse, SuccessResponse } from '$client/app/types';
import { AUTHENTICATED_USER_COOKIE_NAME, type AuthData } from '$lib/shared-types';
import { json, type RequestEvent } from '@sveltejs/kit';
import type {
    AuthenticatedUser,
    ChatUser,
    RecordOrUndef,
    UserOverrideData,
} from '@pika/shared/types/chatbot/chatbot-types';
import { siteFeatures } from '$lib/server/custom-site-features';

export function getErrorResponse(status: number, error: string): Response {
    const err: ErrorResponse = {
        success: false,
        error,
    };
    return json(err, { status });
}

export function getSuccessResponse(): Response {
    const success: SuccessResponse = {
        success: true,
    };
    return json(success);
}

export function addSecurityHeaders(response: Response): Response {
    // TODO: Change this to only allow embedding from the enterprise site
    //response.headers.set('Content-Security-Policy', "frame-ancestors 'self' *.dsco.io http://localhost:*");
    response.headers.set('Content-Security-Policy', 'frame-ancestors *');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-XSS-Protection', '1; mode=block'); // Note: X-XSS-Protection is deprecated by modern browsers, consider CSP.
    response.headers.set('Referrer-Policy', 'strict-origin');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    response.headers.append(
        'Permissions-Policy',
        'geolocation=(self), ' +
            'microphone=(self), ' +
            'camera=(self), ' +
            'midi=(self), ' +
            'fullscreen=(self), ' +
            'accelerometer=(self), ' +
            'gyroscope=(self), ' +
            'magnetometer=(self), ' +
            'publickey-credentials-get=(self), ' +
            'sync-xhr=(self), ' +
            'usb=(self), ' +
            'serial=(self), ' +
            'xr-spatial-tracking=(self), ' +
            'payment=(self), ' +
            'picture-in-picture=(self)'
    );
    return response;
}

export function concatUrlWithPath(baseUrl: string, path: string): string {
    const url = new URL(baseUrl);
    url.pathname = path;
    return url.toString();
}

import crypto from 'crypto';

// --- SECURITY WARNING ---
// The FIXED_IV_HEX *MUST* be the securely generated and stored IV
// that corresponds to your masterKey.
// It is STRONGLY recommended to load this from a secure environment
// variable, similar to how you would load the masterKey,
// rather than hardcoding it directly in your source code,
// unless this module itself is highly protected and configured.
// This IV should be 16 bytes, represented as a 32-character hex string.
// Example: 'YOUR_SECURELY_GENERATED_16_BYTE_IV_IN_HEX_FORMAT'
const FIXED_IV_HEX = process.env.COOKIE_ENCRYPTION_IV_HEX; // Example of loading from env

const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypts a plaintext string using AES-256-CBC.
 *
 * @param plainTextCookieString The string to encrypt.
 * @param masterKeyHex The master encryption key (32 bytes) as a hexadecimal string.
 * @returns The encrypted string (ciphertext) as a hexadecimal string.
 * @throws Error if encryption fails or if the IV is not configured.
 */
export function encryptCookieString(
    plainTextCookieString: string,
    masterKeyHex: string,
    masterCookieInitVector: string
): string {
    try {
        const key = Buffer.from(masterKeyHex, 'hex');
        const iv = Buffer.from(masterCookieInitVector, 'hex');

        if (key.length !== 32) {
            throw new Error('Invalid masterKey length. Must be a 32-byte hex string (64 characters).');
        }
        if (iv.length !== 16) {
            throw new Error('Invalid IV length. Must be a 16-byte hex string (32 characters).');
        }

        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(plainTextCookieString, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (e) {
        console.error('Encryption failed:', e);
        throw new Error(`Encryption failed: ${e instanceof Error ? e.message : e}`);
    }
}

/**
 * Decrypts an AES-256-CBC encrypted hexadecimal string.
 *
 * @param encryptedCookieStringHex The encrypted string (ciphertext) as a hexadecimal string.
 * @param masterKeyHex The master encryption key (32 bytes) as a hexadecimal string.
 * @returns The decrypted plaintext string.
 * @throws Error if decryption fails or if the IV is not configured.
 */
export function decryptCookieString(
    encryptedCookieStringHex: string,
    masterKeyHex: string,
    masterCookieInitVector: string
): string {
    try {
        const key = Buffer.from(masterKeyHex, 'hex');
        const iv = Buffer.from(masterCookieInitVector, 'hex');

        if (key.length !== 32) {
            throw new Error('Invalid masterKey length. Must be a 32-byte hex string (64 characters).');
        }
        if (iv.length !== 16) {
            throw new Error('Invalid IV length. Must be a 16-byte hex string (32 characters).');
        }

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encryptedCookieStringHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('Decryption failed:', e);
        throw new Error(`Decryption failed: ${e instanceof Error ? e.message : e}`);
    }
}

// Cookie size limit (4KB = 4096 bytes)
const COOKIE_SIZE_LIMIT = 4096;
const AUTH_USER_COOKIE_NAME_PREFIX = 'au'; // Authenticated User
const COOKIE_PART_SEPARATOR = '_part_';

/**
 * Serializes an AuthenticatedUser object to one or more cookies
 * If the serialized data exceeds 4KB, it will be split across multiple cookies
 */
export function serializeAuthenticatedUserToCookies(
    event: RequestEvent,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    masterCookieKey: string,
    masterCookieInitVector: string
): void {
    // Serialize the user object to JSON
    const userJson = JSON.stringify(user);

    // Encrypt the JSON string
    const encryptedData = encryptCookieString(userJson, masterCookieKey, masterCookieInitVector);

    // Check if the encrypted data fits in a single cookie
    if (encryptedData.length <= COOKIE_SIZE_LIMIT) {
        // Single cookie approach
        event.cookies.set(AUTHENTICATED_USER_COOKIE_NAME, encryptedData, {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
        });
    } else {
        // Multi-cookie approach - split the encrypted data
        const chunks = splitStringIntoChunks(encryptedData, COOKIE_SIZE_LIMIT);

        // Set the main cookie with metadata
        const metadata = {
            totalParts: chunks.length,
            totalSize: encryptedData.length,
            timestamp: Date.now(),
        };

        event.cookies.set(AUTHENTICATED_USER_COOKIE_NAME, JSON.stringify(metadata), {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
        });

        // Set each chunk as a separate cookie
        chunks.forEach((chunk, index) => {
            const cookieName = `${AUTH_USER_COOKIE_NAME_PREFIX}${COOKIE_PART_SEPARATOR}${index}`;
            event.cookies.set(cookieName, chunk, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
            });
        });
    }
}

/**
 * Deserializes an AuthenticatedUser object from cookies
 * Handles both single-cookie and multi-cookie scenarios
 */
export function deserializeAuthenticatedUserFromCookies(
    event: RequestEvent,
    masterCookieKey: string,
    masterCookieInitVector: string
): AuthenticatedUser<RecordOrUndef, RecordOrUndef> | undefined {
    const mainCookie = event.cookies.get(AUTHENTICATED_USER_COOKIE_NAME);

    if (!mainCookie) {
        return undefined;
    }

    try {
        // Try to parse as metadata first (multi-cookie scenario)
        const metadata = JSON.parse(mainCookie);

        if (metadata.totalParts && metadata.totalSize) {
            // Multi-cookie scenario
            return deserializeFromMultipleCookies<AuthenticatedUser<RecordOrUndef, RecordOrUndef>>(
                event,
                metadata,
                masterCookieKey,
                masterCookieInitVector
            );
        } else {
            // Single cookie scenario (legacy or small data)
            const decryptedData = decryptCookieString(mainCookie, masterCookieKey, masterCookieInitVector);
            return JSON.parse(decryptedData);
        }
    } catch (error) {
        // If JSON.parse fails, it might be a single encrypted cookie
        try {
            const decryptedData = decryptCookieString(mainCookie, masterCookieKey, masterCookieInitVector);
            return JSON.parse(decryptedData);
        } catch (decryptError) {
            console.error('Failed to deserialize user from cookies:', error);
            return undefined;
        }
    }
}

/**
 * Clears all authentication-related cookies
 */
export function clearAuthenticatedUserCookies(event: RequestEvent): void {
    // Clear the main cookie
    event.cookies.delete(AUTHENTICATED_USER_COOKIE_NAME, { path: '/' });

    // Clear any part cookies (for multi-cookie scenarios)
    const allCookies = event.cookies.getAll();
    allCookies.forEach((cookie) => {
        if (cookie.name.startsWith(`${AUTH_USER_COOKIE_NAME_PREFIX}${COOKIE_PART_SEPARATOR}`)) {
            event.cookies.delete(cookie.name, { path: '/' });
        }
    });
}

const USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX = 'uod'; // User Override Data

/**
 * Serializes an AuthenticatedUser object to one or more cookies
 * If the serialized data exceeds 4KB, it will be split across multiple cookies
 */
export function serializeUserOverrideDataToCookies(
    event: RequestEvent,
    data: UserOverrideData,
    masterCookieKey: string,
    masterCookieInitVector: string
): void {
    // Serialize the data object to JSON
    const dataJson = JSON.stringify(data);

    // Encrypt the JSON string
    const encryptedData = encryptCookieString(dataJson, masterCookieKey, masterCookieInitVector);

    // Check if the encrypted data fits in a single cookie
    if (encryptedData.length <= COOKIE_SIZE_LIMIT) {
        // Single cookie approach
        event.cookies.set(USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX, encryptedData, {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
        });
    } else {
        // Multi-cookie approach - split the encrypted data
        const chunks = splitStringIntoChunks(encryptedData, COOKIE_SIZE_LIMIT);

        // Set the main cookie with metadata
        const metadata = {
            totalParts: chunks.length,
            totalSize: encryptedData.length,
            timestamp: Date.now(),
        };

        event.cookies.set(USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX, JSON.stringify(metadata), {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
        });

        // Set each chunk as a separate cookie
        chunks.forEach((chunk, index) => {
            const cookieName = `${USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX}${COOKIE_PART_SEPARATOR}${index}`;
            event.cookies.set(cookieName, chunk, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
            });
        });
    }
}

/**
 * Deserializes an AuthenticatedUser object from cookies
 * Handles both single-cookie and multi-cookie scenarios
 */
export function deserializeUserOverrideDataFromCookies(
    event: RequestEvent,
    masterCookieKey: string,
    masterCookieInitVector: string
): UserOverrideData | undefined {
    const mainCookie = event.cookies.get(USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX);

    if (!mainCookie) {
        return undefined;
    }

    try {
        // Try to parse as metadata first (multi-cookie scenario)
        const metadata = JSON.parse(mainCookie);

        if (metadata.totalParts && metadata.totalSize) {
            // Multi-cookie scenario
            return deserializeFromMultipleCookies<UserOverrideData>(
                event,
                metadata,
                masterCookieKey,
                masterCookieInitVector
            );
        } else {
            // Single cookie scenario (legacy or small data)
            const decryptedData = decryptCookieString(mainCookie, masterCookieKey, masterCookieInitVector);
            return JSON.parse(decryptedData);
        }
    } catch (error) {
        // If JSON.parse fails, it might be a single encrypted cookie
        try {
            const decryptedData = decryptCookieString(mainCookie, masterCookieKey, masterCookieInitVector);
            return JSON.parse(decryptedData);
        } catch (decryptError) {
            console.error('Failed to deserialize user override data from cookies:', error);
            return undefined;
        }
    }
}

/**
 * Clears all authentication-related cookies
 */
export function clearUserOverrideDataCookies(event: RequestEvent): void {
    // Clear the main cookie
    event.cookies.delete(USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX, { path: '/' });

    // Clear any part cookies (for multi-cookie scenarios)
    const allCookies = event.cookies.getAll();
    allCookies.forEach((cookie) => {
        if (cookie.name.startsWith(`${USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX}${COOKIE_PART_SEPARATOR}`)) {
            event.cookies.delete(cookie.name, { path: '/' });
        }
    });
}

/**
 * Splits a string into chunks of specified size
 */
function splitStringIntoChunks(str: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += chunkSize) {
        chunks.push(str.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Deserializes user data from multiple cookies
 */
function deserializeFromMultipleCookies<T>(
    event: RequestEvent,
    metadata: { totalParts: number; totalSize: number; timestamp: number },
    masterCookieKey: string,
    masterCookieInitVector: string
): T {
    // Collect all parts
    const parts: string[] = [];
    for (let i = 0; i < metadata.totalParts; i++) {
        const cookieName = `${AUTH_USER_COOKIE_NAME_PREFIX}${COOKIE_PART_SEPARATOR}${i}`;
        const part = event.cookies.get(cookieName);

        if (!part) {
            throw new Error(`Missing cookie part ${i}`);
        }

        parts.push(part);
    }

    // Reconstruct the encrypted data
    const encryptedData = parts.join('');

    // Verify the size matches
    if (encryptedData.length !== metadata.totalSize) {
        throw new Error('Cookie data size mismatch');
    }

    // Decrypt and parse
    const decryptedData = decryptCookieString(encryptedData, masterCookieKey, masterCookieInitVector);
    return JSON.parse(decryptedData);
}

/**
 * If someone has added pika:xxx roles to the chat user database that may have been added indepently of the auth provider, we need to merge them in
 * to the authenticated user object.
 *
 * @param authenticatedUser - The authenticated user object
 * @param existingChatUser - The existing chat user object
 * @returns The merged authenticated user object
 */
export function mergeAuthenticatedUserWithExistingChatUser(
    authenticatedUser: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    existingChatUser: ChatUser<RecordOrUndef>
): void {
    if (existingChatUser.roles && existingChatUser.roles.length > 0) {
        const pikaRoles = existingChatUser.roles.filter((role) => role.startsWith('pika:'));
        if (pikaRoles.length > 0) {
            if (!authenticatedUser.roles) {
                authenticatedUser.roles = [];
            }
            // Add any missing roles to the authenticated user
            for (const role of pikaRoles) {
                if (!authenticatedUser.roles?.includes(role)) {
                    authenticatedUser.roles.push(role);
                }
            }
        }
    }
}

/**
 * Whether the user is allowed to use the user data overrides feature.
 *
 * @param user - The user to check
 * @returns Whether the user is allowed to use the user data overrides feature
 */
export function isUserAllowedToUseUserDataOverrides(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): boolean {
    let result = siteFeatures?.userDataOverrides?.enabled ?? false;
    if (result) {
        // If they didn't specify whom to turn this feature on for, we default it to be only for internal users
        const userTypesAllowed = siteFeatures?.userDataOverrides?.userTypesAllowed ?? ['internal-user'];
        // If there is no user type on the logged in user, we assume they are an external user
        if (!userTypesAllowed.includes(user.userType ?? 'external-user')) {
            result = false;
        }
    }
    return result;
}

/**
 * Determines whether a user needs to provide data overrides before accessing a chat app.
 *
 * This function checks if the user is allowed to use the user data overrides feature and
 * whether any required custom data attributes are missing, null, undefined, or empty from their user object.
 *
 * @param user - The authenticated user object to check
 * @returns `true` if the user needs to provide data overrides, `false` otherwise
 *
 * @example
 * ```ts
 * // Simple attributes (no dots) - checks direct properties
 * const user = { id: '123', customData: { companyName: 'Acme', companyId: '' } };
 * // If config requires ['companyName', 'companyId']
 * const needsOverrides = doesUserNeedToProvideDataOverrides(user);
 * // Returns true because 'companyId' is empty string
 * ```
 *
 * @example
 * ```ts
 * // Nested attributes with dot notation
 * const user = { id: '123', customData: { address: { street: '123 Main St' } } };
 * // If config requires ['address.city', 'address.street']
 * const needsOverrides = doesUserNeedToProvideDataOverrides(user);
 * // Returns true because 'address.city' is missing
 * ```
 */
export function doesUserNeedToProvideDataOverrides(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): boolean {
    // First check if the user is even allowed to use the user data overrides feature
    if (!isUserAllowedToUseUserDataOverrides(user)) {
        return false;
    }

    const attributes = siteFeatures?.userDataOverrides?.promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing ?? [];

    // If no attributes are configured to check, then no overrides are needed
    if (attributes.length === 0) {
        return false;
    }

    // If the user doesn't have a customData object, they need to provide data overrides
    if (!user.customData) {
        return true;
    }

    // Check if any of the required attributes are missing
    for (const attribute of attributes) {
        // Dereference the attribute understanding they may have used dot notation
        const attributeParts = attribute.split('.');
        let currentValue: any = user.customData;

        // Navigate through nested object properties
        for (const part of attributeParts) {
            if (currentValue === null || currentValue === undefined || typeof currentValue !== 'object') {
                return true; // Path doesn't exist or we hit a non-object value
            }
            currentValue = currentValue[part];
        }

        // Check if the final value exists and is not null/undefined
        if (currentValue === null || currentValue === undefined || currentValue === '') {
            return true; // Required attribute is missing
        }
    }

    return false;
}
