import type {
    AuthenticatedUser,
    ContentAdminData,
    RecordOrUndef,
    UserOverrideData,
} from '@pika/shared/types/chatbot/chatbot-types';
import { type RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';

// Cookie size limit (4KB = 4096 bytes)
const COOKIE_SIZE_LIMIT = 4096;
const AUTH_USER_COOKIE_NAME_PREFIX = 'au';
const USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX = 'uod'; // User Override Data
const CONTENT_ADMIN_COOKIE_NAME_PREFIX = 'cad'; // Content Admin
const COOKIE_PART_SEPARATOR = '_part_';
const ALGORITHM = 'aes-256-cbc';

const cookieTypes = ['AUTH_USER', 'USER_OVERRIDE_DATA', 'CONTENT_ADMIN'] as const;
type CookieType = (typeof cookieTypes)[number];

const cookieTypeToCookieNamePrefix: Record<CookieType, string> = {
    AUTH_USER: AUTH_USER_COOKIE_NAME_PREFIX,
    USER_OVERRIDE_DATA: USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX,
    CONTENT_ADMIN: CONTENT_ADMIN_COOKIE_NAME_PREFIX,
};

export function serializeAuthenticatedUserToCookies(
    event: RequestEvent,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    masterCookieKey: string,
    masterCookieInitVector: string
): void {
    serializeToCookies<AuthenticatedUser<RecordOrUndef, RecordOrUndef>>(
        'AUTH_USER',
        event,
        user,
        masterCookieKey,
        masterCookieInitVector
    );
}

export function serializeUserOverrideDataToCookies(
    event: RequestEvent,
    data: UserOverrideData,
    masterCookieKey: string,
    masterCookieInitVector: string
): void {
    serializeToCookies<UserOverrideData>('USER_OVERRIDE_DATA', event, data, masterCookieKey, masterCookieInitVector);
}

export function serializeContentAdminDataToCookies(
    event: RequestEvent,
    data: ContentAdminData,
    masterCookieKey: string,
    masterCookieInitVector: string
): void {
    serializeToCookies<ContentAdminData>('CONTENT_ADMIN', event, data, masterCookieKey, masterCookieInitVector);
}

export function deserializeAuthenticatedUserFromCookies(
    event: RequestEvent,
    masterCookieKey: string,
    masterCookieInitVector: string
): AuthenticatedUser<RecordOrUndef, RecordOrUndef> | undefined {
    return deserializeFromCookies<AuthenticatedUser<RecordOrUndef, RecordOrUndef>>(
        'AUTH_USER',
        event,
        masterCookieKey,
        masterCookieInitVector
    );
}

export function deserializeUserOverrideDataFromCookies(
    event: RequestEvent,
    masterCookieKey: string,
    masterCookieInitVector: string
): UserOverrideData | undefined {
    return deserializeFromCookies<UserOverrideData>(
        'USER_OVERRIDE_DATA',
        event,
        masterCookieKey,
        masterCookieInitVector
    );
}

export function deserializeContentAdminDataFromCookies(
    event: RequestEvent,
    masterCookieKey: string,
    masterCookieInitVector: string
): ContentAdminData | undefined {
    return deserializeFromCookies<ContentAdminData>('CONTENT_ADMIN', event, masterCookieKey, masterCookieInitVector);
}

export function clearAuthenticatedUserCookies(event: RequestEvent): void {
    clearCookies('AUTH_USER', event);
}

export function clearUserOverrideDataCookies(event: RequestEvent): void {
    clearCookies('USER_OVERRIDE_DATA', event);
}

export function clearContentAdminCookies(event: RequestEvent): void {
    clearCookies('CONTENT_ADMIN', event);
}

export function clearAllCookies(event: RequestEvent): void {
    for (const cookieType of cookieTypes) {
        clearCookies(cookieType, event);
    }
}

/**
 * Serializes cookie data to one or more cookies
 * If the serialized data exceeds 4KB, it will be split across multiple cookies
 */
export function serializeToCookies<T>(
    cookieType: CookieType,
    event: RequestEvent,
    data: T,
    masterCookieKey: string,
    masterCookieInitVector: string
): void {
    const dataJson = JSON.stringify(data);
    const encryptedData = encryptCookieString(dataJson, masterCookieKey, masterCookieInitVector);
    const cookieNamePrefix = cookieTypeToCookieNamePrefix[cookieType];

    // Check if the encrypted data fits in a single cookie
    if (encryptedData.length <= COOKIE_SIZE_LIMIT) {
        // Single cookie approach
        event.cookies.set(cookieNamePrefix, encryptedData, {
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

        event.cookies.set(cookieNamePrefix, JSON.stringify(metadata), {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
        });

        // Set each chunk as a separate cookie
        chunks.forEach((chunk, index) => {
            const cookieName = `${cookieNamePrefix}${COOKIE_PART_SEPARATOR}${index}`;
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
 * Deserializes cookie data from cookies
 * Handles both single-cookie and multi-cookie scenarios (multiple cookies for large data)
 */
export function deserializeFromCookies<T>(
    cookieType: CookieType,
    event: RequestEvent,
    masterCookieKey: string,
    masterCookieInitVector: string
): T | undefined {
    const cookieNamePrefix = cookieTypeToCookieNamePrefix[cookieType];
    const mainCookie = event.cookies.get(cookieNamePrefix);

    if (!mainCookie) {
        return undefined;
    }

    try {
        // Try to parse as metadata first (multi-cookie scenario)
        const metadata = JSON.parse(mainCookie);

        if (metadata.totalParts && metadata.totalSize) {
            // Multi-cookie scenario
            return deserializeFromMultipleCookies<T>(event, metadata, masterCookieKey, masterCookieInitVector);
        } else {
            // Single cookie scenario (small data)
            const decryptedData = decryptCookieString(mainCookie, masterCookieKey, masterCookieInitVector);
            return JSON.parse(decryptedData);
        }
    } catch (error) {
        // If JSON.parse fails, it might be a single encrypted cookie
        try {
            const decryptedData = decryptCookieString(mainCookie, masterCookieKey, masterCookieInitVector);
            return JSON.parse(decryptedData);
        } catch (decryptError) {
            console.error(`Failed to deserialize user from cookies for cookie type ${cookieType}:`, error);
            return undefined;
        }
    }
}

/**
 * Clears all authentication-related cookies
 */
export function clearCookies(cookieType: CookieType, event: RequestEvent): void {
    const cookieNamePrefix = cookieTypeToCookieNamePrefix[cookieType];
    // Clear the main cookie
    event.cookies.delete(cookieNamePrefix, { path: '/' });

    // Clear any part cookies (for multi-cookie scenarios)
    const allCookies = event.cookies.getAll();
    allCookies.forEach((cookie) => {
        if (cookie.name.startsWith(`${cookieNamePrefix}${COOKIE_PART_SEPARATOR}`)) {
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
